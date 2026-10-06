import { describe, expect, it, vi } from 'vitest'
import { HeroEngine } from '@/components/three/hero/HeroEngine'
import { cameraFor } from '@/lib/hero/progress'

/**
 * A GL context that records every call. Constants (`gl.TRIANGLES`) answer with
 * stable numbers, `create*` answer with fresh objects, and a few calls answer
 * the way a healthy driver does, so the engine runs its whole life without a
 * browser. This is the disposal checklist of spec § 6 as an executable table.
 */
function fakeGl(options: { lost?: () => boolean } = {}) {
  const calls: Record<string, number> = {}
  const constants = new Map<string, number>()
  const loseContext = vi.fn()
  const extension = (name: string): unknown => (name === 'WEBGL_lose_context' ? { loseContext } : name === 'EXT_color_buffer_float' ? {} : null)
  const gl = new Proxy({} as Record<string, unknown>, {
    get(_target, key: string) {
      if (/^[A-Z][A-Z0-9_]*$/.test(key)) {
        if (!constants.has(key)) constants.set(key, constants.size + 1)
        return constants.get(key)
      }
      return (...args: unknown[]) => {
        calls[key] = (calls[key] ?? 0) + 1
        if (key === 'getExtension') return extension(String(args[0]))
        if (key === 'isContextLost') return options.lost?.() ?? false
        if (key === 'getProgramParameter') return true
        if (key === 'checkFramebufferStatus') return constants.get('FRAMEBUFFER_COMPLETE') ?? (constants.set('FRAMEBUFFER_COMPLETE', constants.size + 1), constants.get('FRAMEBUFFER_COMPLETE'))
        if (key === 'getShaderInfoLog' || key === 'getProgramInfoLog') return ''
        if (key.startsWith('create')) return { made: key, n: calls[key] }
        return undefined
      }
    },
  })
  return { gl: gl as unknown as WebGL2RenderingContext, calls, loseContext }
}

const frame = { cx: 0.5, cy: 0.5, zoom: 1 }
const state = { time: 1, s: 1, camera: cameraFor(1, 0, 1, { x: 0.5, y: 0.5, active: 0 }), frame, grain: 1 }

async function liveEngine(tier: 1 | 2 | 3 = 3, lost?: () => boolean) {
  const fake = fakeGl({ lost })
  const engine = new HeroEngine(fake.gl, document.createElement('canvas'), tier)
  engine.setSize(640, 400, 1)
  expect(await engine.compile()).toBe(true)
  return { ...fake, engine }
}

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
    engine.setTier(1)
    engine.setTier(2)
    expect(calls['createProgram']).toBe(programs)
    engine.dispose()
    expect(calls['createTexture']).toBe(calls['deleteTexture'])
    expect(calls['createFramebuffer']).toBe(calls['deleteFramebuffer'])
    expect(calls['createRenderbuffer']).toBe(calls['deleteRenderbuffer'])
  })
})

describe('HeroEngine context loss', () => {
  it('draws nothing on a lost context and reports it', async () => {
    let lost = false
    const { engine, calls } = await liveEngine(3, () => lost)
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
