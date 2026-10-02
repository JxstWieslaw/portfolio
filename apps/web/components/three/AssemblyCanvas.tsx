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
  InstancedBufferGeometry,
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
import { ATTRACT_PULL_MODEL, ATTRACT_RADIUS, ATTRACT_RISE, attractorStore, boxCentre } from '@/lib/assembly/attractors'
import { assemblyBuilder, createBundleCache } from '@/lib/assembly/bundle-cache'
import { chapterFor, lerpChapter } from '@/lib/assembly/chapters'
import { CAMERA_DAMP, cameraPosition, damp, lerpRig, rigFor, type CameraRig } from '@/lib/assembly/camera'
import { ASSEMBLY_SECONDS, SETTLE_SECONDS, resolveAssembly } from '@/lib/assembly/cloud'
import { ENVIRONMENT_INTENSITY, LIGHTFORMERS } from '@/lib/assembly/environment'
import { BREATH_FPS, NO_DROP, biasFor, calmAt, dropTrigger, lerpMotion, motionFor, settledFormation, shiverAt, type DropState } from '@/lib/assembly/motion'
import { rayAtPlane, type Ray } from '@/lib/assembly/pointer-ray'
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
import { createModelSlot, type ModelSlot } from './models/ModelSlot'
import { attachSlots, createAssemblyMaterial, createAssemblyUniforms, type AssemblySlots, type AssemblyUniforms } from './AssemblyMaterial'

/**
 * The only module that imports three (through `AssemblyMaterial` and
 * `Artefact`). Loaded through `next/dynamic` from `AssemblyLayer`; never
 * imported by a unit test.
 *
 * One instanced mesh of cubes morphs between the seven formations on the
 * GPU — journey spec § 4, § 5.1. Two attribute slots hold the formation the
 * visitor is leaving and the one they are heading to; the vertex program
 * staggers each cube by its seed, swirls it through curl noise mid-flight,
 * tumbles it half a turn and lands it exactly on its measured point. Each
 * slot also carries its formation's own motion (§ 3): the stream's flow, the
 * orbit rings' and the grid's spin, the scatter's fall. The CPU writes a
 * handful of uniforms per frame and one slot per formation change; the frame
 * loop writes no per-instance data.
 *
 * On load the monolith assembles from a seeded cloud around the hero artefact
 * (§ 3.1). The camera follows the rig table (§ 3.8), damped at 4/s, and the
 * frame scalars are recomputed from the live distance every frame so each
 * formation's anchor stays on its measured pixel through a dolly. Lighting:
 * hemisphere + sun for the flat top-face read, plus a five-plane lightformer
 * environment baked through PMREM before the programs compile (§ 5.3).
 *
 * Frame loop is `demand`: scroll, pointer, resize and the attractor
 * invalidate; a 20 fps ticker (`BREATH_FPS`) invalidates for the idle motion
 * while the tab is visible and the layer is not faded out. Nothing runs while
 * `document.hidden`.
 *
 * Models (model platform spec § 3): the rig owns a `ModelSlot` that hosts at
 * most two GLBs, driven from the same priority-1 frame as everything else. The
 * chapter ledger (`CHAPTERS`) is all `null` today, so the slot is inert.
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

/** The artefact's scale as the orbit's core (§ 3.4). */
const ORBIT_ARTEFACT_SCALE = 0.6

/** The hemisphere and sun at neutral key/fill bias (the chapter ledger multiplies these). */
const HEMISPHERE_INTENSITY = 1.1
const SUN_INTENSITY = 1.6

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

function smoothstep(edge0: number, edge1: number, x: number): number {
  const u = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return u * u * (3 - 2 * u)
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
  readonly mesh: Mesh
  readonly geometry: InstancedBufferGeometry
  readonly slots: AssemblySlots
  readonly uniforms: AssemblyUniforms
  readonly artefact: Artefact
  readonly hemisphere: HemisphereLight
  readonly sun: DirectionalLight
  readonly inverse: Matrix4
  dispose(): void
}

function createRig(capacity: number): Rig {
  // A plain Mesh over an InstancedBufferGeometry: position, scale and rotation
  // live in the vertex program, so there is no instance matrix to upload
  // (an InstancedMesh would carry 192 kB of identity matrices for nothing).
  const box = new BoxGeometry(1, 1, 1)
  const geometry = new InstancedBufferGeometry()
  geometry.index = box.index
  for (const name of ['position', 'normal', 'uv']) geometry.setAttribute(name, box.getAttribute(name))
  geometry.instanceCount = capacity
  const slots = attachSlots(geometry, capacity, seedsFor(capacity))
  const uniforms = createAssemblyUniforms()
  const material = createAssemblyMaterial(uniforms)
  const mesh = new Mesh(geometry, material)
  mesh.frustumCulled = false

  const artefact = createArtefact()
  artefact.group.scale.setScalar(0)

  const group = new Group()
  group.add(mesh, artefact.group)

  // Sky a dim violet, ground near-black; one key light from above-left so the
  // top faces read lit, like the 2D painter's highlight band.
  const hemisphere = new HemisphereLight(new Color('#6d4bd1'), new Color('#06080c'), HEMISPHERE_INTENSITY)
  const sun = new DirectionalLight(0xffffff, SUN_INTENSITY)
  sun.position.set(-4, 7, 5)

  return {
    group,
    mesh,
    geometry,
    slots,
    uniforms,
    artefact,
    hemisphere,
    sun,
    inverse: new Matrix4(),
    dispose() {
      geometry.dispose()
      material.dispose()
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

/** The camera's damped state and the per-frame motion memory. */
interface Motion {
  parallaxX: number
  parallaxY: number
  repel: number
  attract: number
  rig: CameraRig
  /** The chapter ledger's look-at offset and light biases, damped like the rig. */
  look: { x: number; y: number; z: number; key: number; fill: number }
  orbit: number
  drop: DropState
  /** `uTime` at which the ring fully landed; `-1` otherwise. */
  settledAt: number
}

function Scene({ store, keep, onLive, onGiveUp, bindInvalidate }: SceneProps) {
  const { gl, scene, camera, size, invalidate } = useThree()

  useEffect(() => {
    bindInvalidate(invalidate)
  }, [bindInvalidate, invalidate])

  const capacity = useMemo(() => instanceCount(keep), [keep])
  const frame = useMemo(() => frameFor(size.width, size.height), [size.width, size.height])
  const portrait = size.height > size.width
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

  const rung = keep < 1 ? 'reduced-instances' : 'live'
  const rig = useMemo(() => createRig(capacity), [capacity])
  // Created and disposed with the scene (not with the memoised rig) so StrictMode's mount, cleanup, mount
  // leaves a live slot and its markers. `null` once a throw has killed it: the procedural artefact carries on.
  const models = useRef<ModelSlot | null>(null)
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
    models.current = createModelSlot({ gl, scene, camera, parent: rig.group, rung, invalidate })
    // Fresh buffers on the GPU: the slots hold nothing until written.
    slotState.current = EMPTY_SLOTS
    const cancel = prepare(invalidate)
    return () => {
      cancel()
      scene.remove(rig.group, rig.hemisphere, rig.sun)
      scene.environment = null
      environment.current?.dispose()
      environment.current = null
      // The cube rig is released first, so a throw from the model slot cannot skip it.
      try {
        rig.dispose()
      } finally {
        try {
          models.current?.dispose()
        } catch (error) {
          console.warn('[assembly] disposing the model slot threw', error)
        }
        models.current = null
      }
    }
  }, [gl, scene, camera, rung, rig, prepare, invalidate])

  // The camera and the framing maths share `frame`'s FOV; its distance and
  // pitch follow the rig table per frame (§ 3.8).
  useEffect(() => {
    const perspective = camera as PerspectiveCamera
    perspective.fov = frame.fov
    perspective.updateProjectionMatrix()
    invalidate()
  }, [camera, frame, invalidate])

  // Idle ticker: breathing, flow, spins, calm — only while visible and not faded out.
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

  // The hovered (or centred) project card: a change wakes the loop; the frame reads its box.
  useEffect(() => attractorStore.subscribe(() => invalidate()), [invalidate])

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
  const motion = useRef<Motion>({
    parallaxX: 0,
    parallaxY: 0,
    repel: 0,
    attract: 0,
    rig: rigFor('monolith', portrait),
    look: { x: 0, y: 0, z: 0, key: 1, fill: 1 },
    orbit: 0,
    drop: NO_DROP,
    settledAt: -1,
  })
  /** The on-load assembly clock; `-1` until the first drawn frame. */
  const assemblyStart = useRef(-1)
  const scratch = useMemo(() => ({ origin: new Vector3(), dir: new Vector3(), point: new Vector3(), ndc: new Vector3() }), [])

  /** The line from the camera through a CSS pixel, world space — correct under any tilt or orbit. */
  const rayThrough = useCallback(
    (px: number, py: number): Ray => {
      const { origin, dir, ndc } = scratch
      ndc.set((px / size.width) * 2 - 1, 1 - (py / size.height) * 2, 0.5).unproject(camera)
      origin.copy(camera.position)
      dir.copy(ndc).sub(origin).normalize()
      return { origin: [origin.x, origin.y, origin.z], direction: [dir.x, dir.y, dir.z] }
    },
    [camera, scratch, size.width, size.height],
  )

  // Priority 1: R3F skips its own render when a subscriber has priority > 0,
  // so nothing is drawn (and nothing links synchronously) until `compileAsync`
  // has resolved. Every frame that gets past the gates ends in `gl.render`.
  useFrame((state, delta) => {
    const scroll = store.current.scroll
    if (!compiled.current) return
    if (scroll.opacity <= 0 && live.current) return

    const t = state.clock.elapsedTime
    const dt = Math.min(delta, 0.1)
    const { group, geometry, uniforms, slots, artefact, inverse } = rig
    const pointer = store.current.pointer
    const m = motion.current

    // The on-load assembly: cloud -> monolith on a clock from the first drawn
    // frame, then the scroll state settles in without a step (`resolveAssembly`).
    if (assemblyStart.current < 0) assemblyStart.current = t
    const elapsed = t - assemblyStart.current
    const { from, to, mix } = resolveAssembly(scroll, elapsed)

    // Camera: the rig table lerped by the mix, damped at 4/s; the orbit angle accumulates.
    const target = lerpRig(rigFor(from, portrait), rigFor(to, portrait), mix)
    m.rig = {
      distance: damp(m.rig.distance, target.distance, CAMERA_DAMP, dt),
      tiltDeg: damp(m.rig.tiltDeg, target.tiltDeg, CAMERA_DAMP, dt),
      parallaxDeg: damp(m.rig.parallaxDeg, target.parallaxDeg, CAMERA_DAMP, dt),
      orbitRate: target.orbitRate,
    }
    m.orbit += target.orbitRate * dt
    const [cx, cy, cz] = cameraPosition(m.rig.distance, m.rig.tiltDeg, m.orbit)
    // The chapter ledger's look-at offset and key/fill bias, damped at the same rate.
    // Neutral rows ([0,0,0], 1, 1) leave the camera and the lights exactly as they were.
    const chapter = lerpChapter(chapterFor(from), chapterFor(to), mix)
    const look = m.look
    look.x = damp(look.x, chapter.target[0], CAMERA_DAMP, dt)
    look.y = damp(look.y, chapter.target[1], CAMERA_DAMP, dt)
    look.z = damp(look.z, chapter.target[2], CAMERA_DAMP, dt)
    look.key = damp(look.key, chapter.keyBias, CAMERA_DAMP, dt)
    look.fill = damp(look.fill, chapter.fillBias, CAMERA_DAMP, dt)
    rig.sun.intensity = SUN_INTENSITY * look.key
    rig.hemisphere.intensity = HEMISPHERE_INTENSITY * look.fill
    camera.position.set(cx, cy, cz)

    // Per-frame scalars from the live distance: one tan, so the anchor stays
    // on its measured pixel at any dolly (§ 3.8).
    const view = frameFor(size.width, size.height, m.rig.distance)
    const scalars = (kind: BundleKind): FrameScalars => frameScalars(FORMATIONS[kind === 'cloud' ? 'monolith' : kind], view)
    const sFrom = scalars(from)
    const sTo = scalars(to)
    // The look-at offset is in model units; the live unit turns it into world units.
    const lookUnit = lerp(sFrom.unit, sTo.unit, mix)
    camera.lookAt(look.x * lookUnit, look.y * lookUnit, look.z * lookUnit)
    camera.updateMatrixWorld()

    // Formation change: write the slot that is not holding `from`, flip uSwap.
    const plan = planSlots(slotState.current, from, to)
    for (const write of plan.writes) slots.write(write.slot, bundles.get(write.kind))
    slotState.current = plan.state
    uniforms.uSwap.value = plan.swap
    const a = bundles.get(plan.state.a ?? from)
    const b = bundles.get(plan.state.b ?? to)
    const sa = plan.state.a === to ? sTo : sFrom
    const sb = plan.state.b === from ? sFrom : sTo
    const bFrom = bundles.get(from)
    const bTo = bundles.get(to)

    // The section's own motion rule (§ 3 table), lerped across the band.
    const rule = lerpMotion(motionFor(from), motionFor(to), mix)
    // The contact ring's calm (§ 3.7): starts once the visitor is at rest on the ring.
    const settled = settledFormation(from, to, mix)
    if (settled === 'ring') {
      if (m.settledAt < 0) m.settledAt = t
    } else m.settledAt = -1
    const calm = calmAt(settled, m.settledAt < 0 ? 0 : t - m.settledAt)

    // Group: anchor, formation rotation, idle wobble, pointer parallax, breath, ultrawide spread.
    const wobble = Math.sin(t * WOBBLE_RATE) * WOBBLE_AMPLITUDE * rule.wobble
    const breath = 1 + BREATH_AMPLITUDE * Math.sin(t * BREATH_RATE) * rule.breath * (1 - 0.7 * calm)
    const nx = pointer.active ? (pointer.x / size.width) * 2 - 1 : 0
    const ny = pointer.active ? (pointer.y / size.height) * 2 - 1 : 0
    const parallax = (m.rig.parallaxDeg * Math.PI) / 180
    const ease = 1 - Math.exp(-dt * 6)
    m.parallaxX += (ny * parallax - m.parallaxX) * ease
    m.parallaxY += (nx * parallax - m.parallaxY) * ease
    group.position.set(lerp(sFrom.anchor[0], sTo.anchor[0], mix), lerp(sFrom.anchor[1], sTo.anchor[1], mix), 0)
    group.rotation.set(lerp(bFrom.tilt, bTo.tilt, mix) + m.parallaxX, lerp(bFrom.rot, bTo.rot, mix) + wobble + m.parallaxY, 0)
    group.scale.set(breath * lerp(sFrom.spreadX, sTo.spreadX, mix), breath, breath)
    group.updateMatrixWorld()
    inverse.copy(group.matrixWorld).invert()

    // The pointer as a perspective ray (camera through the pixel) in the group's local space.
    const radius = size.height * REPEL_RADIUS * view.worldPerPx * rule.repelRadius
    const repelTarget = pointer.active && radius > 0 ? REPEL_STRENGTH * rule.repel * (1 - 0.5 * calm) : 0
    const repelEase = 1 - Math.exp(-dt * (repelTarget > m.repel ? REPEL_RISE : REPEL_FALL))
    m.repel += (repelTarget - m.repel) * repelEase
    if (m.repel > 1e-4) {
      const ray = rayThrough(pointer.x, pointer.y)
      scratch.origin.set(ray.origin[0], ray.origin[1], ray.origin[2]).applyMatrix4(inverse)
      scratch.dir.set(ray.direction[0], ray.direction[1], ray.direction[2]).transformDirection(inverse)
      uniforms.uPointerOrigin.value.copy(scratch.origin)
      uniforms.uPointerDir.value.copy(scratch.dir)
    }
    uniforms.uRepel.value = m.repel > 1e-4 ? m.repel : 0
    uniforms.uRepelRadius.value = radius

    // Attractors (§ 3.3): the card's box (measured by the DOM hook, never
    // here) through the same ray maths onto z = 0, into group space; strength
    // eases 0 -> 1 at 6/s. One attractor: uAttractCount bounds the loop.
    const card = attractorStore.get()
    const attractTarget = card && rule.attract > 0 ? rule.attract : 0
    m.attract += (attractTarget - m.attract) * (1 - Math.exp(-dt * ATTRACT_RISE))
    const slot0 = uniforms.uAttractors.value[0]
    if (card && m.attract > 1e-3 && slot0) {
      const [px, py] = boxCentre(card)
      const [wx, wy, wz] = rayAtPlane(rayThrough(px, py))
      scratch.point.set(wx, wy, wz).applyMatrix4(inverse)
      slot0.set(scratch.point.x, scratch.point.y, scratch.point.z, m.attract)
    } else if (slot0) slot0.w = 0
    uniforms.uAttractCount.value = slot0 && slot0.w > 0 ? 1 : 0
    uniforms.uAttractRadius.value = ATTRACT_RADIUS * sTo.unit
    uniforms.uAttractPull.value = m.attract > 1e-3 ? ATTRACT_PULL_MODEL * sTo.unit : 0

    // The craft drop (§ 3.5): once per visit, when half the scatter is on screen from either side.
    m.drop = dropTrigger(m.drop, from, to, mix, t)
    const shiver = m.drop.dropAt >= 0 ? shiverAt(t - m.drop.dropAt) : 0
    uniforms.uDropAt.value = m.drop.dropAt
    uniforms.uShiver.value.set(from === 'scatter' ? shiver : 0, to === 'scatter' ? shiver : 0)

    // Per-frame scalars: the only viewport-dependent numbers the GPU sees.
    uniforms.uMix.value = mix
    uniforms.uTime.value = t
    uniforms.uBob.value = size.height * BOB * view.worldPerPx * rule.bob
    uniforms.uUnitA.value = sa.unit
    uniforms.uUnitB.value = sb.unit
    uniforms.uEdgeA.value = sa.edge
    uniforms.uEdgeB.value = sb.edge
    uniforms.uBias.value = lerp(biasFor(from), biasFor(to), mix)
    uniforms.uCalm.value = calm
    uniforms.uStaggerByT.value = to === 'ring' ? 1 : 0
    geometry.instanceCount = Math.max(a.count, b.count)

    // The artefact: ignites 0.6 s into the assembly and belongs to the hero,
    // so it fades with the monolith's share of the morph; it returns as the
    // orbit's core at 0.6 scale, rings off, over the second half of the band.
    const heroWeight = from === 'cloud' || from === 'monolith' ? 1 - (to === 'monolith' ? 0 : mix) : to === 'monolith' ? mix : 0
    const orbitWeight = to === 'orbit' ? smoothstep(0.5, 1, mix) : from === 'orbit' ? 1 - smoothstep(0, 0.5, mix) : 0
    const heroUnit = scalars('monolith').unit
    const ignite = igniteScale(elapsed)
    const hero = heroUnit * ignite * heroWeight
    const asCore = sTo.unit * ORBIT_ARTEFACT_SCALE * orbitWeight
    if (hero >= asCore) {
      artefact.group.position.set(ARTEFACT_CENTRE[0] * heroUnit, ARTEFACT_CENTRE[1] * heroUnit, ARTEFACT_CENTRE[2] * heroUnit)
      artefact.group.scale.setScalar(Math.max(0, hero))
      artefact.setRings(1)
    } else {
      artefact.group.position.set(0, 0, 0)
      artefact.group.scale.setScalar(asCore)
      artefact.setRings(0)
    }
    // Scale and light intensity, never `visible`: toggling a point light would
    // change the program's light count and force a recompile.
    // TODO(slice 3): drive the light by tier as well — off at tier 1, where
    // the environment is skipped too (§ 5.6); it stays on for every tier now.
    artefact.light.intensity = ARTEFACT_LIGHT_INTENSITY * Math.max(ignite * heroWeight, orbitWeight)

    // Models (platform spec § 3): placed, scaled in and animated here, never on a loop of their own.
    // A loaded `artefact`-role model takes the artefact's place; scale 0, never `visible` (it holds a light).
    // A throw here must never break the page: the slot is killed and the procedural artefact carries on.
    try {
      const modelFrame = models.current?.update({ from, to, mix, settled, dt, time: t, unitOf: (formation) => scalars(formation).unit })
      if (modelFrame?.suppressArtefact) artefact.group.scale.setScalar(0)
    } catch (error) {
      console.warn('[assembly] the model slot failed and was turned off', error)
      const dead = models.current
      models.current = null
      try {
        dead?.dispose()
      } catch {
        // Already logged above; the cube rig does not depend on it.
      }
    }
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

    // Keep stepping while the assembly, the camera, the repulsion, the
    // attractor, the drop or the parallax is still settling.
    const settling =
      elapsed < ASSEMBLY_SECONDS + SETTLE_SECONDS ||
      Math.abs(target.distance - m.rig.distance) > 1e-3 ||
      Math.abs(target.tiltDeg - m.rig.tiltDeg) > 1e-3 ||
      Math.abs(repelTarget - m.repel) > 1e-3 ||
      Math.abs(attractTarget - m.attract) > 1e-3 ||
      Math.abs(chapter.target[0] - look.x) + Math.abs(chapter.target[1] - look.y) + Math.abs(chapter.target[2] - look.z) > 1e-4 ||
      Math.abs(chapter.keyBias - look.key) + Math.abs(chapter.fillBias - look.fill) > 1e-4 ||
      shiver > 0 ||
      (calm > 0 && calm < 1) ||
      Math.abs(ny * parallax - m.parallaxX) > 1e-4 ||
      Math.abs(nx * parallax - m.parallaxY) > 1e-4
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
