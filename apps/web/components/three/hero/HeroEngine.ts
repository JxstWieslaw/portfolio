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
}

/**
 * Pixel ceiling of the render target. A 2x desktop canvas would otherwise ask
 * for hundreds of megabytes of multisampled half-float; past this the target
 * is scaled down uniformly and the browser upsamples the canvas.
 */
export const MAX_TARGET_PIXELS = 2_400_000

const PROGRAM_NAMES = ['slab', 'dust', 'ring', 'floor', 'bg', 'post'] as const
type ProgramName = (typeof PROGRAM_NAMES)[number]

interface Program {
  readonly program: WebGLProgram
  readonly shaders: readonly WebGLShader[]
  readonly locations: Map<string, WebGLUniformLocation | null>
}

const PLANE_UNIFORM = new Float32Array(PLANES.flatMap((p) => [p.n[0], p.n[1], p.n[2], p.d]))

type V3 = readonly [number, number, number]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

export class HeroEngine {
  /** Shader and link logs, for the test seam and the HUD. Empty when everything compiled. */
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

  /** Returns null when the browser will not hand out a WebGL2 context. */
  static create(canvas: HTMLCanvasElement, tier: EngineTier): HeroEngine | null {
    let gl: WebGL2RenderingContext | null = null
    try {
      gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: false })
    } catch {
      return null
    }
    return gl ? new HeroEngine(gl, canvas, tier) : null
  }

  constructor(
    gl: WebGL2RenderingContext,
    private readonly canvas: HTMLCanvasElement,
    tier: EngineTier,
  ) {
    this.gl = gl
    this.tier = tier
    this.dust = buildDust()
    this.hdr = gl.getExtension('EXT_color_buffer_float') !== null || gl.getExtension('EXT_color_buffer_half_float') !== null
    this.buildMeshes()
  }

  get info(): EngineInfo {
    return { tier: this.tier, width: this.width, height: this.height, msaa: this.msaa, hdr: this.hdr }
  }

  isLost(): boolean {
    return this.disposed || this.gl.isContextLost()
  }

  // ---------------------------------------------------------------- compile

  /**
   * Creates and links all six programs without a long task. With
   * `KHR_parallel_shader_compile` every link is queued at once and polled;
   * without it each program is linked in its own task. Resolves true when all
   * six linked.
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
      this.programs.set(name, this.link(vs, fs, mode))
      if (parallel === null) await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
    if (parallel !== null) {
      await new Promise<void>((resolve) => {
        const poll = (): void => {
          if (this.isLost()) return resolve()
          if ([...this.programs.values()].every((p) => gl.getProgramParameter(p.program, parallel.COMPLETION_STATUS_KHR))) return resolve()
          setTimeout(poll, 16)
        }
        poll()
      })
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

  private link(vs: string, fs: string, mode: number | null): Program {
    const gl = this.gl
    const define = mode === null ? '' : `\n#define MODE ${mode}`
    const make = (type: number, source: string): WebGLShader => {
      const shader = gl.createShader(type) as WebGLShader
      gl.shaderSource(shader, source.replace('#version 300 es', `#version 300 es${define}`))
      gl.compileShader(shader)
      return shader
    }
    const v = make(gl.VERTEX_SHADER, vs)
    const f = make(gl.FRAGMENT_SHADER, fs)
    const program = gl.createProgram() as WebGLProgram
    gl.attachShader(program, v)
    gl.attachShader(program, f)
    gl.linkProgram(program)
    return { program, shaders: [v, f], locations: new Map() }
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
      gl.vertexAttrib4f(2, 0, 0, 0, 0)
      gl.vertexAttrib2f(3, 0, 0)
    })
    this.vaos.dust = this.vao(() => {
      this.buffer(cube.positions, 0, 3)
      this.buffer(cube.normals, 1, 3)
      this.buffer(this.dust.instances, 2, 4, 1)
      gl.vertexAttrib2f(3, 0, 0)
    })
    this.vaos.ring = this.vao(() => {
      gl.vertexAttrib3f(0, 0, 0, 0)
      gl.vertexAttrib3f(1, 0, 1, 0)
      gl.vertexAttrib4f(2, 0, 0, 0, 0)
      this.buffer(torus, 3, 2)
    })
    this.vaos.floor = this.vao(() => {
      this.buffer(new Float32Array([-40, -1.5, -40, 40, -1.5, -40, 40, -1.5, 40, -40, -1.5, -40, 40, -1.5, 40, -40, -1.5, 40]), 0, 3)
    })
    this.vaos.empty = gl.createVertexArray()
  }

  // ------------------------------------------------------------------ target

  /** Css size and device pixel ratio of the canvas. Reallocates only when the pixel size actually changes. */
  setSize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = Math.max(1, cssW)
    this.cssH = Math.max(1, cssH)
    this.dpr = dpr > 0 ? dpr : 1
    this.resize()
  }

  /** A tier change rewrites the pixel size, the MSAA count and the dust count. It never touches a program. */
  setTier(tier: EngineTier): void {
    if (tier === this.tier) return
    this.tier = tier
    this.resize()
  }

  private resize(): void {
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
    if (width === this.width && height === this.height && samples === this.msaa && this.texture !== null) return
    this.width = width
    this.height = height
    if (this.canvas.width !== width) this.canvas.width = width
    if (this.canvas.height !== height) this.canvas.height = height
    this.allocate(samples)
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

  /** Builds the target; falls back to RGBA8, then to no MSAA, when a driver refuses the combination. */
  private allocate(samples: 0 | 4): void {
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
        return
      }
      this.freeTarget()
    }
    this.errors.push('render target incomplete')
  }

  private build(hdr: boolean, samples: number): boolean {
    const gl = this.gl
    const { width: w, height: h } = this
    this.texture = gl.createTexture()
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

  private uniforms(name: ProgramName): Uni {
    const gl = this.gl
    const p = this.programs.get(name) as Program
    gl.useProgram(p.program)
    return {
      use: (n: string): WebGLUniformLocation | null => {
        if (!p.locations.has(n)) p.locations.set(n, gl.getUniformLocation(p.program, n))
        return p.locations.get(n) ?? null
      },
    }
  }

  private common(name: ProgramName, st: RenderState, basis: Basis): Uni {
    const gl = this.gl
    const u = this.uniforms(name)
    gl.uniform2f(u.use('uRes'), this.width, this.height)
    gl.uniform1f(u.use('uTime'), st.time)
    gl.uniform1f(u.use('uS'), st.s)
    gl.uniform2f(u.use('uCenter'), st.frame.cx, st.frame.cy)
    gl.uniform1f(u.use('uZoom'), st.frame.zoom)
    gl.uniform1f(u.use('uAspect'), this.width / this.height)
    gl.uniform3fv(u.use('uRo'), basis.ro)
    gl.uniform3fv(u.use('uUu'), basis.uu)
    gl.uniform3fv(u.use('uVv'), basis.vv)
    gl.uniform3fv(u.use('uWw'), basis.ww)
    gl.uniform4f(u.use('uP'), basis.px, basis.py, 2 * st.frame.cx - 1, 2 * st.frame.cy - 1)
    gl.uniform1f(u.use('uHead'), this.hdr ? 1 : 0.5)
    const planes = u.use('uPl[0]')
    if (planes) gl.uniform4fv(planes, PLANE_UNIFORM)
    return u
  }

  private drawObjects(mirror: number, st: RenderState, basis: Basis): void {
    const gl = this.gl
    const spec = TIERS[this.tier]
    const k = ringK(st.s)
    if (st.s > 0.68) {
      const u = this.common('slab', st, basis)
      gl.uniform1f(u.use('uMirror'), mirror)
      gl.bindVertexArray(this.vaos.slab)
      gl.drawArrays(gl.TRIANGLES, 0, this.slabVertices)
    }
    if (mirror < 0.5 || spec.mirrorDust) {
      const u = this.common('dust', st, basis)
      gl.uniform1f(u.use('uMirror'), mirror)
      gl.bindVertexArray(this.vaos.dust)
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, dustCount(this.tier, this.dust.inside, this.dust.outer))
    }
    if (k > 0.02) {
      const u = this.common('ring', st, basis)
      gl.uniform1f(u.use('uMirror'), mirror)
      gl.bindVertexArray(this.vaos.ring)
      RINGS.forEach((ring, i) => {
        const radius = ring.major[0] + (ring.major[1] - ring.major[0]) * k
        gl.uniform3f(u.use('uRing'), radius, ring.tube * k * 1.6 * spec.ringThicken + 0.0008, i)
        gl.drawArrays(gl.TRIANGLES, 0, this.torusVertices)
      })
    }
  }

  /** Draws one frame to the canvas. Returns false when there is nothing to draw to (lost, not compiled, no target). */
  render(st: RenderState): boolean {
    const gl = this.gl
    if (this.isLost() || this.texture === null || this.programs.size < PROGRAM_NAMES.length) return false
    const basis = this.basis(st)
    const draw = this.msFbo ?? this.resolveFbo

    gl.bindFramebuffer(gl.FRAMEBUFFER, draw)
    gl.viewport(0, 0, this.width, this.height)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.BLEND)
    gl.disable(gl.CULL_FACE)

    this.common('bg', st, basis)
    gl.bindVertexArray(this.vaos.empty)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    this.common('floor', st, basis)
    gl.bindVertexArray(this.vaos.floor)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    // The mirrored objects add into the floor; the real objects then replace what is under them.
    gl.clearDepth(1)
    gl.depthMask(true)
    gl.clear(gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LESS)
    gl.enable(gl.BLEND)
    gl.blendEquation(gl.FUNC_ADD)
    gl.blendFunc(gl.ONE, gl.ONE)
    this.drawObjects(1, st, basis)
    gl.disable(gl.BLEND)
    gl.clear(gl.DEPTH_BUFFER_BIT)
    this.drawObjects(0, st, basis)
    gl.disable(gl.DEPTH_TEST)

    if (this.msFbo !== null) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msFbo)
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.resolveFbo)
      gl.blitFramebuffer(0, 0, this.width, this.height, 0, 0, this.width, this.height, gl.COLOR_BUFFER_BIT, gl.NEAREST)
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.width, this.height)
    const post = this.uniforms('post')
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.uniform1i(post.use('uTex'), 0)
    gl.uniform2f(post.use('uRes'), this.width, this.height)
    gl.uniform1f(post.use('uTime'), st.time)
    gl.uniform1f(post.use('uAspect'), this.width / this.height)
    gl.uniform1f(post.use('uGrain'), st.grain)
    gl.uniform1f(post.use('uHead'), this.hdr ? 1 : 0.5)
    gl.bindVertexArray(this.vaos.empty)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
    return true
  }

  /**
   * One 1x1 scissored frame, so a driver that defers real compilation to first
   * use pays for it while the poster is still on top. Draws every program.
   */
  prime(frame: HeroFrame, camera: Camera): void {
    const gl = this.gl
    gl.enable(gl.SCISSOR_TEST)
    gl.scissor(0, 0, 1, 1)
    this.render({ time: 0, s: 1, camera, frame, grain: 0 })
    gl.disable(gl.SCISSOR_TEST)
  }

  private basis(st: RenderState): Basis {
    const { yaw, pitch, dist, focal } = st.camera
    const ro: V3 = [dist * Math.sin(yaw) * Math.cos(pitch), dist * Math.sin(pitch), dist * Math.cos(yaw) * Math.cos(pitch)]
    const ww = norm(sub([0, 0, 0], ro))
    const uu = norm(cross(ww, [0, 1, 0]))
    const vv = cross(uu, ww)
    const aspect = this.width / this.height
    return { ro, uu, vv, ww, px: (2 * focal) / (aspect * st.frame.zoom), py: (2 * focal) / st.frame.zoom }
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

interface Basis {
  readonly ro: V3
  readonly uu: V3
  readonly vv: V3
  readonly ww: V3
  readonly px: number
  readonly py: number
}


interface Uni {
  readonly use: (name: string) => WebGLUniformLocation | null
}
