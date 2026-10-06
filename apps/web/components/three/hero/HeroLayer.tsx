'use client'

import { useEffect, useRef } from 'react'
import { readCapabilities, resolveRung } from '@/lib/formations/fallback'
import { assemblyClock } from '@/lib/hero/clock'
import { dampFrame, freeRect, heroFrame, type HeroFrame } from '@/lib/hero/frame'
import { governorStep, initialGovernor, MAX_SAMPLE_MS, percentile, type GovernorPhase, type GovernorState } from '@/lib/hero/governor'
import { assemblyS, cameraFor, heroWeight, loadAt, LOAD_SECONDS, scrollP, type Pointer } from '@/lib/hero/progress'
import { initialTier, TIERS, tierOverride, type HeroTier } from '@/lib/hero/tiers'
import { HeroEngine, type EngineOptions, type EngineTier } from './HeroEngine'

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
 * Contract with the page:
 * - `html[data-hero]` is `live` after the first presented frame and `poster`
 *   once the layer has given up; `html[data-hero-tier]` carries the tier.
 * - `onLive(true)` is called only while the hero is genuinely painting, and
 *   `onLive(false)` the moment it is not (loading, lost, released, given up),
 *   so the 3D cubes are hidden for exactly as long as the hero covers them.
 * - A give-up is never silent: `html[data-hero-reason]` carries the reason code
 *   (and the first line of any shader log), and `console.warn` carries the rest,
 *   in production too.
 */

const SEAM_ENABLED: boolean = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_MODEL_TEST === '1'

interface HeroSeam {
  readonly errors: readonly string[]
  readonly frames: number
  readonly tier: number
  readonly lost: number
  readonly ready: boolean
  /** Renders a deterministic still: the clock stops at `t` and the assembly is `s`. */
  setFreeze(t: number, s: number): void
}

declare global {
  interface Window {
    /** Test seam: shader logs, presented frames and the tier. Same switch and guard as the model seam. */
    __ASSEMBLY_HERO__?: HeroSeam
  }
}

export type HeroReason =
  | 'no-context'
  | 'compile'
  | 'target'
  | 'render'
  | 'tick'
  | 'begin'
  | 'import'
  | 'lost-x2'
  | 'restore-timeout'
  | 'floor'
  | 'session'
  | 'tier-0'
  | 'override-0'

const FLOOR_KEY = 'hero-floor'
/** The governor's floor is remembered this long, not for the whole tab. */
export const FLOOR_MEMORY_MS = 10 * 60 * 1000
/** Out of view this long, the GL context is released. */
export const RELEASE_AFTER_MS = 8000
/** The loop counts as continuous for this long after a scroll, pointer or resize. */
const ACTIVE_MS = 400
/**
 * A lost context that does not come back within this long, with the tab visible, is given up on. Phones lose the
 * context when a tab is backgrounded and restore it on return, so the clock only runs while the tab is visible.
 */
export const RESTORE_DEADLINE_MS = 5000
const CAP_KEY = 'hero-cap'
/** After this long of stable live frames, earlier context losses are forgotten. */
export const LOSS_DECAY_MS = 60_000
/** The hero must have been live this long before the cubes are told to stand down: no one-frame flashes. */
export const LIVE_HYSTERESIS_MS = 150

/** Once the hero has given up it stays off for the session, across remounts. */
let gaveUp = false

const root = (): HTMLElement => document.documentElement
const setMark = (name: string, value: string | null): void => {
  if (value === null) root().removeAttribute(name)
  else root().setAttribute(name, value)
}

type Status = 'starting' | 'live' | 'paused' | 'lost' | 'gone'
type EngineFactory = (canvas: HTMLCanvasElement, tier: EngineTier, options: EngineOptions) => HeroEngine | null

export class HeroController {
  private status: Status = 'gone'
  private engine: HeroEngine | null = null
  private canvas: HTMLCanvasElement | null = null
  private hud: HTMLElement | null = null
  private hudTimer = 0
  private releaseTimer = 0
  private restoreTimer = 0
  private liveTimer = 0
  private idleTimer = 0
  private raf = 0
  private generation = 0
  private stopped = false
  private lostCount = 0
  private liveReported = false
  private hiddenDuringLoss = false
  private weight = 1
  private firstAt = -1
  private liveSince = 0
  private over = false

  private tier: HeroTier
  private governor: GovernorState
  private readonly override: HeroTier | null
  /** The governor runs unless the test build was told which tier to hold. A production override is only a starting tier. */
  private readonly governed: boolean
  private readonly fine: boolean
  private freeze: { t: number; s: number } | null = null
  private readonly grain: number
  private readonly perf: boolean
  private readonly engineOptions: EngineOptions

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
    private readonly onLive: (live: boolean) => void,
    private readonly create: EngineFactory = (canvas, tier, options) => HeroEngine.create(canvas, tier, options),
  ) {
    const params = new URLSearchParams(window.location.search)
    this.perf = params.get('perf') === '1'
    this.fine = window.matchMedia('(pointer: fine)').matches
    const caps = readCapabilities(document.createElement('canvas'))
    const computed = initialTier({
      rung: resolveRung(caps),
      finePointer: this.fine,
      cores: navigator.hardwareConcurrency > 0 ? navigator.hardwareConcurrency : null,
      lowPower: caps.lowPower,
      override: null,
    })
    // `?tier=` can force any tier in dev and in the test build; in production it can only lower the device's own tier.
    this.override = tierOverride(window.location.search)
    this.tier = this.override === null ? computed : SEAM_ENABLED || this.override === 0 ? this.override : (Math.min(this.override, computed) as HeroTier)
    this.governed = !SEAM_ENABLED || this.override === null
    let knownCap = 0
    try {
      knownCap = Number(window.sessionStorage.getItem(CAP_KEY)) || 0
    } catch {
      // Storage blocked: the cap is simply re-learned.
    }
    this.governor = initialGovernor(this.tier, knownCap)

    let grain = 1
    let rgba8 = false
    if (SEAM_ENABLED) {
      const [t, s] = (params.get('freeze') ?? '').split(',').map(Number)
      if (Number.isFinite(t) && Number.isFinite(s)) this.freeze = { t: t as number, s: s as number }
      if (params.get('grain') === '0') grain = 0
      rgba8 = params.get('hdr') === '0'
    }
    this.grain = grain
    this.engineOptions = { rgba8, debug: SEAM_ENABLED }
    if (SEAM_ENABLED) {
      const seam = {}
      Object.defineProperties(seam, {
        errors: { enumerable: true, get: (): readonly string[] => this.engine?.errors ?? [] },
        frames: { enumerable: true, get: (): number => this.frames },
        tier: { enumerable: true, get: (): number => this.tier },
        lost: { enumerable: true, get: (): number => this.lostCount },
        ready: { enumerable: true, get: (): boolean => this.firstShown },
        setFreeze: {
          value: (t: number, s: number): void => {
            this.freeze = { t, s }
          },
        },
      })
      window.__ASSEMBLY_HERO__ = seam as HeroSeam
    }
  }

  // --------------------------------------------------------------- lifecycle

  start(): void {
    if (gaveUp) return this.giveUp('session')
    try {
      const at = Number(window.sessionStorage.getItem(FLOOR_KEY))
      if (this.governed && at > 0 && Date.now() - at < FLOOR_MEMORY_MS) return this.giveUp('floor')
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
    // A layer that gave up leaves its markers: the poster is what the page is showing now, and the reason is evidence.
    if (!gaveUp) {
      setMark('data-hero', null)
      setMark('data-hero-reason', null)
    }
    setMark('data-hero-target', null)
    setMark('data-hero-tier', null)
    if (SEAM_ENABLED) delete window.__ASSEMBLY_HERO__
  }

  private currentWeight(): number {
    return heroWeight(scrollP(window.scrollY, window.innerHeight))
  }

  /**
   * Reports to the page whether the hero is painting, with hysteresis on the way up. Going live is one step: the
   * marker, the canvas opacity and `onLive(true)` (which flips the wash and the cubes) happen in the same task, so
   * the page never shows both, or neither. Going not-live hands everything back at once.
   */
  private reportLive(live: boolean): void {
    if (!live) {
      window.clearTimeout(this.liveTimer)
      this.liveTimer = 0
      if (this.liveReported) {
        this.liveReported = false
        this.onLive(false)
      }
      return
    }
    if (this.liveReported || this.liveTimer !== 0) return
    this.liveTimer = window.setTimeout(() => {
      this.liveTimer = 0
      if (this.status !== 'live' || !this.firstShown || this.liveReported) return
      this.liveReported = true
      if (this.canvas) this.canvas.style.transition = 'none'
      this.setOpacity(this.weight)
      setMark('data-hero', 'live')
      this.onLive(true)
    }, LIVE_HYSTERESIS_MS)
  }

  /** Creates (or re-creates) the engine on the current canvas, compiles, primes, and starts the loop. */
  private async begin(): Promise<void> {
    if (this.stopped || this.status === 'starting') return
    if (this.override === 0) return this.giveUp('override-0')
    if (this.tier === 0) return this.giveUp('tier-0')
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
      const engine = this.create(this.canvas, Math.max(1, this.tier) as EngineTier, this.engineOptions)
      if (!engine) return this.giveUp('no-context')
      this.engine = engine
      if (!this.measure(true)) return this.giveUp('target')
      const ok = await engine.compile()
      if (generation !== this.generation || this.stopped) return
      // A context lost while compiling is the loss handler's business: wait for the restore, do not give up.
      if (!ok) return engine.isLost() ? undefined : this.giveUp('compile')
      if (!engine.prime(this.frame, cameraFor(1, 0, 0, this.pointer))) return engine.isLost() ? undefined : this.giveUp('render')
      this.markTarget()
      this.status = 'live'
      this.lastRender = 0
      this.t0 = -1
      this.firstShown = false
      this.firstAt = -1
      this.liveSince = performance.now()
      this.raf = requestAnimationFrame(this.tick)
    } catch (error) {
      if (generation === this.generation && !this.stopped) this.giveUp('begin', error)
    }
  }

  /** Stops drawing and frees the GL objects; `canvas` also drops the element so a fresh context can follow. */
  private teardown(canvas: boolean, release = true): void {
    cancelAnimationFrame(this.raf)
    this.raf = 0
    window.clearTimeout(this.releaseTimer)
    window.clearTimeout(this.idleTimer)
    window.clearTimeout(this.restoreTimer)
    this.generation += 1
    this.reportLive(false)
    if (this.canvas) this.canvas.style.opacity = '0'
    this.lastOpacity = -1
    this.engine?.dispose(release)
    this.engine = null
    if (canvas && this.canvas) {
      this.canvas.removeEventListener('webglcontextlost', this.onLost)
      this.canvas.removeEventListener('webglcontextrestored', this.onRestored)
      this.canvas.remove()
      this.canvas = null
    }
  }

  /**
   * The one way out. Never silent: the reason is a marker on <html> and a
   * console warning, in production too, and any shader log is captured before
   * the engine that holds it is disposed.
   */
  private giveUp(reason: HeroReason, detail?: unknown, sticky = true): void {
    if (this.over) return
    this.over = true
    gaveUp = sticky
    const log = this.engine?.errors.join(' | ') ?? ''
    const text = detail instanceof Error ? detail.message : typeof detail === 'string' ? detail : ''
    const first = (log || text).split('\n')[0]?.slice(0, 160) ?? ''
    if (reason !== 'session' || !root().hasAttribute('data-hero-reason')) setMark('data-hero-reason', first ? `${reason}: ${first}` : reason)
    console.warn('[hero] gave up', reason, detail ?? '', log)
    this.teardown(true)
    this.status = 'gone'
    setMark('data-hero', 'poster')
    this.onGiveUp()
  }

  private markTarget(): void {
    const info = this.engine?.info
    setMark('data-hero-target', !info ? null : !info.hdr ? 'rgba8' : info.msaa < info.wantedMsaa ? 'msaa0' : null)
  }

  // -------------------------------------------------------------------- loop

  private readonly tick = (now: number): void => {
    this.raf = 0
    try {
      this.step(now)
    } catch (error) {
      this.giveUp('tick', error)
    }
  }

  private step(now: number): void {
    const engine = this.engine
    if (!engine || this.status !== 'live' || this.stopped) return

    const p = this.freeze ? 0 : scrollP(window.scrollY, window.innerHeight)
    const weight = this.freeze ? 1 : heroWeight(p)
    if (weight <= 0) return this.pause()

    if (this.firstAt < 0) this.firstAt = now
    // Join the page's assembly where the cubes got to, instead of restarting it from the hero's own first frame.
    if (this.t0 < 0) this.t0 = this.freeze || assemblyClock.t0 < 0 || assemblyClock.t0 > now ? now : assemblyClock.t0
    const elapsed = (now - this.t0) / 1000
    const phase: GovernorPhase =
      now - this.activeAt < ACTIVE_MS ? 'scroll' : (now - this.firstAt) / 1000 < LOAD_SECONDS + 0.4 && !this.freeze ? 'assembly' : 'idle'
    const interval = now - this.lastRender
    if (phase === 'idle' && this.lastRender > 0) {
      // Wake at the idle rate, not at every vsync.
      const wait = 1000 / TIERS[engine.info.tier].idleFps - interval - 3
      if (wait > 2) {
        this.idleTimer = window.setTimeout(() => {
          this.idleTimer = 0
          this.raf = requestAnimationFrame(this.tick)
        }, wait)
        return
      }
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
    const drawn = engine.render({ time, s, camera: cameraFor(s, p, time, this.pointer), frame: this.frame, grain: this.grain })
    if (!drawn) {
      // A lost context is the loss handler's business; anything else means we would be reporting a dead hero as live.
      if (!engine.isLost()) this.giveUp('render')
      return
    }
    this.frames += 1
    if (this.lostCount > 0 && now - this.liveSince > LOSS_DECAY_MS) this.lostCount = 0

    this.weight = weight
    this.firstShown = true
    // Not yet reported, or reported late after a scroll away and back: ask again. The canvas stays hidden under the
    // opaque wash until the page is told, so nothing leads the pixels.
    if (!this.liveReported) this.reportLive(true)
    else this.setOpacity(weight)

    if (phase !== 'idle' && this.lastPhase !== 'idle' && this.lastRender > 0 && interval <= MAX_SAMPLE_MS) {
      this.intervals.push(interval)
      if (this.intervals.length > 120) this.intervals.shift()
      if (this.governed) this.govern(interval, phase)
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
    const was = this.tier
    if (next.capState === 'confirmed' && this.governor.capState !== 'confirmed') {
      try {
        window.sessionStorage.setItem(CAP_KEY, String(next.cap))
      } catch {
        // Storage blocked: the cap is re-learned next time.
      }
    }
    this.governor = next
    if (next.tier === was) return
    this.tier = next.tier
    setMark('data-hero-tier', String(next.tier))
    setMark('data-hero-governor', `${was}>${next.tier} ${next.reason}`)
    if (next.tier === 0) {
      try {
        window.sessionStorage.setItem(FLOOR_KEY, String(Date.now()))
      } catch {
        // Storage blocked: the floor is just not remembered.
      }
      return this.giveUp('floor', next.reason)
    }
    if (!this.engine?.setTier(next.tier as EngineTier)) return this.giveUp('target')
    this.markTarget()
  }

  /** Out of view: stop drawing, and release the GL context if the visitor stays away. */
  private pause(): void {
    this.status = 'paused'
    this.weight = 0
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
    if (!this.measure(false)) this.giveUp('target')
  }

  private readonly onVisibility = (): void => {
    this.lastRender = 0
    this.lastPhase = 'idle'
    if (this.status !== 'lost') return
    if (document.visibilityState === 'hidden') this.hiddenDuringLoss = true
    this.armRestore()
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
    if (this.canvas) {
      this.canvas.style.opacity = '0'
      this.lastOpacity = -1
    }
    if (this.lostCount >= 2) return this.giveUp('lost-x2')
    this.status = 'lost'
    this.hiddenDuringLoss = document.visibilityState === 'hidden'
    this.armRestore()
  }

  /**
   * A context that never comes back must not leave a blank hero: give up and hand the page back. The clock runs only
   * while the tab is visible (a backgrounded tab is expected to lose its context and get it back on return), and a
   * give-up after the tab was hidden during the loss is not sticky for the session.
   */
  private armRestore(): void {
    window.clearTimeout(this.restoreTimer)
    if (this.status !== 'lost' || document.visibilityState !== 'visible') return
    this.restoreTimer = window.setTimeout(() => this.giveUp('restore-timeout', undefined, !this.hiddenDuringLoss), RESTORE_DEADLINE_MS)
  }

  private readonly onRestored = (): void => {
    if (this.status !== 'lost' || this.stopped) return
    window.clearTimeout(this.restoreTimer)
    this.status = 'gone'
    void this.begin()
  }

  // ----------------------------------------------------------------- layout

  /** Reads the viewport, the nav and the glass panel, and tells the engine. False when no render target could be built. */
  private measure(snap: boolean): boolean {
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
    return this.engine ? this.engine.setSize(w, h, window.devicePixelRatio || 1) : true
  }

  // -------------------------------------------------------------------- HUD

  private startHud(): void {
    const hud = document.createElement('div')
    hud.setAttribute('aria-hidden', 'true')
    hud.style.cssText =
      'position:fixed;left:8px;bottom:8px;z-index:60;pointer-events:none;padding:6px 8px;background:rgba(0,0,0,.72);color:#9fe8ff;font:11px/1.35 ui-monospace,monospace;white-space:pre'
    document.body.appendChild(hud)
    this.hud = hud
    this.hudTimer = window.setInterval(() => {
      const info = this.engine?.info
      const samples = this.intervals
      const p50 = samples.length ? percentile(samples, 0.5) : 0
      const p90 = samples.length ? percentile(samples, 0.9) : 0
      const g = this.governor
      const hz = g.cap > 0 ? (1000 / g.cap).toFixed(0) : ''
      hud.textContent = [
        `hero tier ${this.tier}  ${this.status}`,
        info ? `canvas ${info.width}x${info.height}  msaa ${info.msaa}  ${info.hdr ? 'half-float' : 'rgba8'}` : 'no engine',
        `frame p50 ${p50.toFixed(1)} ms  p90 ${p90.toFixed(1)} ms  (${samples.length} samples)`,
        `dpr ${(window.devicePixelRatio || 1).toFixed(2)}  frames ${this.frames}`,
        g.capState === 'confirmed'
          ? `rAF capped at about ${hz} Hz, confirmed: used as budget`
          : g.capState === 'unconfirmed'
            ? `rAF cap-like at about ${hz} Hz, unconfirmed: stepped down to test it`
            : 'no rAF cap',
        this.governor.reason ? `stepped down: ${this.governor.reason}` : 'no step down',
      ].join('\n')
    }, 500)
  }
}

export default function HeroLayer({ onGiveUp, onLive }: { readonly onGiveUp: () => void; readonly onLive: (live: boolean) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onGiveUp, onLive })
  callbacks.current = { onGiveUp, onLive }

  useEffect(() => {
    const element = host.current
    if (!element) return undefined
    let controller: HeroController | null = null
    try {
      controller = new HeroController(
        element,
        () => callbacks.current.onGiveUp(),
        (live) => callbacks.current.onLive(live),
      )
      controller.start()
    } catch (error) {
      // A synchronous throw must not take the home page down.
      setMark('data-hero-reason', 'throw')
      console.warn('[hero] gave up', 'throw', error)
      callbacks.current.onGiveUp()
    }
    return () => controller?.stop()
  }, [])

  return <div ref={host} aria-hidden="true" data-hero-layer="" className="pointer-events-none absolute inset-0" />
}

/** Test seam: forgets a previous give-up so each test starts fresh. */
export function resetHeroForTests(): void {
  gaveUp = false
}
