import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMPILE_DEADLINE_MS, HeroEngine } from '@/components/three/hero/HeroEngine'
import { cameraFor } from '@/lib/hero/progress'

/**
 * A configurable fake GL context. Constants (`gl.TRIANGLES`) answer with stable
 * numbers, `create*` answer with fresh objects, and every call is counted, so
 * the engine runs its whole life without a browser. By default it is a healthy
 * driver; a config turns it into a failing one (compile or link failure, an
 * incomplete framebuffer, no shader objects, a link that never completes).
 * Together they are the disposal checklist of spec § 6 and the engine's error
 * handling, as an executable table.
 */
interface FakeConfig {
  readonly lost?: () => boolean
  /** `LINK_STATUS` answer. */
  readonly linkOk?: boolean
  readonly infoLog?: string
  /** Answer for the nth `checkFramebufferStatus` call (1-based). */
  readonly fbo?: (call: number) => boolean
  readonly createShaderNull?: boolean
  /** Expose KHR_parallel_shader_compile; `completes` says whether it ever reports completion. */
  readonly parallel?: { readonly completes: boolean }
  /** Expose the float render-target extension (default true). */
  readonly float?: boolean
}

const COMPLETION = 987_654

function fakeGl(config: FakeConfig = {}) {
  const calls: Record<string, number> = {}
  const constants = new Map<string, number>()
  const constant = (key: string): number => {
    if (!constants.has(key)) constants.set(key, constants.size + 1)
    return constants.get(key) as number
  }
  const loseContext = vi.fn()
  const extension = (name: string): unknown => {
    if (name === 'WEBGL_lose_context') return { loseContext }
    if (name === 'EXT_color_buffer_float') return config.float === false ? null : {}
    if (name === 'KHR_parallel_shader_compile') return config.parallel ? { COMPLETION_STATUS_KHR: COMPLETION } : null
    return null
  }
  const gl = new Proxy({} as Record<string, unknown>, {
    get(_target, key: string) {
      if (/^[A-Z][A-Z0-9_]*$/.test(key)) return constant(key)
      return (...args: unknown[]) => {
        calls[key] = (calls[key] ?? 0) + 1
        switch (key) {
          case 'getExtension':
            return extension(String(args[0]))
          case 'isContextLost':
            return config.lost?.() ?? false
          case 'getProgramParameter':
            return args[1] === COMPLETION ? config.parallel?.completes === true : (config.linkOk ?? true)
          case 'checkFramebufferStatus':
            return (config.fbo ? config.fbo(calls[key] as number) : true) ? constant('FRAMEBUFFER_COMPLETE') : constant('FRAMEBUFFER_INCOMPLETE_ATTACHMENT')
          case 'getShaderInfoLog':
          case 'getProgramInfoLog':
            return config.infoLog ?? ''
          case 'createShader':
            return config.createShaderNull ? null : { made: key, n: calls[key] }
          case 'getError':
            return 0
          default:
            return key.startsWith('create') ? { made: key, n: calls[key] } : undefined
        }
      }
    },
  })
  return { gl: gl as unknown as WebGL2RenderingContext, calls, loseContext }
}

const frame = { cx: 0.5, cy: 0.5, zoom: 1 }
const state = { time: 1, s: 1, camera: cameraFor(1, 0, 1, { x: 0.5, y: 0.5, active: 0 }), frame, grain: 1 }

async function liveEngine(tier: 1 | 2 | 3 = 3, config: FakeConfig = {}) {
  const fake = fakeGl(config)
  const engine = new HeroEngine(fake.gl, document.createElement('canvas'), tier)
  expect(engine.setSize(640, 400, 1)).toBe(true)
  expect(await engine.compile()).toBe(true)
  return { ...fake, engine }
}

afterEach(() => vi.useRealTimers())

describe('HeroEngine disposal', () => {
  it('deletes every object it created, once, then releases the context', async () => {
    const { engine, calls, loseContext } = await liveEngine(3)
    expect(engine.render(state)).toBe(true)
    engine.dispose()
    expect(calls['deleteProgram']).toBe(6)
    expect(calls['deleteShader']).toBe(12)
    expect(calls['deleteBuffer']).toBe(7)
    expect(calls['deleteVertexArray']).toBe(5)
    expect(calls['deleteTexture']).toBe(1)
    expect(calls['deleteFramebuffer']).toBe(2)
    expect(calls['deleteRenderbuffer']).toBe(2)
    expect(loseContext).toHaveBeenCalledTimes(1)
  })

  it('creates exactly what it deletes: no leak of any kind', async () => {
    const { engine, calls } = await liveEngine(3)
    engine.dispose()
    expect(calls['createProgram']).toBe(calls['deleteProgram'])
    expect(calls['createShader']).toBe(calls['deleteShader'])
    expect(calls['createBuffer']).toBe(calls['deleteBuffer'])
    expect(calls['createVertexArray']).toBe(calls['deleteVertexArray'])
    expect(calls['createTexture']).toBe(calls['deleteTexture'])
    expect(calls['createFramebuffer']).toBe(calls['deleteFramebuffer'])
    expect(calls['createRenderbuffer']).toBe(calls['deleteRenderbuffer'])
  })

  it('is idempotent: a second dispose deletes and releases nothing more', async () => {
    const { engine, calls, loseContext } = await liveEngine(3)
    engine.dispose()
    const after = { ...calls }
    engine.dispose()
    engine.dispose(false)
    expect(calls).toEqual(after)
    expect(loseContext).toHaveBeenCalledTimes(1)
  })

  it('tier 1 has no multisampled target, so one framebuffer and one renderbuffer', async () => {
    const { engine, calls } = await liveEngine(1)
    engine.dispose()
    expect(calls['createFramebuffer']).toBe(1)
    expect(calls['createRenderbuffer']).toBe(1)
    expect(calls['deleteFramebuffer']).toBe(1)
    expect(calls['deleteRenderbuffer']).toBe(1)
  })

  it('a tier change reallocates the target without leaking or recompiling', async () => {
    const { engine, calls } = await liveEngine(3)
    const programs = calls['createProgram']
    expect(engine.setTier(1)).toBe(true)
    expect(engine.setTier(2)).toBe(true)
    expect(calls['createProgram']).toBe(programs)
    engine.dispose()
    expect(calls['createTexture']).toBe(calls['deleteTexture'])
    expect(calls['createFramebuffer']).toBe(calls['deleteFramebuffer'])
    expect(calls['createRenderbuffer']).toBe(calls['deleteRenderbuffer'])
  })

  it('invalidates the multisampled attachments after the resolve', async () => {
    const { engine, calls } = await liveEngine(3)
    engine.render(state)
    expect(calls['blitFramebuffer']).toBe(1)
    expect(calls['invalidateFramebuffer']).toBe(1)
  })

  it('uploads the constant slab planes once per program, not every frame', async () => {
    const { engine, calls } = await liveEngine(3)
    engine.render(state)
    const after = calls['uniform4fv']
    engine.render(state)
    engine.render(state)
    expect(calls['uniform4fv']).toBe(after)
  })
})

describe('HeroEngine context loss', () => {
  it('draws nothing on a lost context and reports it', async () => {
    let lost = false
    const { engine, calls } = await liveEngine(3, { lost: () => lost })
    expect(engine.render(state)).toBe(true)
    lost = true
    const draws = calls['drawArrays']
    expect(engine.isLost()).toBe(true)
    expect(engine.render(state)).toBe(false)
    expect(calls['drawArrays']).toBe(draws)
  })

  it('disposing for a restore frees the objects but does not lose the context again', async () => {
    const { engine, calls, loseContext } = await liveEngine(3)
    engine.dispose(false)
    expect(calls['deleteProgram']).toBe(6)
    expect(loseContext).not.toHaveBeenCalled()
  })

  it('refuses to render before it has compiled', () => {
    const { gl } = fakeGl()
    const engine = new HeroEngine(gl, document.createElement('canvas'), 2)
    engine.setSize(100, 100, 1)
    expect(engine.render(state)).toBe(false)
    engine.dispose()
  })
})

describe('HeroEngine failure, reported and never swallowed', () => {
  it('a link failure returns false and keeps the info log in errors, before dispose', async () => {
    const { gl } = fakeGl({ linkOk: false, infoLog: 'ERROR: 0:12: syntax error' })
    const engine = new HeroEngine(gl, document.createElement('canvas'), 3)
    engine.setSize(320, 200, 1)
    expect(await engine.compile()).toBe(false)
    expect(engine.errors).toHaveLength(6)
    expect(engine.errors[0]).toContain('ERROR: 0:12: syntax error')
    // The logs are still readable after the engine is gone: the controller reads them first, then disposes.
    engine.dispose()
    expect(engine.errors[0]).toContain('slab')
  })

  it('createShader returning null is a compile failure, not a crash', async () => {
    const { gl, calls } = fakeGl({ createShaderNull: true })
    const engine = new HeroEngine(gl, document.createElement('canvas'), 3)
    expect(await engine.compile()).toBe(false)
    expect(engine.errors[0]).toMatch(/could not create shader objects/)
    expect(calls['createProgram']).toBeUndefined()
    engine.dispose()
  })

  it('an incomplete framebuffer at every attempt fails setSize, once, and render stays false', async () => {
    const { gl } = fakeGl({ fbo: () => false })
    const engine = new HeroEngine(gl, document.createElement('canvas'), 3)
    expect(engine.setSize(640, 400, 1)).toBe(false)
    expect(engine.setSize(641, 401, 1)).toBe(false)
    expect(engine.errors.filter((e) => e === 'render target incomplete')).toHaveLength(1)
    expect(await engine.compile()).toBe(true)
    expect(engine.render(state)).toBe(false)
    engine.dispose()
  })

  it('walks the four-step fallback: half-float MSAA, half-float, RGBA8 MSAA, RGBA8 with no MSAA', async () => {
    const { gl, calls } = fakeGl({ fbo: (call) => call >= 4 })
    const engine = new HeroEngine(gl, document.createElement('canvas'), 3)
    expect(engine.setSize(640, 400, 1)).toBe(true)
    expect(engine.info).toMatchObject({ hdr: false, msaa: 0, wantedMsaa: 4 })
    engine.dispose()
    expect(calls['createTexture']).toBe(calls['deleteTexture'])
    expect(calls['createRenderbuffer']).toBe(calls['deleteRenderbuffer'])
  })

  it('without a float extension it starts in RGBA8 and says so', async () => {
    const { engine } = await liveEngine(2, { float: false })
    expect(engine.info.hdr).toBe(false)
    expect(engine.render(state)).toBe(true)
  })

  it('a parallel compile that never completes times out with a reason', async () => {
    vi.useFakeTimers()
    const { gl } = fakeGl({ parallel: { completes: false } })
    const engine = new HeroEngine(gl, document.createElement('canvas'), 3)
    const result = engine.compile()
    await vi.advanceTimersByTimeAsync(COMPILE_DEADLINE_MS + 200)
    expect(await result).toBe(false)
    expect(engine.errors).toContain('compile timeout')
    engine.dispose()
  })

  it('a parallel compile that completes resolves true', async () => {
    vi.useFakeTimers()
    const { gl } = fakeGl({ parallel: { completes: true } })
    const engine = new HeroEngine(gl, document.createElement('canvas'), 3)
    const result = engine.compile()
    await vi.advanceTimersByTimeAsync(50)
    expect(await result).toBe(true)
    expect(engine.errors).toEqual([])
    engine.dispose()
  })

  it('records the first GL error only, in debug mode', async () => {
    const fake = fakeGl()
    const bad = new Proxy(fake.gl as unknown as Record<string, unknown>, {
      get: (target, key: string) => (key === 'getError' ? () => 1282 : target[key]),
    }) as unknown as WebGL2RenderingContext
    const engine = new HeroEngine(bad, document.createElement('canvas'), 3, { debug: true })
    engine.setSize(320, 200, 1)
    await engine.compile()
    engine.render(state)
    expect(engine.errors.filter((e) => e.startsWith('gl error'))).toHaveLength(1)
    engine.dispose()
  })

  it('forcing RGBA8 mixes the reflection in by weight instead of adding a negative term', async () => {
    const { gl, calls } = fakeGl()
    const engine = new HeroEngine(gl, document.createElement('canvas'), 3, { rgba8: true })
    engine.setSize(320, 200, 1)
    await engine.compile()
    expect(engine.info.hdr).toBe(false)
    expect(engine.render(state)).toBe(true)
    expect(calls['blendFunc']).toBe(1)
    engine.dispose()
  })
})
