import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HeroEngine } from '@/components/three/hero/HeroEngine'
import { HeroController, LIVE_HYSTERESIS_MS, RELEASE_AFTER_MS, resetHeroForTests, RESTORE_DEADLINE_MS } from '@/components/three/hero/HeroLayer'

/**
 * The hero controller with a stub engine and fake timers: the page-facing half
 * of the engine's contract. What these pin down is that the hero is never
 * reported live unless it is painting, that every way out is a give-up with a
 * reason, and that the cubes are handed back the moment the hero is not live.
 */

type Stub = HeroEngine & { render: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; setTier: ReturnType<typeof vi.fn>; compile: ReturnType<typeof vi.fn> }

function stubEngine(over: Record<string, unknown> = {}): Stub {
  return {
    errors: [] as string[],
    info: { tier: 2, width: 100, height: 100, msaa: 4, hdr: true, wantedMsaa: 4 },
    setSize: vi.fn(() => true),
    compile: vi.fn(async () => true),
    prime: vi.fn(() => true),
    render: vi.fn(() => true),
    setTier: vi.fn(() => true),
    isLost: vi.fn(() => false),
    dispose: vi.fn(),
    ...over,
  } as unknown as Stub
}

let frameMs = 16
const html = document.documentElement
const mark = (name: string): string | null => html.getAttribute(name)

function setup(search: string, factory: () => HeroEngine | null) {
  window.history.replaceState({}, '', search)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const onGiveUp = vi.fn()
  const onLive = vi.fn()
  const create = vi.fn(factory)
  const controller = new HeroController(host, onGiveUp, onLive, create)
  return { host, onGiveUp, onLive, create, controller }
}

const scrollTo = (y: number): void => {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y })
  window.dispatchEvent(new Event('scroll'))
}

/** Lets promises settle and time pass in small steps, so rAF-driven frames run. */
const run = async (ms: number): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] })
  frameMs = 16
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => setTimeout(() => cb(performance.now()), frameMs))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
  scrollTo(0)
  resetHeroForTests()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  for (const name of ['data-hero', 'data-hero-reason', 'data-hero-tier', 'data-hero-target', 'data-hero-governor']) html.removeAttribute(name)
  document.body.innerHTML = ''
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('begin', () => {
  it('a throwing engine factory gives up as begin, with the message, and warns in production too', async () => {
    const { controller, onGiveUp } = setup('/?hero=a&tier=2', () => {
      throw new Error('getContext blew up')
    })
    controller.start()
    await run(50)
    expect(mark('data-hero-reason')).toMatch(/^begin: getContext blew up/)
    expect(mark('data-hero')).toBe('poster')
    expect(onGiveUp).toHaveBeenCalledTimes(1)
    expect(console.warn).toHaveBeenCalledWith('[hero] gave up', 'begin', expect.any(Error), '')
    controller.stop()
  })

  it('no context is a give-up, not a silent nothing', async () => {
    const { controller, onGiveUp } = setup('/?hero=a&tier=2', () => null)
    controller.start()
    await run(50)
    expect(mark('data-hero-reason')).toBe('no-context')
    expect(onGiveUp).toHaveBeenCalled()
    controller.stop()
  })

  it('a compile failure gives up with the first shader log line in the marker, read before dispose', async () => {
    const engine = stubEngine({
      errors: ['slab: ERROR: 0:12: syntax error\nsecond line'],
      compile: vi.fn(async () => false),
    })
    const { controller } = setup('/?hero=a&tier=2', () => engine)
    controller.start()
    await run(50)
    expect(mark('data-hero-reason')).toBe('compile: slab: ERROR: 0:12: syntax error')
    expect(engine.dispose).toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledWith('[hero] gave up', 'compile', '', expect.stringContaining('syntax error'))
    controller.stop()
  })

  it('a target that cannot be built is a give-up', async () => {
    const { controller } = setup('/?hero=a&tier=2', () => stubEngine({ setSize: vi.fn(() => false), errors: ['render target incomplete'] }))
    controller.start()
    await run(50)
    expect(mark('data-hero-reason')).toBe('target: render target incomplete')
    controller.stop()
  })

  it('?tier=0 gives up as override-0 instead of quietly running tier 1', async () => {
    const { controller, create } = setup('/?hero=a&tier=0', () => stubEngine())
    controller.start()
    await run(50)
    expect(mark('data-hero-reason')).toBe('override-0')
    expect(create).not.toHaveBeenCalled()
    controller.stop()
  })

  it('a device whose own tier is 0 gives up as tier-0', async () => {
    // jsdom has no 2d canvas and no IntersectionObserver, so the ladder says `wash`: tier 0, and no override.
    const { controller, create } = setup('/?hero=a', () => stubEngine())
    controller.start()
    await run(50)
    expect(mark('data-hero-reason')).toBe('tier-0')
    expect(create).not.toHaveBeenCalled()
    controller.stop()
  })

  it('does not spend a GL context on a visitor who landed past the hero', async () => {
    scrollTo(5000)
    const { controller, create } = setup('/?hero=a&tier=2', () => stubEngine())
    controller.start()
    await run(100)
    expect(create).not.toHaveBeenCalled()
    controller.stop()
  })
})

describe('the loop', () => {
  it('goes live only after a frame is presented, the marker leads nothing, and the page hears about it after the hysteresis', async () => {
    const engine = stubEngine()
    const { controller, onLive } = setup('/?hero=a&tier=2', () => engine)
    controller.start()
    await run(5)
    expect(mark('data-hero')).toBeNull()
    expect(onLive).not.toHaveBeenCalled()
    await run(100)
    expect(engine.render).toHaveBeenCalled()
    // Drawn, but not yet reported: the marker, the canvas and the page's cube hand-off all wait for the same moment.
    expect(mark('data-hero')).toBeNull()
    expect(onLive).not.toHaveBeenCalled()
    await run(LIVE_HYSTERESIS_MS + 20)
    expect(mark('data-hero')).toBe('live')
    expect(onLive).toHaveBeenCalledWith(true)
    expect(mark('data-hero-reason')).toBeNull()
    controller.stop()
  })

  it('render returning false on a healthy context gives up as render and never marks live', async () => {
    const engine = stubEngine({ render: vi.fn(() => false) })
    const { controller, onGiveUp, onLive } = setup('/?hero=a&tier=2', () => engine)
    controller.start()
    await run(500)
    expect(mark('data-hero-reason')).toBe('render')
    expect(mark('data-hero')).toBe('poster')
    expect(onGiveUp).toHaveBeenCalled()
    expect(onLive).not.toHaveBeenCalledWith(true)
    controller.stop()
  })

  it('a throw inside a frame gives up as tick and leaves no live marker behind', async () => {
    let calls = 0
    const engine = stubEngine({
      render: vi.fn(() => {
        calls += 1
        if (calls > 3) throw new Error('GL went away')
        return true
      }),
    })
    const { controller, onLive } = setup('/?hero=a&tier=2', () => engine)
    controller.start()
    await run(1000)
    expect(mark('data-hero-reason')).toMatch(/^tick: GL went away/)
    expect(mark('data-hero')).toBe('poster')
    expect(onLive).not.toHaveBeenCalledWith(true)
    controller.stop()
  })

  it('a render that fails because the context is lost is left to the loss handler', async () => {
    const engine = stubEngine({ render: vi.fn(() => false), isLost: vi.fn(() => true) })
    const { controller, onGiveUp } = setup('/?hero=a&tier=2', () => engine)
    controller.start()
    await run(500)
    expect(onGiveUp).not.toHaveBeenCalled()
    controller.stop()
  })

  it('sets the target marker when the driver refused MSAA, and rgba8 when it refused float', async () => {
    const msaa0 = setup('/?hero=a&tier=2', () => stubEngine({ info: { tier: 2, width: 1, height: 1, msaa: 0, hdr: true, wantedMsaa: 4 } }))
    msaa0.controller.start()
    await run(50)
    expect(mark('data-hero-target')).toBe('msaa0')
    msaa0.controller.stop()
    const rgba = setup('/?hero=a&tier=2', () => stubEngine({ info: { tier: 2, width: 1, height: 1, msaa: 0, hdr: false, wantedMsaa: 4 } }))
    rgba.controller.start()
    await run(50)
    expect(mark('data-hero-target')).toBe('rgba8')
    rgba.controller.stop()
  })
})

describe('context loss', () => {
  const fire = (host: HTMLElement, type: string): void => {
    host.querySelector('canvas')?.dispatchEvent(new Event(type, { cancelable: true }))
  }

  it('a loss hides the hero and returns the cubes; a restore re-creates the engine and goes live again', async () => {
    const { controller, host, onLive, create } = setup('/?hero=a&tier=2', () => stubEngine())
    controller.start()
    await run(100 + LIVE_HYSTERESIS_MS + 50)
    expect(onLive).toHaveBeenLastCalledWith(true)

    fire(host, 'webglcontextlost')
    expect(onLive).toHaveBeenLastCalledWith(false)
    expect(mark('data-hero')).toBeNull()
    expect(host.querySelector('canvas')?.style.opacity).toBe('0')

    fire(host, 'webglcontextrestored')
    await run(100 + LIVE_HYSTERESIS_MS + 50)
    expect(create).toHaveBeenCalledTimes(2)
    expect(mark('data-hero')).toBe('live')
    expect(onLive).toHaveBeenLastCalledWith(true)
    expect(mark('data-hero-reason')).toBeNull()
    controller.stop()
  })

  it('a loss with no restore gives up as restore-timeout, so the page is never left blank', async () => {
    const { controller, host, onGiveUp } = setup('/?hero=a&tier=2', () => stubEngine())
    controller.start()
    await run(200)
    fire(host, 'webglcontextlost')
    await run(RESTORE_DEADLINE_MS - 100)
    expect(onGiveUp).not.toHaveBeenCalled()
    await run(200)
    expect(mark('data-hero-reason')).toBe('restore-timeout')
    expect(onGiveUp).toHaveBeenCalledTimes(1)
    controller.stop()
  })

  it('a restore in time cancels the deadline', async () => {
    const { controller, host, onGiveUp } = setup('/?hero=a&tier=2', () => stubEngine())
    controller.start()
    await run(200)
    fire(host, 'webglcontextlost')
    await run(1000)
    fire(host, 'webglcontextrestored')
    await run(RESTORE_DEADLINE_MS * 2)
    expect(onGiveUp).not.toHaveBeenCalled()
    controller.stop()
  })

  it('two losses in quick succession give up, but a long stable run forgets the first', async () => {
    const quick = setup('/?hero=a&tier=2', () => stubEngine())
    quick.controller.start()
    await run(200)
    fire(quick.host, 'webglcontextlost')
    fire(quick.host, 'webglcontextrestored')
    await run(200)
    fire(quick.host, 'webglcontextlost')
    expect(mark('data-hero-reason')).toBe('lost-x2')
    quick.controller.stop()
  })

  it('forgets a loss after a minute of stable live frames', async () => {
    const { controller, host, onGiveUp } = setup('/?hero=a&tier=2', () => stubEngine())
    controller.start()
    await run(200)
    fire(host, 'webglcontextlost')
    fire(host, 'webglcontextrestored')
    await run(61_000)
    fire(host, 'webglcontextlost')
    expect(onGiveUp).not.toHaveBeenCalled()
    expect(mark('data-hero-reason')).toBeNull()
    controller.stop()
  })
})

describe('going live late, and restore with the tab hidden', () => {
  const visibility = (state: 'visible' | 'hidden'): void => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
    document.dispatchEvent(new Event('visibilitychange'))
  }
  afterEach(() => visibility('visible'))
  const fire = (host: HTMLElement, type: string): void => {
    host.querySelector('canvas')?.dispatchEvent(new Event(type, { cancelable: true }))
  }

  it('scrolling away inside the hysteresis does not strand the hero: it reports live when it wakes', async () => {
    const { controller, onLive } = setup('/?hero=a&tier=2', () => stubEngine())
    controller.start()
    await run(40)
    scrollTo(5000)
    await run(LIVE_HYSTERESIS_MS + 100)
    expect(onLive).not.toHaveBeenCalledWith(true)
    scrollTo(0)
    await run(LIVE_HYSTERESIS_MS + 200)
    expect(onLive).toHaveBeenLastCalledWith(true)
    expect(mark('data-hero')).toBe('live')
    controller.stop()
  })

  it('the restore clock does not run while the tab is hidden, and a hidden-tab restore-timeout is not sticky', async () => {
    const { controller, host, onGiveUp, create } = setup('/?hero=a&tier=2', () => stubEngine())
    controller.start()
    await run(200)
    visibility('hidden')
    fire(host, 'webglcontextlost')
    await run(RESTORE_DEADLINE_MS * 3)
    expect(onGiveUp).not.toHaveBeenCalled()
    // Back on screen: the clock starts now, and the browser restores the context in time.
    visibility('visible')
    await run(RESTORE_DEADLINE_MS - 500)
    fire(host, 'webglcontextrestored')
    await run(300)
    expect(onGiveUp).not.toHaveBeenCalled()
    expect(create).toHaveBeenCalledTimes(2)
    controller.stop()
  })

  it('a loss while visible still times out after 5 s, and that give-up is sticky; one that began hidden is not', async () => {
    const sticky = setup('/?hero=a&tier=2', () => stubEngine())
    sticky.controller.start()
    await run(200)
    fire(sticky.host, 'webglcontextlost')
    await run(RESTORE_DEADLINE_MS + 100)
    expect(mark('data-hero-reason')).toBe('restore-timeout')
    sticky.controller.stop()
    const again = setup('/?hero=a&tier=2', () => stubEngine())
    again.controller.start()
    await run(50)
    expect(mark('data-hero-reason')).toBe('restore-timeout')
    again.controller.stop()

    resetHeroForTests()
    html.removeAttribute('data-hero-reason')
    const soft = setup('/?hero=a&tier=2', () => stubEngine())
    soft.controller.start()
    await run(200)
    visibility('hidden')
    fire(soft.host, 'webglcontextlost')
    visibility('visible')
    await run(RESTORE_DEADLINE_MS + 100)
    expect(mark('data-hero-reason')).toBe('restore-timeout')
    soft.controller.stop()
    html.removeAttribute('data-hero-reason')
    const next = setup('/?hero=a&tier=2', () => stubEngine())
    next.controller.start()
    await run(200)
    expect(mark('data-hero-reason')).toBeNull()
    next.controller.stop()
  })

  it('a context lost while compiling waits for the restore instead of giving up', async () => {
    let resolveCompile: (ok: boolean) => void = () => {}
    const engine = stubEngine({
      compile: vi.fn(() => new Promise<boolean>((resolve) => (resolveCompile = resolve))),
      isLost: vi.fn(() => true),
    })
    const { controller, onGiveUp } = setup('/?hero=a&tier=2', () => engine)
    controller.start()
    await run(20)
    resolveCompile(false)
    await run(100)
    expect(onGiveUp).not.toHaveBeenCalled()
    expect(mark('data-hero-reason')).toBeNull()
    controller.stop()
  })
})

describe('out of view', () => {
  it('releases the context after 8 s away, hands the cubes back, and re-acquires on scroll-back', async () => {
    const { controller, onLive, create } = setup('/?hero=a&tier=2', () => stubEngine())
    controller.start()
    await run(200 + LIVE_HYSTERESIS_MS)
    expect(onLive).toHaveBeenLastCalledWith(true)

    scrollTo(5000)
    await run(100)
    expect(create).toHaveBeenCalledTimes(1)
    await run(RELEASE_AFTER_MS + 100)
    expect(onLive).toHaveBeenLastCalledWith(false)
    expect(mark('data-hero')).toBeNull()

    scrollTo(0)
    await run(300 + LIVE_HYSTERESIS_MS)
    expect(create).toHaveBeenCalledTimes(2)
    expect(mark('data-hero')).toBe('live')
    expect(onLive).toHaveBeenLastCalledWith(true)
    controller.stop()
  })

  it('a short trip away keeps the engine and resumes without a second context', async () => {
    const { controller, create } = setup('/?hero=a&tier=2', () => stubEngine())
    controller.start()
    await run(200)
    scrollTo(5000)
    await run(500)
    scrollTo(0)
    await run(300)
    expect(create).toHaveBeenCalledTimes(1)
    controller.stop()
  })
})

describe('the governor, wired in', () => {
  beforeEach(() => {
    // A device the ladder puts at tier 2: a 2d canvas, an IntersectionObserver, eight cores, no fine pointer.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({})) as never)
    vi.stubGlobal('IntersectionObserver', class {})
    Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 8 })
  })

  it('steps a struggling device down a tier and says why, without a give-up', async () => {
    frameMs = 50
    const engine = stubEngine()
    const { controller, onGiveUp } = setup('/?hero=a', () => engine)
    controller.start()
    await run(4500)
    expect(mark('data-hero-tier')).toBe('1')
    expect(mark('data-hero-governor')).toMatch(/^2>1 p75 50\.0 over 22 ms at tier 2/)
    expect(engine.setTier).toHaveBeenCalledWith(1)
    expect(mark('data-hero-reason')).toBeNull()
    expect(onGiveUp).not.toHaveBeenCalled()
    controller.stop()
  })

  /** Keeps the hero in the continuous (scroll) phase, the one the governor samples, for `ms`. */
  async function scrolling(ms: number): Promise<void> {
    for (let t = 0; t < ms; t += 300) {
      scrollTo(0)
      await run(300)
    }
  }

  it('does not trust a 30 Hz stream at once: it steps down to test it, and stops once the cap persists', async () => {
    frameMs = 33
    const engine = stubEngine()
    const { controller, onGiveUp } = setup('/?hero=a', () => engine)
    controller.start()
    await scrolling(40_000)
    expect(mark('data-hero-tier')).toBe('1')
    expect(engine.setTier).toHaveBeenCalledTimes(1)
    expect(Number(window.sessionStorage.getItem('hero-cap'))).toBeGreaterThan(32)
    expect(onGiveUp).not.toHaveBeenCalled()
    window.sessionStorage.removeItem('hero-cap')
    controller.stop()
  })

  it('a vsync-quantised slow GPU is not a cap: 33 ms at tier 2, 16 ms at tier 1, so it steps down once and no cap is stored', async () => {
    frameMs = 33
    const engine = stubEngine({
      setTier: vi.fn(() => {
        frameMs = 16
        return true
      }),
    })
    const { controller } = setup('/?hero=a&perf=1', () => engine)
    controller.start()
    await scrolling(30_000)
    expect(mark('data-hero-tier')).toBe('1')
    expect(window.sessionStorage.getItem('hero-cap')).toBeNull()
    expect(document.body.textContent).toMatch(/no rAF cap/)
    controller.stop()
  })

  it('in production a ?tier is only a starting tier: the governor keeps governing', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.resetModules()
    const mod = await import('@/components/three/hero/HeroLayer')
    mod.resetHeroForTests()
    frameMs = 50
    window.history.replaceState({}, '', '/?hero=a&tier=2')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const engine = stubEngine()
    const controller = new mod.HeroController(host, vi.fn(), vi.fn(), () => engine)
    controller.start()
    await scrolling(8000)
    expect(engine.setTier).toHaveBeenCalledWith(1)
    expect(mark('data-hero-tier')).toBe('1')
    controller.stop()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('in the test build an override still holds the tier', async () => {
    frameMs = 50
    const engine = stubEngine()
    const { controller } = setup('/?hero=a&tier=2', () => engine)
    controller.start()
    await scrolling(8000)
    expect(engine.setTier).not.toHaveBeenCalled()
    controller.stop()
  })

  it('reaching the floor remembers it for ten minutes only, and gives up as floor', async () => {
    frameMs = 90
    const engine = stubEngine({ info: { tier: 1, width: 1, height: 1, msaa: 0, hdr: true, wantedMsaa: 0 } })
    const { controller } = setup('/?hero=a&perf=1', () => engine)
    controller.start()
    for (let i = 0; i < 200 && !mark('data-hero-reason'); i += 1) {
      scrollTo(0)
      await run(300)
    }
    expect(mark('data-hero-reason')).toMatch(/^floor: /)
    const stored = Number(window.sessionStorage.getItem('hero-floor'))
    expect(stored).toBeGreaterThan(0)
    controller.stop()

    // A new mount inside ten minutes stays off; one after it tries again.
    resetHeroForTests()
    html.removeAttribute('data-hero-reason')
    const again = setup('/?hero=a', () => stubEngine())
    again.controller.start()
    await run(50)
    expect(mark('data-hero-reason')).toBe('floor')
    again.controller.stop()

    resetHeroForTests()
    html.removeAttribute('data-hero-reason')
    window.sessionStorage.setItem('hero-floor', String(Date.now() - 11 * 60 * 1000))
    const later = setup('/?hero=a', () => stubEngine())
    later.controller.start()
    await run(50)
    expect(mark('data-hero-reason')).toBeNull()
    later.controller.stop()
    window.sessionStorage.removeItem('hero-floor')
  })

  it('shows the cap and the governor in the HUD', async () => {
    frameMs = 33
    const { controller } = setup('/?hero=a&perf=1', () => stubEngine())
    controller.start()
    await scrolling(40_000)
    expect(document.body.textContent).toMatch(/rAF capped at about 30 Hz, confirmed/)
    window.sessionStorage.removeItem('hero-cap')
    controller.stop()
  })
})

describe('production mode', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  async function production() {
    vi.stubEnv('NODE_ENV', 'production')
    vi.resetModules()
    return import('@/components/three/hero/HeroLayer')
  }

  it('?tier can lower the device tier but never exceed it, and the test seam is absent', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({})) as never)
    vi.stubGlobal('IntersectionObserver', class {})
    Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 8 })
    const mod = await production()
    mod.resetHeroForTests()

    window.history.replaceState({}, '', '/?hero=a&tier=3&freeze=3,0.5&grain=0')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const create = vi.fn(() => stubEngine())
    const high = new mod.HeroController(host, vi.fn(), vi.fn(), create)
    high.start()
    await run(50)
    expect(create).toHaveBeenCalledWith(expect.anything(), 2, expect.objectContaining({ rgba8: false, debug: false }))
    expect(window.__ASSEMBLY_HERO__).toBeUndefined()
    high.stop()

    mod.resetHeroForTests()
    window.history.replaceState({}, '', '/?hero=a&tier=1')
    const create2 = vi.fn(() => stubEngine())
    const low = new mod.HeroController(host, vi.fn(), vi.fn(), create2)
    low.start()
    await run(50)
    expect(create2).toHaveBeenCalledWith(expect.anything(), 1, expect.anything())
    low.stop()
  })
})
