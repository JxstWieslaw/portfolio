'use client'

import { useEffect, useRef } from 'react'
import { readCapabilities, resolveRung } from '@/lib/formations/fallback'
import { dampFrame, freeRect, heroFrame, type HeroFrame } from '@/lib/hero/frame'
import { governorStep, initialGovernor, percentile, type GovernorPhase, type GovernorState } from '@/lib/hero/governor'
import { assemblyS, cameraFor, heroWeight, loadAt, LOAD_SECONDS, scrollP, type Pointer } from '@/lib/hero/progress'
import { initialTier, TIERS, tierOverride, type HeroTier } from '@/lib/hero/tiers'
import { HeroEngine, type EngineTier } from './HeroEngine'

/**
 * The hero layer — hero monolith spec § 3 and § 4.1.
 *
 * Lives in its own lazy chunk (`hero`), so everything here, the engine
 * included, costs the initial bundle nothing. It owns one canvas behind the
 * R3F canvas, the single rAF loop, the scroll, pointer and layout reads, the
 * frame governor, context loss, and the release of the GL context once the
 * hero has been out of view for a while. `AssemblyLayer` mounts it after the
 * LCP gate, only when the flag is on and the gate says yes.
 *
 * `html[data-hero]` is `live` after the first presented frame and `poster`
 * once the layer has given up; `html[data-hero-tier]` carries the tier.
 */

const SEAM_ENABLED: boolean = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_MODEL_TEST === '1'

interface HeroSeam {
  readonly errors: readonly string[]
  readonly frames: number
  readonly tier: number
  readonly lost: number
  readonly ready: boolean
}

declare global {
  interface Window {
    /** Test seam: shader logs, presented frames and the tier. Same switch and guard as the model seam. */
    __ASSEMBLY_HERO__?: HeroSeam
  }
}

const FLOOR_KEY = 'hero-floor'
/** Out of view this long, the GL context is released. */
const RELEASE_AFTER_MS = 8000
/** The loop counts as continuous for this long after a scroll, pointer or resize. */
const ACTIVE_MS = 400
/** An interval longer than this is a hidden tab or a hitch, not a frame budget sample. */
const MAX_SAMPLE_MS = 250

/** Once the hero has given up it stays off for the session, across remounts. */
let gaveUp = false

const root = (): HTMLElement => document.documentElement
const setMark = (name: string, value: string | null): void => {
  if (value === null) root().removeAttribute(name)
  else root().setAttribute(name, value)
}

type Status = 'starting' | 'live' | 'paused' | 'lost' | 'gone'

class HeroController {
  private status: Status = 'gone'
  private engine: HeroEngine | null = null
  private canvas: HTMLCanvasElement | null = null
  private hud: HTMLElement | null = null
  private hudTimer = 0
  private releaseTimer = 0
  private raf = 0
  private generation = 0
  private stopped = false
  private lostCount = 0

  private tier: HeroTier
  private governor: GovernorState
  private readonly override: HeroTier | null
  private readonly fine: boolean
  private readonly freeze: { t: number; s: number } | null
  private readonly grain: number
  private readonly perf: boolean

  private frames = 0
  private t0 = -1
  private lastRender = 0
  private lastPhase: GovernorPhase = 'idle'
  private activeAt = -1e9
  private intervals: number[] = []
  private firstShown = false

  private frame: HeroFrame = { cx: 0.5, cy: 0.5, zoom: 1 }
  private target: HeroFrame = { cx: 0.5, cy: 0.5, zoom: 1 }
  private pointer: Pointer = { x: 0.5, y: 0.5, active: 0 }
  private pointerGoal = { x: 0.5, y: 0.5, on: 0 }
  private lastOpacity = -1
  private panelObserver: ResizeObserver | null = null

  constructor(
    private readonly host: HTMLElement,
    private readonly onGiveUp: () => void,
  ) {
    const params = new URLSearchParams(window.location.search)
    this.override = tierOverride(window.location.search)
    this.perf = params.get('perf') === '1'
    this.fine = window.matchMedia('(pointer: fine)').matches
    const caps = readCapabilities(document.createElement('canvas'))
    this.tier = initialTier({
      rung: resolveRung(caps),
      finePointer: this.fine,
      cores: navigator.hardwareConcurrency > 0 ? navigator.hardwareConcurrency : null,
      lowPower: caps.lowPower,
      override: this.override,
    })
    this.governor = initialGovernor(this.tier)

    let freeze: { t: number; s: number } | null = null
    let grain = 1
    if (SEAM_ENABLED) {
      const [t, s] = (params.get('freeze') ?? '').split(',').map(Number)
      if (Number.isFinite(t) && Number.isFinite(s)) freeze = { t: t as number, s: s as number }
      if (params.get('grain') === '0') grain = 0
    }
    this.freeze = freeze
    this.grain = grain
    if (SEAM_ENABLED) {
      const seam = {}
      Object.defineProperties(seam, {
        errors: { enumerable: true, get: (): readonly string[] => this.engine?.errors ?? [] },
        frames: { enumerable: true, get: (): number => this.frames },
        tier: { enumerable: true, get: (): number => this.tier },
        lost: { enumerable: true, get: (): number => this.lostCount },
        ready: { enumerable: true, get: (): boolean => this.firstShown },
      })
      window.__ASSEMBLY_HERO__ = seam as HeroSeam
    }
  }

  // --------------------------------------------------------------- lifecycle

  start(): void {
    if (gaveUp) return this.giveUp(false)
    try {
      if (this.override === null && window.sessionStorage.getItem(FLOOR_KEY) === '1') return this.giveUp(false)
    } catch {
      // Storage blocked: carry on without the floor memory.
    }
    window.addEventListener('scroll', this.onActivity, { passive: true })
    window.addEventListener('resize', this.onResize, { passive: true })
    document.addEventListener('visibilitychange', this.onVisibility)
    if (this.fine) window.addEventListener('pointermove', this.onPointer, { passive: true })
    const panel = document.querySelector('[data-hero-panel]')
    if (panel && typeof ResizeObserver !== 'undefined') {
      this.panelObserver = new ResizeObserver(this.onResize)
      this.panelObserver.observe(panel)
    }
    setMark('data-hero-tier', String(this.tier))
    if (this.perf) this.startHud()
    void this.begin()
  }

  stop(): void {
    this.stopped = true
    this.teardown(true)
    window.removeEventListener('scroll', this.onActivity)
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('pointermove', this.onPointer)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.panelObserver?.disconnect()
    this.panelObserver = null
    window.clearInterval(this.hudTimer)
    this.hud?.remove()
    this.hud = null
    setMark('data-hero', null)
    setMark('data-hero-tier', null)
    if (SEAM_ENABLED) delete window.__ASSEMBLY_HERO__
  }

  private currentWeight(): number {
    return heroWeight(scrollP(window.scrollY, window.innerHeight))
  }

  /** Creates (or re-creates) the engine on the current canvas, compiles, primes, and starts the loop. */
  private async begin(): Promise<void> {
    if (this.stopped || this.status === 'starting') return
    if (this.currentWeight() <= 0 && this.freeze === null) {
      // Landed past the hero (a hash link, a restored scroll): do not spend a context on it.
      this.status = 'paused'
      return
    }
    this.status = 'starting'
    const generation = ++this.generation
    try {
      if (!this.canvas) {
        const canvas = document.createElement('canvas')
        canvas.setAttribute('data-hero-canvas', '')
        canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0'
        canvas.addEventListener('webglcontextlost', this.onLost)
        canvas.addEventListener('webglcontextrestored', this.onRestored)
        this.host.appendChild(canvas)
        this.canvas = canvas
      }
      const tier = Math.max(1, this.tier) as EngineTier
      const engine = HeroEngine.create(this.canvas, tier)
      if (!engine) return this.giveUp()
      this.engine = engine
      this.measure(true)
      const ok = await engine.compile()
      if (generation !== this.generation || this.stopped) return
      if (!ok) return this.giveUp()
      engine.prime(this.frame, cameraFor(1, 0, 0, this.pointer))
      this.status = 'live'
      this.lastRender = 0
      this.t0 = -1
      this.firstShown = false
      this.raf = requestAnimationFrame(this.tick)
    } catch {
      if (generation === this.generation && !this.stopped) this.giveUp()
    }
  }

  /** Stops drawing and frees the GL objects; `canvas` also drops the element so a fresh context can follow. */
  private teardown(canvas: boolean, release = true): void {
    cancelAnimationFrame(this.raf)
    this.raf = 0
    window.clearTimeout(this.releaseTimer)
    this.generation += 1
    this.engine?.dispose(release)
    this.engine = null
    if (canvas && this.canvas) {
      this.canvas.removeEventListener('webglcontextlost', this.onLost)
      this.canvas.removeEventListener('webglcontextrestored', this.onRestored)
      this.canvas.remove()
      this.canvas = null
    }
  }

  private giveUp(notify = true): void {
    gaveUp = true
    this.teardown(true)
    this.status = 'gone'
    setMark('data-hero', 'poster')
    if (notify) this.onGiveUp()
    else queueMicrotask(this.onGiveUp)
  }

  // -------------------------------------------------------------------- loop

  private readonly tick = (now: number): void => {
    this.raf = 0
    const engine = this.engine
    if (!engine || this.status !== 'live' || this.stopped) return

    const p = this.freeze ? 0 : scrollP(window.scrollY, window.innerHeight)
    const weight = this.freeze ? 1 : heroWeight(p)
    if (weight <= 0) return this.pause()

    if (this.t0 < 0) this.t0 = now
    const elapsed = (now - this.t0) / 1000
    const phase: GovernorPhase =
      now - this.activeAt < ACTIVE_MS ? 'scroll' : elapsed < LOAD_SECONDS + 0.4 && !this.freeze ? 'assembly' : 'idle'
    const spec = TIERS[engine.info.tier]
    const interval = now - this.lastRender
    if (phase === 'idle' && interval < 1000 / spec.idleFps - 3) {
      this.raf = requestAnimationFrame(this.tick)
      return
    }
    const dt = this.lastRender > 0 ? Math.min(interval / 1000, 0.1) : 1 / 60

    // Pointer and layout damp toward their goals.
    const k = 1 - Math.exp(-dt * 5)
    this.pointer = {
      x: this.pointer.x + (this.pointerGoal.x - this.pointer.x) * k,
      y: this.pointer.y + (this.pointerGoal.y - this.pointer.y) * k,
      active: this.pointer.active + (this.pointerGoal.on - this.pointer.active) * k,
    }
    this.frame = this.freeze ? this.target : dampFrame(this.frame, this.target, dt)

    const time = this.freeze ? this.freeze.t : elapsed + 1
    const s = this.freeze ? this.freeze.s : assemblyS(loadAt(elapsed), p)
    engine.render({ time, s, camera: cameraFor(s, p, time, this.pointer), frame: this.frame, grain: this.grain })
    this.frames += 1

    if (!this.firstShown) {
      this.firstShown = true
      const canvas = this.canvas
      // One frame after the first one is presented, so the marker never leads the pixels.
      requestAnimationFrame(() => {
        if (!canvas || canvas !== this.canvas) return
        canvas.style.transition = 'opacity 500ms ease-out'
        this.setOpacity(weight)
        setMark('data-hero', 'live')
        window.setTimeout(() => {
          canvas.style.transition = 'none'
        }, 600)
      })
    } else {
      this.setOpacity(weight)
    }

    if (phase !== 'idle' && this.lastPhase !== 'idle' && interval <= MAX_SAMPLE_MS && this.lastRender > 0) {
      this.intervals.push(interval)
      if (this.intervals.length > 120) this.intervals.shift()
      if (this.override === null) this.govern(interval, phase)
    }
    this.lastPhase = phase
    this.lastRender = now
    if (this.status === 'live') this.raf = requestAnimationFrame(this.tick)
  }

  private setOpacity(weight: number): void {
    if (!this.canvas || Math.abs(weight - this.lastOpacity) < 0.01) return
    this.lastOpacity = weight
    this.canvas.style.opacity = weight.toFixed(2)
  }

  private govern(interval: number, phase: GovernorPhase): void {
    const next = governorStep(this.governor, interval, phase)
    this.governor = next
    if (next.tier === this.tier) return
    this.tier = next.tier
    setMark('data-hero-tier', String(next.tier))
    if (next.tier === 0) {
      try {
        window.sessionStorage.setItem(FLOOR_KEY, '1')
      } catch {
        // Storage blocked: the floor is just not remembered.
      }
      return this.giveUp()
    }
    this.engine?.setTier(next.tier as EngineTier)
  }

  /** Out of view: stop drawing, and release the GL context if the visitor stays away. */
  private pause(): void {
    this.status = 'paused'
    this.setOpacity(0)
    window.clearTimeout(this.releaseTimer)
    this.releaseTimer = window.setTimeout(() => {
      if (this.status !== 'paused') return
      this.teardown(true)
      this.status = 'gone'
      setMark('data-hero', null)
    }, RELEASE_AFTER_MS)
  }

  private wake(): void {
    window.clearTimeout(this.releaseTimer)
    this.lastPhase = 'idle'
    if (this.engine && this.status === 'paused') {
      this.status = 'live'
      this.lastRender = 0
      this.raf = requestAnimationFrame(this.tick)
    } else if (this.status === 'gone' || (this.status === 'paused' && !this.engine)) {
      this.status = 'gone'
      void this.begin()
    }
  }

  // ----------------------------------------------------------------- events

  private readonly onActivity = (): void => {
    this.activeAt = performance.now()
    if ((this.status === 'paused' || this.status === 'gone') && this.currentWeight() > 0) this.wake()
  }

  private readonly onResize = (): void => {
    this.activeAt = performance.now()
    this.measure(false)
  }

  private readonly onVisibility = (): void => {
    this.lastRender = 0
    this.lastPhase = 'idle'
  }

  private readonly onPointer = (e: PointerEvent): void => {
    this.pointerGoal = { x: e.clientX / window.innerWidth, y: 1 - e.clientY / window.innerHeight, on: 1 }
    this.activeAt = performance.now()
  }

  private readonly onLost = (e: Event): void => {
    e.preventDefault()
    this.lostCount += 1
    this.teardown(false, false)
    setMark('data-hero', null)
    if (this.lostCount >= 2) return this.giveUp()
    this.status = 'lost'
  }

  private readonly onRestored = (): void => {
    if (this.status !== 'lost' || this.stopped) return
    this.status = 'gone'
    void this.begin()
  }

  // ----------------------------------------------------------------- layout

  /** Reads the viewport, the nav and the glass panel, and tells the engine. */
  private measure(snap: boolean): void {
    const w = window.innerWidth
    const h = window.innerHeight
    const view = { w, h }
    const nav = document.querySelector('header')
    const panel = document.querySelector('[data-hero-panel]')
    const rect = panel?.getBoundingClientRect()
    // The panel scrolls with the page; the frame is for scroll 0, so its top is taken in page space.
    const free = freeRect(view, nav ? nav.getBoundingClientRect().bottom : 0, rect ? { left: rect.left, top: rect.top + window.scrollY, right: rect.right } : null)
    this.target = heroFrame(view, free)
    if (snap) this.frame = this.target
    this.engine?.setSize(w, h, window.devicePixelRatio || 1)
  }

  // -------------------------------------------------------------------- HUD

  private startHud(): void {
    const hud = document.createElement('div')
    hud.setAttribute('aria-hidden', 'true')
    hud.style.cssText =
      'position:fixed;left:8px;bottom:8px;z-index:60;pointer-events:none;padding:6px 8px;border-radius:6px;background:rgba(0,0,0,.72);color:#9fe8ff;font:11px/1.35 ui-monospace,monospace;white-space:pre'
    document.body.appendChild(hud)
    this.hud = hud
    this.hudTimer = window.setInterval(() => {
      const info = this.engine?.info
      const sorted = this.intervals
      const p50 = sorted.length ? percentile(sorted, 0.5) : 0
      const p90 = sorted.length ? percentile(sorted, 0.9) : 0
      hud.textContent = [
        `hero tier ${this.tier}  ${this.status}`,
        info ? `canvas ${info.width}x${info.height}  msaa ${info.msaa}  ${info.hdr ? 'half-float' : 'rgba8'}` : 'no engine',
        `frame p50 ${p50.toFixed(1)} ms  p90 ${p90.toFixed(1)} ms  (${sorted.length} samples)`,
        `dpr ${(window.devicePixelRatio || 1).toFixed(2)}  frames ${this.frames}`,
      ].join('\n')
    }, 500)
  }
}

export default function HeroLayer({ onGiveUp }: { readonly onGiveUp: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  const giveUp = useRef(onGiveUp)
  giveUp.current = onGiveUp

  useEffect(() => {
    const element = host.current
    if (!element) return undefined
    const controller = new HeroController(element, () => giveUp.current())
    controller.start()
    return () => controller.stop()
  }, [])

  return <div ref={host} aria-hidden="true" data-hero-layer="" className="pointer-events-none absolute inset-0" />
}

/** Test seam: forgets a previous give-up so each test starts fresh. */
export function resetHeroForTests(): void {
  gaveUp = false
}
