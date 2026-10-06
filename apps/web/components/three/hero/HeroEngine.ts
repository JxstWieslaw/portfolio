/**
 * The hero engine — hero monolith spec § 3, § 4.2, § 4.3, § 6.
 *
 * Raw WebGL2, no three.js and no React: a class that owns every GL object, so
 * disposal can be one audited checklist. It draws one scene (background,
 * floor, mirrored objects, real objects) into a half-float target with MSAA,
 * then a post pass writes the canvas.
 *
 * Tiers change the target size, the MSAA sample count, how many dust shards
 * are drawn and the ring thickness. They never change a program, so a tier
 * change cannot recompile anything and cannot stall.
 *
 * Failure is reported, never swallowed: `compile`, `setSize`, `setTier` and
 * `render` return false and leave the reason in `errors`, and the controller
 * turns that into a visible give-up.
 */

import { buildCube, buildDust, buildSlab, buildTorus, PLANES, RINGS, type DustMesh } from '@/lib/hero/geometry'
import type { HeroFrame } from '@/lib/hero/frame'
import { ringK, type Camera } from '@/lib/hero/progress'
import { dustCount, TIERS, type HeroTier } from '@/lib/hero/tiers'
import { FS_BG, FS_FLOOR, FS_OBJECT, FS_POST, OBJECT_MODES, VS_FLOOR, VS_FULL, VS_OBJECT } from './hero.glsl'

export type EngineTier = Exclude<HeroTier, 0>

export interface RenderState {
  /** Seconds. Everything animated is a function of this and `s`. */
  readonly time: number
  /** Assembly, 0..1. */
  readonly s: number
  readonly camera: Camera
  readonly frame: HeroFrame
  /** 1 for film grain, 0 for the deterministic still the parity test and the poster script render. */
  readonly grain: number
}

export interface EngineInfo {
  readonly tier: EngineTier
  readonly width: number
  readonly height: number
  readonly msaa: number
  readonly hdr: boolean
  /** The sample count the tier asks for; `msaa` is lower when the driver refused it. */
  readonly wantedMsaa: number
}

export interface EngineOptions {
  /** Test and dev only: force the RGBA8 target, as on a device without float render targets. */
  readonly rgba8?: boolean
  /** Test and dev only: read `gl.getError()` after the target is built and after the first render. */
  readonly debug?: boolean
}

/**
 * Pixel ceiling of the render target. A 2x desktop canvas would otherwise ask
 * for hundreds of megabytes of multisampled half-float; past this the target
 * is scaled down uniformly and the browser upsamples the canvas.
 */
export const MAX_TARGET_PIXELS = 2_400_000

/** Folds to false in a production build, so the GL error probe below ships only in dev and the test build. */
const DEBUG: boolean = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_MODEL_TEST === '1'

/** A driver that never reports link completion must not hold the hero forever. */
export const COMPILE_DEADLINE_MS = 9000

/** Records the first GL error only: a second one is the same story. Unreferenced (so dropped) in production. */
function noteGlError(gl: WebGL2RenderingContext, errors: string[], where: string): void {
  const code = gl.getError()
  if (code !== 0 && !errors.some((e) => e.startsWith('gl error'))) errors.push(`gl error ${code} ${where}`)
}

const PROGRAM_NAMES = ['slab', 'dust', 'ring', 'floor', 'bg', 'post'] as const
type ProgramName = (typeof PROGRAM_NAMES)[number]

interface Program {
  readonly program: WebGLProgram
  readonly shaders: readonly WebGLShader[]
  readonly locations: Map<string, WebGLUniformLocation | null>
  /** The slab planes are constant: uploaded once per program. */
  planes: boolean
}

interface Basis {
  readonly ro: Float32Array
  readonly uu: Float32Array
  readonly vv: Float32Array
  readonly ww: Float32Array
  px: number
  py: number
}

const PLANE_UNIFORM = new Float32Array(PLANES.flatMap((p) => [p.n[0], p.n[1], p.n[2], p.d]))

export class HeroEngine {
  /** Shader and link logs and other failures, for the give-up marker, the HUD and the test seam. Empty when healthy. */
  readonly errors: string[] = []

  private readonly gl: WebGL2RenderingContext
  private readonly dust: DustMesh
  private programs = new Map<ProgramName, Program>()
  private buffers: WebGLBuffer[] = []
  private vaos: Record<'slab' | 'dust' | 'ring' | 'floor' | 'empty', WebGLVertexArrayObject | null> = {
    slab: null,
    dust: null,
    ring: null,
    floor: null,
    empty: null,
  }
  private slabVertices = 0
  private torusVertices = 0
  private texture: WebGLTexture | null = null
  private resolveFbo: WebGLFramebuffer | null = null
  private msFbo: WebGLFramebuffer | null = null
  private colourRb: WebGLRenderbuffer | null = null
  private depthRb: WebGLRenderbuffer | null = null
  private hdr: boolean
  private msaa = 0
  private tier: EngineTier
  private cssW = 1
  private cssH = 1
  private dpr = 1
  private width = 1
  private height = 1
  private disposed = false
  private checked = false
  private readonly b: Basis = { ro: new Float32Array(3), uu: new Float32Array(3), vv: new Float32Array(3), ww: new Float32Array(3), px: 1, py: 1 }

  /** Null when the browser will not hand out a WebGL2 context. A throwing `getContext` propagates to the caller. */
  static create(canvas: HTMLCanvasElement, tier: EngineTier, options: EngineOptions = {}): HeroEngine | null {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: false })
    return gl ? new HeroEngine(gl, canvas, tier, options) : null
  }

  constructor(
    gl: WebGL2RenderingContext,
    private readonly canvas: HTMLCanvasElement,
    tier: EngineTier,
    private readonly options: EngineOptions = {},
  ) {
    this.gl = gl
    this.tier = tier
    this.dust = buildDust()
    this.hdr = options.rgba8 !== true && (gl.getExtension('EXT_color_buffer_float') !== null || gl.getExtension('EXT_color_buffer_half_float') !== null)
    this.buildMeshes()
  }

  get info(): EngineInfo {
    return { tier: this.tier, width: this.width, height: this.height, msaa: this.msaa, hdr: this.hdr, wantedMsaa: TIERS[this.tier].msaa }
  }

  isLost(): boolean {
    return this.disposed || this.gl.isContextLost()
  }

  // ---------------------------------------------------------------- compile

  /**
   * Creates and links all six programs without a long task. With
   * `KHR_parallel_shader_compile` every link is queued at once and polled, up
   * to a deadline; without it each program is linked in its own task. Resolves
   * true when all six linked; otherwise false with the logs in `errors`.
   */
  async compile(): Promise<boolean> {
    const gl = this.gl
    const parallel = gl.getExtension('KHR_parallel_shader_compile') as { COMPLETION_STATUS_KHR: number } | null
    const sources: readonly (readonly [ProgramName, string, string, number | null])[] = [
      ['slab', VS_OBJECT, FS_OBJECT, OBJECT_MODES.slab],
      ['dust', VS_OBJECT, FS_OBJECT, OBJECT_MODES.dust],
      ['ring', VS_OBJECT, FS_OBJECT, OBJECT_MODES.ring],
      ['floor', VS_FLOOR, FS_FLOOR, null],
      ['bg', VS_FULL, FS_BG, null],
      ['post', VS_FULL, FS_POST, null],
    ]
    for (const [name, vs, fs, mode] of sources) {
      if (this.disposed) return false
      const program = this.link(name, vs, fs, mode)
      if (program === null) return false
      this.programs.set(name, program)
      if (parallel === null) await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
    if (parallel !== null) {
      // Wall time, not frame time: a backgrounded tab throttles timers, so a slow return may time out; accepted.
      const deadline = Date.now() + COMPILE_DEADLINE_MS
      const done = await new Promise<boolean>((resolve) => {
        const poll = (): void => {
          if (this.isLost()) return resolve(true)
          if ([...this.programs.values()].every((p) => gl.getProgramParameter(p.program, parallel.COMPLETION_STATUS_KHR))) return resolve(true)
          if (Date.now() > deadline) return resolve(false)
          setTimeout(poll, 16)
        }
        poll()
      })
      if (!done) {
        this.errors.push('compile timeout')
        return false
      }
    }
    if (this.isLost()) return false
    let ok = true
    for (const [name, p] of this.programs) {
      if (gl.getProgramParameter(p.program, gl.LINK_STATUS)) continue
      ok = false
      const logs = p.shaders.map((s) => gl.getShaderInfoLog(s) ?? '').filter(Boolean)
      this.errors.push(`${name}: ${gl.getProgramInfoLog(p.program) ?? 'link failed'} ${logs.join(' ')}`.trim())
    }
    return ok
  }

  /** Null, with the reason in `errors`, when the driver will not even create the objects. */
  private link(name: string, vs: string, fs: string, mode: number | null): Program | null {
    const gl = this.gl
    const define = mode === null ? '' : `\n#define MODE ${mode}`
    const made: WebGLShader[] = []
    const make = (type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type)
      if (shader === null) return null
      made.push(shader)
      gl.shaderSource(shader, source.replace('#version 300 es', `#version 300 es${define}`))
      gl.compileShader(shader)
      return shader
    }
    const v = make(gl.VERTEX_SHADER, vs)
    const f = make(gl.FRAGMENT_SHADER, fs)
    const program = v && f ? gl.createProgram() : null
    if (!v || !f || !program) {
      for (const s of made) gl.deleteShader(s)
      this.errors.push(`${name}: could not create shader objects`)
      return null
    }
    gl.attachShader(program, v)
    gl.attachShader(program, f)
    gl.linkProgram(program)
    return { program, shaders: [v, f], locations: new Map(), planes: false }
  }

  // ------------------------------------------------------------------ meshes

  private buffer(data: Float32Array, location: number, size: number, divisor = 0): void {
    const gl = this.gl
    const b = gl.createBuffer() as WebGLBuffer
    this.buffers.push(b)
    gl.bindBuffer(gl.ARRAY_BUFFER, b)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0)
    if (divisor > 0) gl.vertexAttribDivisor(location, divisor)
  }

  private vao(build: () => void): WebGLVertexArrayObject {
    const gl = this.gl
    const v = gl.createVertexArray() as WebGLVertexArrayObject
    gl.bindVertexArray(v)
    build()
    gl.bindVertexArray(null)
    return v
  }

  private buildMeshes(): void {
    const gl = this.gl
    const slab = buildSlab()
    const cube = buildCube()
    const torus = buildTorus()
    this.slabVertices = slab.positions.length / 3
    this.torusVertices = torus.length / 2
    this.vaos.slab = this.vao(() => {
      this.buffer(slab.positions, 0, 3)
      this.buffer(slab.normals, 1, 3)
    })
    this.vaos.dust = this.vao(() => {
      this.buffer(cube.positions, 0, 3)
      this.buffer(cube.normals, 1, 3)
      this.buffer(this.dust.instances, 2, 4, 1)
    })
    this.vaos.ring = this.vao(() => {
      this.buffer(torus, 3, 2)
    })
    this.vaos.floor = this.vao(() => {
      this.buffer(new Float32Array([-40, -1.5, -40, 40, -1.5, -40, 40, -1.5, 40, -40, -1.5, -40, 40, -1.5, 40, -40, -1.5, 40]), 0, 3)
    })
    this.vaos.empty = gl.createVertexArray()
  }

  // ------------------------------------------------------------------ target

  /** Css size and device pixel ratio of the canvas. Reallocates only when the pixel size actually changes. False when no target could be built. */
  setSize(cssW: number, cssH: number, dpr: number): boolean {
    this.cssW = Math.max(1, cssW)
    this.cssH = Math.max(1, cssH)
    this.dpr = dpr > 0 ? dpr : 1
    return this.resize()
  }

  /** A tier change rewrites the pixel size, the MSAA count and the dust count. It never touches a program. False when no target could be built. */
  setTier(tier: EngineTier): boolean {
    if (tier === this.tier) return true
    this.tier = tier
    return this.resize()
  }

  private resize(): boolean {
    const scale = Math.min(this.dpr, TIERS[this.tier].dprCap)
    let w = this.cssW * scale
    let h = this.cssH * scale
    if (w * h > MAX_TARGET_PIXELS) {
      const k = Math.sqrt(MAX_TARGET_PIXELS / (w * h))
      w *= k
      h *= k
    }
    const width = Math.max(1, Math.round(w))
    const height = Math.max(1, Math.round(h))
    const samples = TIERS[this.tier].msaa
    if (width === this.width && height === this.height && samples === this.msaa && this.texture !== null) return true
    this.width = width
    this.height = height
    if (this.canvas.width !== width) this.canvas.width = width
    if (this.canvas.height !== height) this.canvas.height = height
    const ok = this.allocate(samples)
    if (DEBUG && ok && this.options.debug === true) noteGlError(this.gl, this.errors, 'after allocate')
    return ok
  }

  private freeTarget(): void {
    const gl = this.gl
    if (this.texture) gl.deleteTexture(this.texture)
    if (this.resolveFbo) gl.deleteFramebuffer(this.resolveFbo)
    if (this.msFbo) gl.deleteFramebuffer(this.msFbo)
    if (this.colourRb) gl.deleteRenderbuffer(this.colourRb)
    if (this.depthRb) gl.deleteRenderbuffer(this.depthRb)
    this.texture = this.resolveFbo = this.msFbo = this.colourRb = this.depthRb = null
  }

  /** Builds the target; falls back to RGBA8, then to no MSAA, when a driver refuses the combination. False when every attempt failed. */
  private allocate(samples: 0 | 4): boolean {
    this.freeTarget()
    const attempts: readonly (readonly [boolean, number])[] = [
      [this.hdr, samples],
      [this.hdr, 0],
      [false, samples],
      [false, 0],
    ]
    for (const [hdr, ms] of attempts) {
      if (this.build(hdr, ms)) {
        this.hdr = hdr
        this.msaa = ms
        return true
      }
      this.freeTarget()
    }
    if (!this.errors.includes('render target incomplete')) this.errors.push('render target incomplete')
    return false
  }

  private build(hdr: boolean, samples: number): boolean {
    const gl = this.gl
    const { width: w, height: h } = this
    this.texture = gl.createTexture()
    if (this.texture === null) return false
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, hdr ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    this.resolveFbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.resolveFbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0)

    this.depthRb = gl.createRenderbuffer()
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthRb)
    if (samples > 0) {
      this.colourRb = gl.createRenderbuffer()
      if (this.colourRb === null) return false
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.colourRb)
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, hdr ? gl.RGBA16F : gl.RGBA8, w, h)
      this.msFbo = gl.createFramebuffer()
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.msFbo)
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, this.colourRb)
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthRb)
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h)
    } else {
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h)
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.resolveFbo)
    }
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depthRb)
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
    if (complete && samples > 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.resolveFbo)
      return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
    }
    return complete
  }

  // ------------------------------------------------------------------ render

  private loc(p: Program, n: string): WebGLUniformLocation | null {
    let l = p.locations.get(n)
    if (l === undefined) {
      l = this.gl.getUniformLocation(p.program, n)
      p.locations.set(n, l)
    }
    return l
  }

  /** Binds a program and sets the uniforms the scene programs share. No allocation per call. */
  private common(name: ProgramName, st: RenderState): Program {
    const gl = this.gl
    const p = this.programs.get(name) as Program
    gl.useProgram(p.program)
    const b = this.b
    gl.uniform2f(this.loc(p, 'uRes'), this.width, this.height)
    gl.uniform1f(this.loc(p, 'uTime'), st.time)
    gl.uniform1f(this.loc(p, 'uS'), st.s)
    gl.uniform2f(this.loc(p, 'uCenter'), st.frame.cx, st.frame.cy)
    gl.uniform1f(this.loc(p, 'uZoom'), st.frame.zoom)
    gl.uniform1f(this.loc(p, 'uAspect'), this.width / this.height)
    gl.uniform3fv(this.loc(p, 'uRo'), b.ro)
    gl.uniform3fv(this.loc(p, 'uUu'), b.uu)
    gl.uniform3fv(this.loc(p, 'uVv'), b.vv)
    gl.uniform3fv(this.loc(p, 'uWw'), b.ww)
    gl.uniform4f(this.loc(p, 'uP'), b.px, b.py, 2 * st.frame.cx - 1, 2 * st.frame.cy - 1)
    gl.uniform1f(this.loc(p, 'uHead'), this.hdr ? 1 : 0.5)
    gl.uniform1f(this.loc(p, 'uMixRefl'), this.hdr ? 0 : 1)
    if (!p.planes) {
      const planes = this.loc(p, 'uPl[0]')
      if (planes) gl.uniform4fv(planes, PLANE_UNIFORM)
      p.planes = true
    }
    return p
  }

  private drawObjects(mirror: number, st: RenderState): void {
    const gl = this.gl
    const spec = TIERS[this.tier]
    const k = ringK(st.s)
    // Generic attribute values are context state, not vertex-array state: set what each draw reads, per draw.
    if (st.s > 0.68) {
      const p = this.common('slab', st)
      gl.uniform1f(this.loc(p, 'uMirror'), mirror)
      gl.bindVertexArray(this.vaos.slab)
      gl.vertexAttrib4f(2, 0, 0, 0, 0)
      gl.vertexAttrib2f(3, 0, 0)
      gl.drawArrays(gl.TRIANGLES, 0, this.slabVertices)
    }
    if (mirror < 0.5 || spec.mirrorDust) {
      const p = this.common('dust', st)
      gl.uniform1f(this.loc(p, 'uMirror'), mirror)
      gl.bindVertexArray(this.vaos.dust)
      gl.vertexAttrib2f(3, 0, 0)
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, dustCount(this.tier, this.dust.inside, this.dust.outer))
    }
    if (k > 0.02) {
      const p = this.common('ring', st)
      gl.uniform1f(this.loc(p, 'uMirror'), mirror)
      gl.bindVertexArray(this.vaos.ring)
      gl.vertexAttrib3f(0, 0, 0, 0)
      gl.vertexAttrib3f(1, 0, 1, 0)
      gl.vertexAttrib4f(2, 0, 0, 0, 0)
      const ringUniform = this.loc(p, 'uRing')
      for (let i = 0; i < RINGS.length; i += 1) {
        const ring = RINGS[i] as (typeof RINGS)[number]
        const radius = ring.major[0] + (ring.major[1] - ring.major[0]) * k
        gl.uniform3f(ringUniform, radius, ring.tube * k * 2.6 * spec.ringThicken + 0.0008, i)
        gl.drawArrays(gl.TRIANGLES, 0, this.torusVertices)
      }
    }
  }

  /** Draws one frame to the canvas. False when there is nothing to draw to (lost, not compiled, no target). */
  render(st: RenderState): boolean {
    const gl = this.gl
    if (this.isLost() || this.texture === null || this.programs.size < PROGRAM_NAMES.length) return false
    this.basis(st)
    const draw = this.msFbo ?? this.resolveFbo

    gl.bindFramebuffer(gl.FRAMEBUFFER, draw)
    gl.viewport(0, 0, this.width, this.height)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.BLEND)
    gl.disable(gl.CULL_FACE)

    this.common('bg', st)
    gl.bindVertexArray(this.vaos.empty)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    this.common('floor', st)
    gl.bindVertexArray(this.vaos.floor)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    // The mirrored objects go into the floor; the real objects then replace what is under them. Half-float adds the
    // reflection's difference from the floor's own environment; RGBA8 cannot hold a negative term, so there the
    // reflection is mixed in by its weight (alpha) instead.
    gl.clearDepth(1)
    gl.depthMask(true)
    gl.clear(gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LESS)
    gl.enable(gl.BLEND)
    gl.blendEquation(gl.FUNC_ADD)
    if (this.hdr) gl.blendFunc(gl.ONE, gl.ONE)
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    this.drawObjects(1, st)
    gl.disable(gl.BLEND)
    gl.clear(gl.DEPTH_BUFFER_BIT)
    this.drawObjects(0, st)
    gl.disable(gl.DEPTH_TEST)

    if (this.msFbo !== null) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msFbo)
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.resolveFbo)
      gl.blitFramebuffer(0, 0, this.width, this.height, 0, 0, this.width, this.height, gl.COLOR_BUFFER_BIT, gl.NEAREST)
      // The multisampled attachments are not read again: tell tilers they need not be written back.
      gl.invalidateFramebuffer(gl.READ_FRAMEBUFFER, [gl.COLOR_ATTACHMENT0, gl.DEPTH_ATTACHMENT])
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.width, this.height)
    const post = this.programs.get('post') as Program
    gl.useProgram(post.program)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.uniform1i(this.loc(post, 'uTex'), 0)
    gl.uniform2f(this.loc(post, 'uRes'), this.width, this.height)
    gl.uniform1f(this.loc(post, 'uTime'), st.time)
    gl.uniform1f(this.loc(post, 'uAspect'), this.width / this.height)
    gl.uniform1f(this.loc(post, 'uGrain'), st.grain)
    gl.uniform1f(this.loc(post, 'uHead'), this.hdr ? 1 : 0.5)
    gl.bindVertexArray(this.vaos.empty)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
    if (DEBUG && this.options.debug === true && !this.checked) {
      this.checked = true
      noteGlError(this.gl, this.errors, 'after first render')
    }
    return true
  }

  /**
   * One 1x1 scissored frame, so a driver that defers real compilation to first
   * use pays for it while the poster is still on top. Draws every program.
   */
  prime(frame: HeroFrame, camera: Camera): boolean {
    const gl = this.gl
    gl.enable(gl.SCISSOR_TEST)
    gl.scissor(0, 0, 1, 1)
    const ok = this.render({ time: 0, s: 1, camera, frame, grain: 0 })
    gl.disable(gl.SCISSOR_TEST)
    return ok
  }

  /** Fills the preallocated camera basis in place: the per-frame path allocates nothing. */
  private basis(st: RenderState): void {
    const { yaw, pitch, dist, focal } = st.camera
    const b = this.b
    const cp = Math.cos(pitch)
    const rx = dist * Math.sin(yaw) * cp
    const ry = dist * Math.sin(pitch)
    const rz = dist * Math.cos(yaw) * cp
    b.ro[0] = rx
    b.ro[1] = ry
    b.ro[2] = rz
    const l = Math.hypot(rx, ry, rz) || 1
    const wx = -rx / l
    const wy = -ry / l
    const wz = -rz / l
    // uu = normalize(cross(ww, up)) with up = (0, 1, 0)
    const ul = Math.hypot(wz, wx) || 1
    const ux = -wz / ul
    const uz = wx / ul
    b.ww[0] = wx
    b.ww[1] = wy
    b.ww[2] = wz
    b.uu[0] = ux
    b.uu[1] = 0
    b.uu[2] = uz
    // vv = cross(uu, ww)
    b.vv[0] = 0 * wz - uz * wy
    b.vv[1] = uz * wx - ux * wz
    b.vv[2] = ux * wy - 0 * wx
    const aspect = this.width / this.height
    b.px = (2 * focal) / (aspect * st.frame.zoom)
    b.py = (2 * focal) / st.frame.zoom
  }

  // ----------------------------------------------------------------- dispose

  /**
   * The disposal checklist (spec § 6): every program, shader, buffer, vertex
   * array, texture, framebuffer and renderbuffer is deleted, then the context
   * slot is released at once. Idempotent. `release: false` is for a lost
   * context that will be restored on the same canvas: the objects are dead
   * already, and losing the context again would stop the restore.
   */
  dispose(release = true): void {
    if (this.disposed) return
    this.disposed = true
    const gl = this.gl
    for (const p of this.programs.values()) {
      gl.deleteProgram(p.program)
      for (const s of p.shaders) gl.deleteShader(s)
    }
    this.programs.clear()
    for (const b of this.buffers) gl.deleteBuffer(b)
    this.buffers = []
    for (const key of Object.keys(this.vaos) as (keyof HeroEngine['vaos'])[]) {
      const v = this.vaos[key]
      if (v) gl.deleteVertexArray(v)
      this.vaos[key] = null
    }
    this.freeTarget()
    if (release) {
      try {
        gl.getExtension('WEBGL_lose_context')?.loseContext()
      } catch {
        // The slot is freed when the canvas is collected.
      }
    }
  }
}
