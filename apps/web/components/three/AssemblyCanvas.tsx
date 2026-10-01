'use client'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react'
import {
  ACESFilmicToneMapping,
  BoxGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PMREMGenerator,
  PlaneGeometry,
  Scene as ThreeScene,
  Vector3,
  type PerspectiveCamera,
  type WebGLRenderTarget,
  type WebGLRenderer,
} from 'three'
import { ARTEFACT_CENTRE, ARTEFACT_LIGHT_INTENSITY, igniteScale } from '@/lib/assembly/artefact'
import { assemblyBuilder, createBundleCache } from '@/lib/assembly/bundle-cache'
import { ASSEMBLY_SECONDS, SETTLE_SECONDS, resolveAssembly } from '@/lib/assembly/cloud'
import { ENVIRONMENT_INTENSITY, LIGHTFORMERS } from '@/lib/assembly/environment'
import { pointerRay } from '@/lib/assembly/pointer-ray'
import { isFormationId, resolveScroll, type ScrollState, type SectionBox } from '@/lib/assembly/scroll'
import { EMPTY_SLOTS, planSlots, type SlotState } from '@/lib/assembly/slots'
import {
  CAMERA_DISTANCE,
  FOV_LANDSCAPE,
  frameFor,
  frameScalars,
  instanceCount,
  seedsFor,
  type BundleKind,
  type FrameScalars,
} from '@/lib/assembly/targets'
import { FORMATIONS, washCss, type FormationId } from '@/lib/formations/config'
import { createArtefact, type Artefact } from './Artefact'
import { attachSlots, createAssemblyMaterial, createAssemblyUniforms, type AssemblySlots, type AssemblyUniforms } from './AssemblyMaterial'

/**
 * The only module that imports three (through `AssemblyMaterial` and
 * `Artefact`). Loaded through `next/dynamic` from `AssemblyLayer`; never
 * imported by a unit test.
 *
 * One `InstancedMesh` of cubes morphs between the seven formations on the
 * GPU — journey spec § 4, § 5.1. Two attribute slots hold the formation the
 * visitor is leaving and the one they are heading to; the vertex program
 * staggers each cube by its seed, swirls it through curl noise mid-flight,
 * tumbles it half a turn and lands it exactly on its measured point. The CPU
 * writes a handful of uniforms per frame and one slot per formation change;
 * the frame loop writes no per-instance data.
 *
 * On load the monolith assembles from a seeded cloud around the hero artefact
 * (§ 3.1). Lighting: hemisphere + sun for the flat top-face read, plus a
 * five-plane lightformer environment baked through PMREM one frame after the
 * first draw (§ 5.3).
 *
 * Frame loop is `demand`: scroll, pointer and resize invalidate; a 30 fps
 * ticker invalidates for the idle breathing while the tab is visible and the
 * layer is not faded out. Nothing runs while `document.hidden`.
 */

export interface AssemblyCanvasProps {
  /** Instance fraction from the 2D ladder — `1`, or `REDUCED_KEEP`. */
  readonly keep: number
  /** Called `true` after the first drawn frame and on context restore, `false` on loss. */
  readonly onLive: (live: boolean) => void
  /** Second context loss in a session: unmount for good. */
  readonly onGiveUp: () => void
}

/** Idle wobble — the 2D hero's values, verbatim. */
const WOBBLE_RATE = 0.35
const WOBBLE_AMPLITUDE = 0.05
const BREATH_RATE = 0.8
const BREATH_AMPLITUDE = 0.012

/** Per-instance vertical bob, as a fraction of viewport height. */
const BOB = 0.004

/** Pointer repulsion radius as a fraction of viewport height, and its push. */
const REPEL_RADIUS = 0.12
const REPEL_STRENGTH = 0.6
/** The push is stateless on the GPU; its softness is this damping on the CPU (§ 5.1). */
const REPEL_RISE = 8
const REPEL_FALL = 4

/** Group parallax toward the pointer, radians (3 degrees). */
const PARALLAX = (3 * Math.PI) / 180

/**
 * 20 on touch devices (the 2D hero this replaces ran at 20), 30 on pointer
 * devices. Evaluated once: this module only ever loads in the browser.
 */
const BREATH_FPS = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 ? 20 : 30

interface PointerState {
  x: number
  y: number
  active: boolean
}

interface AssemblyStore {
  scroll: ScrollState
  pointer: PointerState
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function measureSections(): SectionBox[] {
  const scrollY = window.scrollY
  return Array.from(document.querySelectorAll<HTMLElement>('main [data-section]')).map((element) => {
    const rect = element.getBoundingClientRect()
    const formation = element.dataset.formation
    return {
      id: element.dataset.section ?? '',
      formation: isFormationId(formation) ? formation : null,
      top: rect.top + scrollY,
      height: rect.height,
    }
  })
}

/**
 * Measures the sections once on mount, on resize and when fonts settle; reads
 * `scrollY` in a passive listener throttled to one read per animation frame.
 * Nothing here touches React state — the result goes straight to the store.
 */
function useAssemblyScroll(apply: (state: ScrollState) => void): void {
  useEffect(() => {
    let boxes: SectionBox[] = []
    let frame = 0
    let disposed = false

    const read = (): void => {
      frame = 0
      if (disposed) return
      apply(resolveScroll(boxes, window.scrollY, window.innerHeight))
    }
    const schedule = (): void => {
      if (!frame) frame = requestAnimationFrame(read)
    }
    const measure = (): void => {
      if (disposed) return
      boxes = measureSections()
      schedule()
    }

    measure()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', measure)
    if (document.fonts) void document.fonts.ready.then(measure).catch(() => {})

    return () => {
      disposed = true
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', measure)
    }
  }, [apply])
}

interface Rig {
  readonly group: Group
  readonly mesh: InstancedMesh
  readonly slots: AssemblySlots
  readonly uniforms: AssemblyUniforms
  readonly artefact: Artefact
  readonly hemisphere: HemisphereLight
  readonly sun: DirectionalLight
  readonly inverse: Matrix4
  dispose(): void
}

function createRig(capacity: number): Rig {
  const geometry = new BoxGeometry(1, 1, 1)
  const slots = attachSlots(geometry, capacity, seedsFor(capacity))
  const uniforms = createAssemblyUniforms()
  const material = createAssemblyMaterial(uniforms)
  const mesh = new InstancedMesh(geometry, material, capacity)
  mesh.frustumCulled = false
  // Position, scale and rotation live in the vertex program; the instance
  // matrices are identity, written once here and never again.
  const matrices = mesh.instanceMatrix.array as Float32Array
  for (let i = 0; i < capacity; i += 1) {
    matrices.fill(0, i * 16, i * 16 + 16)
    matrices[i * 16] = 1
    matrices[i * 16 + 5] = 1
    matrices[i * 16 + 10] = 1
    matrices[i * 16 + 15] = 1
  }
  mesh.instanceMatrix.needsUpdate = true

  const artefact = createArtefact()
  artefact.group.scale.setScalar(0)

  const group = new Group()
  group.add(mesh, artefact.group)

  // Sky a dim violet, ground near-black; one key light from above-left so the
  // top faces read lit, like the 2D painter's highlight band.
  const hemisphere = new HemisphereLight(new Color('#6d4bd1'), new Color('#06080c'), 1.1)
  const sun = new DirectionalLight(0xffffff, 1.6)
  sun.position.set(-4, 7, 5)

  return {
    group,
    mesh,
    slots,
    uniforms,
    artefact,
    hemisphere,
    sun,
    inverse: new Matrix4(),
    dispose() {
      geometry.dispose()
      material.dispose()
      mesh.dispose()
      artefact.dispose()
    },
  }
}

/** The lightformer scene, baked to a PMREM once (§ 5.3). */
function bakeEnvironment(gl: WebGLRenderer): WebGLRenderTarget {
  const scene = new ThreeScene()
  const geometry = new PlaneGeometry(1, 1)
  const materials: MeshBasicMaterial[] = []
  for (const former of LIGHTFORMERS) {
    const material = new MeshBasicMaterial({ color: new Color(former.color).multiplyScalar(former.intensity), side: DoubleSide })
    materials.push(material)
    const plane = new Mesh(geometry, material)
    plane.position.set(former.position[0], former.position[1], former.position[2])
    plane.scale.set(former.size[0], former.size[1], 1)
    plane.lookAt(0, 0, 0)
    scene.add(plane)
  }
  const generator = new PMREMGenerator(gl)
  // 64 px faces: five soft planes need no detail, and 256 would allocate a 6.3 MB target.
  const target = generator.fromScene(scene, 0.04, 0.1, 100, { size: 64 })
  generator.dispose()
  geometry.dispose()
  for (const material of materials) material.dispose()
  return target
}

interface SceneProps {
  readonly store: RefObject<AssemblyStore>
  readonly keep: number
  readonly onLive: (live: boolean) => void
  readonly onGiveUp: () => void
  readonly bindInvalidate: (invalidate: () => void) => void
}

function Scene({ store, keep, onLive, onGiveUp, bindInvalidate }: SceneProps) {
  const { gl, scene, camera, size, invalidate } = useThree()

  useEffect(() => {
    bindInvalidate(invalidate)
  }, [bindInvalidate, invalidate])

  const capacity = useMemo(() => instanceCount(keep), [keep])
  const frame = useMemo(() => frameFor(size.width, size.height), [size.width, size.height])
  // Frame-invariant bundles, built on first use. Mount primes the cloud and
  // the hero only; the next formation is built the first time the scroll
  // store names it.
  const bundles = useMemo(() => {
    const cache = createBundleCache(
      assemblyBuilder(capacity, keep, (moved) => {
        if (process.env.NODE_ENV !== 'production') console.info(`[assembly] artefact clearance moved ${moved} cubes`)
      }),
    )
    cache.get('cloud')
    cache.get('monolith')
    return cache
  }, [capacity, keep])
  // The O(1) per-frame scalars, memoised per viewport so a frame does no `tan`.
  const scalars = useMemo(() => {
    const map = new Map<BundleKind, FrameScalars>()
    return (kind: BundleKind): FrameScalars => {
      let s = map.get(kind)
      if (!s) {
        s = frameScalars(FORMATIONS[kind === 'cloud' ? 'monolith' : kind], frame)
        map.set(kind, s)
      }
      return s
    }
  }, [frame])

  const rig = useMemo(() => createRig(capacity), [capacity])
  const slotState = useRef<SlotState>(EMPTY_SLOTS)
  // The environment is baked *before* the programs are compiled so the variant
  // that links is the final one (the envMap define is part of the program key).
  const environment = useRef<WebGLRenderTarget | null>(null)
  // Shaders link before the first visible frame: `compileAsync` resolves once
  // the programs are ready (KHR_parallel_shader_compile where available), so
  // the first drawn frame has no link stall. Until then the priority-1 frame
  // below draws nothing, and the 2D canvases keep painting.
  const compiled = useRef(false)
  const prepare = useCallback(
    (onReady: () => void): (() => void) => {
      compiled.current = false
      environment.current?.dispose()
      environment.current = bakeEnvironment(gl)
      scene.environment = environment.current.texture
      scene.environmentIntensity = ENVIRONMENT_INTENSITY
      let cancelled = false
      const ready = (): void => {
        if (cancelled) return
        compiled.current = true
        onReady()
      }
      gl.compileAsync(scene, camera).then(ready, ready)
      return () => {
        cancelled = true
      }
    },
    [gl, scene, camera],
  )
  useEffect(() => {
    scene.add(rig.group, rig.hemisphere, rig.sun)
    // Fresh buffers on the GPU: the slots hold nothing until written.
    slotState.current = EMPTY_SLOTS
    const cancel = prepare(invalidate)
    return () => {
      cancel()
      scene.remove(rig.group, rig.hemisphere, rig.sun)
      scene.environment = null
      environment.current?.dispose()
      environment.current = null
      rig.dispose()
    }
  }, [scene, rig, prepare, invalidate])

  // The camera and the framing maths share `frame`, so the anchor lands on the pixel.
  useEffect(() => {
    const perspective = camera as PerspectiveCamera
    perspective.fov = frame.fov
    perspective.position.set(0, 0, frame.distance)
    perspective.lookAt(0, 0, 0)
    perspective.updateProjectionMatrix()
    invalidate()
  }, [camera, frame, invalidate])

  // Breathing ticker: only while visible and not faded out.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.hidden || store.current.scroll.opacity <= 0) return
      invalidate()
    }, 1000 / BREATH_FPS)
    return () => window.clearInterval(id)
  }, [invalidate, store])

  // Pointer devices only: touch gets breathing and scroll, nothing to chase.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function' || !window.matchMedia('(pointer: fine)').matches) return undefined
    const pointer = store.current.pointer
    const move = (event: PointerEvent): void => {
      pointer.x = event.clientX
      pointer.y = event.clientY
      pointer.active = true
      invalidate()
    }
    const leave = (): void => {
      pointer.active = false
      invalidate()
    }
    window.addEventListener('pointermove', move, { passive: true })
    document.documentElement.addEventListener('pointerleave', leave)
    return () => {
      window.removeEventListener('pointermove', move)
      document.documentElement.removeEventListener('pointerleave', leave)
    }
  }, [invalidate, store])

  // Context loss: fade the 2D layer back in; give up for the session on the second loss.
  // A restore re-bakes the environment; the attribute slots re-upload themselves.
  useEffect(() => {
    const element = gl.domElement
    let losses = 0
    const lost = (event: Event): void => {
      event.preventDefault()
      losses += 1
      onLive(false)
      if (losses >= 2) onGiveUp()
    }
    let cancelPrepare = (): void => {}
    const restored = (): void => {
      if (losses >= 2) return
      // Re-bake, re-link, then draw: the same order as the mount.
      cancelPrepare()
      cancelPrepare = prepare(() => {
        onLive(true)
        invalidate()
      })
    }
    element.addEventListener('webglcontextlost', lost)
    element.addEventListener('webglcontextrestored', restored)
    return () => {
      cancelPrepare()
      element.removeEventListener('webglcontextlost', lost)
      element.removeEventListener('webglcontextrestored', restored)
    }
  }, [gl, prepare, onLive, onGiveUp, invalidate])

  const live = useRef(false)
  const liveFrame = useRef(0)
  // An unmount in the frame between drawing and flagging must not leave
  // data-gl set with no layer behind it.
  useEffect(
    () => () => {
      if (liveFrame.current) cancelAnimationFrame(liveFrame.current)
    },
    [],
  )
  const motion = useRef({ parallaxX: 0, parallaxY: 0, repel: 0 })
  /** The on-load assembly clock; `-1` until the first drawn frame. */
  const assemblyStart = useRef(-1)
  const pointerLocal = useMemo(() => new Vector3(), [])
  const viewLocal = useMemo(() => new Vector3(), [])

  // Priority 1: R3F skips its own render when a subscriber has priority > 0,
  // so nothing is drawn (and nothing links synchronously) until `compileAsync`
  // has resolved. Every frame that gets past the gates ends in `gl.render`.
  useFrame((state, delta) => {
    const scroll = store.current.scroll
    if (!compiled.current) return
    if (scroll.opacity <= 0 && live.current) return

    const t = state.clock.elapsedTime
    const dt = Math.min(delta, 0.1)
    const { group, mesh, uniforms, slots, artefact, inverse } = rig
    const pointer = store.current.pointer

    // The on-load assembly: cloud -> monolith on a clock from the first drawn
    // frame, then the scroll state settles in without a step (`resolveAssembly`).
    if (assemblyStart.current < 0) assemblyStart.current = t
    const elapsed = t - assemblyStart.current
    const { from, to, mix } = resolveAssembly(scroll, elapsed)

    // Formation change: write the slot that is not holding `from`, flip uSwap.
    const plan = planSlots(slotState.current, from, to)
    for (const write of plan.writes) slots.write(write.slot, bundles.get(write.kind))
    slotState.current = plan.state
    uniforms.uSwap.value = plan.swap
    const a = bundles.get(plan.state.a ?? from)
    const b = bundles.get(plan.state.b ?? to)
    const sa = scalars(plan.state.a ?? from)
    const sb = scalars(plan.state.b ?? to)
    const sFrom = scalars(from)
    const sTo = scalars(to)
    const bFrom = bundles.get(from)
    const bTo = bundles.get(to)

    // Group: anchor, formation rotation, idle wobble, pointer parallax, breath, ultrawide spread.
    const wobble = Math.sin(t * WOBBLE_RATE) * WOBBLE_AMPLITUDE
    const breath = 1 + BREATH_AMPLITUDE * Math.sin(t * BREATH_RATE)
    const nx = pointer.active ? (pointer.x / size.width) * 2 - 1 : 0
    const ny = pointer.active ? (pointer.y / size.height) * 2 - 1 : 0
    const m = motion.current
    const ease = 1 - Math.exp(-dt * 6)
    m.parallaxX += (ny * PARALLAX - m.parallaxX) * ease
    m.parallaxY += (nx * PARALLAX - m.parallaxY) * ease
    group.position.set(lerp(sFrom.anchor[0], sTo.anchor[0], mix), lerp(sFrom.anchor[1], sTo.anchor[1], mix), 0)
    group.rotation.set(lerp(bFrom.tilt, bTo.tilt, mix) + m.parallaxX, lerp(bFrom.rot, bTo.rot, mix) + wobble + m.parallaxY, 0)
    group.scale.set(breath * lerp(sFrom.spreadX, sTo.spreadX, mix), breath, breath)
    group.updateMatrixWorld()

    // The pointer as a perspective ray (camera through the pixel) in the group's local space.
    const radius = size.height * REPEL_RADIUS * frame.worldPerPx
    const repelTarget = pointer.active && radius > 0 ? REPEL_STRENGTH : 0
    const repelEase = 1 - Math.exp(-dt * (repelTarget > m.repel ? REPEL_RISE : REPEL_FALL))
    m.repel += (repelTarget - m.repel) * repelEase
    if (m.repel > 1e-4) {
      const ray = pointerRay(frame, pointer.x, pointer.y)
      inverse.copy(group.matrixWorld).invert()
      pointerLocal.set(ray.origin[0], ray.origin[1], ray.origin[2]).applyMatrix4(inverse)
      viewLocal.set(ray.direction[0], ray.direction[1], ray.direction[2]).transformDirection(inverse)
      uniforms.uPointerOrigin.value.copy(pointerLocal)
      uniforms.uPointerDir.value.copy(viewLocal)
    }
    uniforms.uRepel.value = m.repel > 1e-4 ? m.repel : 0
    uniforms.uRepelRadius.value = radius

    // Per-frame scalars: the only viewport-dependent numbers the GPU sees.
    uniforms.uMix.value = mix
    uniforms.uTime.value = t
    uniforms.uBob.value = size.height * BOB * frame.worldPerPx
    uniforms.uUnitA.value = sa.unit
    uniforms.uUnitB.value = sb.unit
    uniforms.uEdgeA.value = sa.edge
    uniforms.uEdgeB.value = sb.edge
    mesh.count = Math.max(a.count, b.count)

    // The artefact: ignites 0.6 s into the assembly; belongs to the hero, so it
    // fades with the monolith's share of the morph.
    const heroWeight = from === 'cloud' || from === 'monolith' ? 1 - (to === 'monolith' ? 0 : mix) : to === 'monolith' ? mix : 0
    const heroUnit = scalars('monolith').unit
    const artefactScale = heroUnit * igniteScale(elapsed) * heroWeight
    artefact.group.position.set(ARTEFACT_CENTRE[0] * heroUnit, ARTEFACT_CENTRE[1] * heroUnit, ARTEFACT_CENTRE[2] * heroUnit)
    // Scale and light intensity, never `visible`: toggling a point light would
    // change the program's light count and force a recompile.
    artefact.group.scale.setScalar(Math.max(0, artefactScale))
    artefact.light.intensity = ARTEFACT_LIGHT_INTENSITY * igniteScale(elapsed) * heroWeight
    artefact.tick(t)

    if (!live.current) {
      live.current = true
      // The attribute flips after this frame has actually been presented.
      liveFrame.current = requestAnimationFrame(() => {
        liveFrame.current = 0
        onLive(true)
      })
    }

    state.gl.render(scene, camera)

    // Keep stepping while the assembly, the repulsion or the parallax is still settling.
    const settling =
      elapsed < ASSEMBLY_SECONDS + SETTLE_SECONDS ||
      Math.abs(repelTarget - m.repel) > 1e-3 ||
      Math.abs(ny * PARALLAX - m.parallaxX) > 1e-4 ||
      Math.abs(nx * PARALLAX - m.parallaxY) > 1e-4
    if (settling) invalidate()
  }, 1)

  return null
}

export default function AssemblyCanvas({ keep, onLive, onGiveUp }: AssemblyCanvasProps) {
  const store = useRef<AssemblyStore>({
    scroll: { from: 'monolith', to: 'monolith', mix: 0, opacity: 1 },
    pointer: { x: 0, y: 0, active: false },
  })
  const wrapper = useRef<HTMLDivElement>(null)
  const washFrom = useRef<HTMLDivElement>(null)
  const washTo = useRef<HTMLDivElement>(null)
  const washes = useRef<{ from: FormationId; to: FormationId | null }>({ from: 'monolith', to: null })
  const invalidateRef = useRef<() => void>(() => {})

  const bindInvalidate = useCallback((invalidate: () => void) => {
    invalidateRef.current = invalidate
  }, [])

  // The washes carry each formation's radial accent (the 2D wash divs fade out
  // under `data-gl="live"`), cross-faded by the same mix the cubes use.
  const apply = useCallback((state: ScrollState) => {
    store.current.scroll = state
    if (wrapper.current) wrapper.current.style.opacity = state.opacity.toFixed(3)
    if (washFrom.current && washes.current.from !== state.from) {
      washFrom.current.style.background = washCss(state.from)
      washes.current.from = state.from
    }
    if (washTo.current) {
      if (washes.current.to !== state.to) {
        washTo.current.style.background = washCss(state.to)
        washes.current.to = state.to
      }
      washTo.current.style.opacity = state.mix.toFixed(3)
    }
    invalidateRef.current()
  }, [])
  useAssemblyScroll(apply)


  return (
    <div ref={wrapper} className="absolute inset-0">
      <div ref={washFrom} className="absolute inset-0" style={{ background: washCss('monolith') }} />
      <div ref={washTo} className="absolute inset-0" style={{ opacity: 0 }} />
      <Canvas
        frameloop="demand"
        // R3F's default resize debounce is 0; a mobile URL-bar collapse mid-scroll
        // would otherwise re-run the camera effect every frame. 150 ms matches FieldCanvas.
        resize={{ debounce: { scroll: 50, resize: 150 } }}
        // 1.5 everywhere: flat-shaded cubes cannot show DPR 2, and a full-screen
        // MSAA canvas at DPR 2 on a 1440p desktop is ~15 megapixels per frame.
        dpr={[1, 1.5]}
        // A decorative layer should not pin a laptop to its discrete GPU.
        gl={{ alpha: true, antialias: true, powerPreference: 'default' }}
        camera={{ fov: FOV_LANDSCAPE, near: 0.1, far: 100, position: [0, 0, CAMERA_DISTANCE] }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping
          gl.toneMappingExposure = 1.1
          gl.setClearColor(0x000000, 0)
        }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <Scene store={store} keep={keep} onLive={onLive} onGiveUp={onGiveUp} bindInvalidate={bindInvalidate} />
      </Canvas>
    </div>
  )
}
