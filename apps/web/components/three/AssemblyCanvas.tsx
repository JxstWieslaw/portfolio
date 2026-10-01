'use client'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react'
import {
  ACESFilmicToneMapping,
  BoxGeometry,
  Color,
  DirectionalLight,
  DynamicDrawUsage,
  Group,
  HemisphereLight,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Vector3,
  type PerspectiveCamera,
} from 'three'
import { isFormationId, resolveScroll, type ScrollState, type SectionBox } from '@/lib/assembly/scroll'
import {
  CAMERA_DISTANCE,
  FOV_LANDSCAPE,
  buildTargets,
  frameFor,
  instanceCount,
  pixelToWorld,
  type TargetBundle,
} from '@/lib/assembly/targets'
import { FORMATION_IDS, washCss, type FormationId } from '@/lib/formations/config'

/**
 * The only module that imports three. Loaded through `next/dynamic` from
 * `AssemblyLayer`; never imported by a unit test.
 *
 * One `InstancedMesh` of cubes morphs between the seven formations on the CPU
 * — each frame lerps position, scale and colour between the bundle the
 * visitor is leaving and the one they are heading to, writes `instanceMatrix`
 * once and flags it. 3000 instances at ~60 flops each is well under a
 * millisecond; a GPU morph would buy nothing here but a shader to maintain.
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
const BOB_RATE = 1.1

/** Pointer repulsion radius as a fraction of viewport height, and its push. */
const REPEL_RADIUS = 0.12
const REPEL_STRENGTH = 0.6

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
  readonly colour: InstancedBufferAttribute
  readonly hemisphere: HemisphereLight
  readonly sun: DirectionalLight
  /** Per-instance pointer displacement, springing back to zero. */
  readonly offsets: Float32Array
  readonly inverse: Matrix4
  dispose(): void
}

function createRig(capacity: number): Rig {
  const geometry = new BoxGeometry(1, 1, 1)
  const material = new MeshStandardMaterial({ flatShading: true, roughness: 0.45, metalness: 0.25 })
  const mesh = new InstancedMesh(geometry, material, capacity)
  mesh.frustumCulled = false
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  const matrices = mesh.instanceMatrix.array as Float32Array
  for (let i = 0; i < capacity; i += 1) {
    matrices.fill(0, i * 16, i * 16 + 16)
    matrices[i * 16 + 15] = 1
  }
  const colour = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3)
  colour.setUsage(DynamicDrawUsage)
  mesh.instanceColor = colour

  const group = new Group()
  group.add(mesh)

  // Sky a dim violet, ground near-black; one key light from above-left so the
  // top faces read lit, like the 2D painter's highlight band.
  const hemisphere = new HemisphereLight(new Color('#6d4bd1'), new Color('#06080c'), 1.1)
  const sun = new DirectionalLight(0xffffff, 1.6)
  sun.position.set(-4, 7, 5)

  return {
    group,
    mesh,
    colour,
    hemisphere,
    sun,
    offsets: new Float32Array(capacity * 3),
    inverse: new Matrix4(),
    dispose() {
      geometry.dispose()
      material.dispose()
      mesh.dispose()
    },
  }
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
  const targets = useMemo(() => {
    const bundles = {} as Record<FormationId, TargetBundle>
    for (const kind of FORMATION_IDS) bundles[kind] = buildTargets(kind, frame, capacity, keep)
    return bundles
  }, [frame, capacity, keep])

  const rig = useMemo(() => createRig(capacity), [capacity])
  useEffect(() => {
    scene.add(rig.group, rig.hemisphere, rig.sun)
    invalidate()
    return () => {
      scene.remove(rig.group, rig.hemisphere, rig.sun)
      rig.dispose()
    }
  }, [scene, rig, invalidate])

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
  useEffect(() => {
    const element = gl.domElement
    let losses = 0
    const lost = (event: Event): void => {
      event.preventDefault()
      losses += 1
      onLive(false)
      if (losses >= 2) onGiveUp()
    }
    const restored = (): void => {
      if (losses >= 2) return
      onLive(true)
      invalidate()
    }
    element.addEventListener('webglcontextlost', lost)
    element.addEventListener('webglcontextrestored', restored)
    return () => {
      element.removeEventListener('webglcontextlost', lost)
      element.removeEventListener('webglcontextrestored', restored)
    }
  }, [gl, onLive, onGiveUp, invalidate])

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
  const motion = useRef({ parallaxX: 0, parallaxY: 0 })
  const pointerLocal = useMemo(() => new Vector3(), [])
  const viewLocal = useMemo(() => new Vector3(), [])

  useFrame((state, delta) => {
    const { from, to, mix, opacity } = store.current.scroll
    if (opacity <= 0 && live.current) return

    const a = targets[from]
    const b = targets[to]
    const t = state.clock.elapsedTime
    const dt = Math.min(delta, 0.1)
    const { group, mesh, colour, offsets, inverse } = rig
    const pointer = store.current.pointer

    // Group: anchor, formation rotation, idle wobble, pointer parallax, breath, ultrawide spread.
    const wobble = Math.sin(t * WOBBLE_RATE) * WOBBLE_AMPLITUDE
    const breath = 1 + BREATH_AMPLITUDE * Math.sin(t * BREATH_RATE)
    const nx = pointer.active ? (pointer.x / size.width) * 2 - 1 : 0
    const ny = pointer.active ? (pointer.y / size.height) * 2 - 1 : 0
    const m = motion.current
    const ease = 1 - Math.exp(-dt * 6)
    m.parallaxX += (ny * PARALLAX - m.parallaxX) * ease
    m.parallaxY += (nx * PARALLAX - m.parallaxY) * ease
    group.position.set(lerp(a.anchor[0], b.anchor[0], mix), lerp(a.anchor[1], b.anchor[1], mix), 0)
    group.rotation.set(lerp(a.tilt, b.tilt, mix) + m.parallaxX, lerp(a.rot, b.rot, mix) + wobble + m.parallaxY, 0)
    group.scale.set(breath * lerp(a.spreadX, b.spreadX, mix), breath, breath)
    group.updateMatrixWorld()

    // The pointer as a ray through the group's local space.
    const radius = size.height * REPEL_RADIUS * frame.worldPerPx
    const repel = pointer.active && radius > 0
    if (repel) {
      const [wx, wy] = pixelToWorld(frame, pointer.x, pointer.y)
      inverse.copy(group.matrixWorld).invert()
      pointerLocal.set(wx, wy, 0).applyMatrix4(inverse)
      viewLocal.set(0, 0, 1).transformDirection(inverse)
    }

    const bob = size.height * BOB * frame.worldPerPx
    const spring = 1 - Math.exp(-dt * 8)
    const matrices = mesh.instanceMatrix.array as Float32Array
    const colours = colour.array as Float32Array
    let energy = 0

    for (let i = 0; i < capacity; i += 1) {
      const i3 = i * 3
      const i16 = i * 16

      let x = lerp(a.position[i3] ?? 0, b.position[i3] ?? 0, mix)
      let y = lerp(a.position[i3 + 1] ?? 0, b.position[i3 + 1] ?? 0, mix) + bob * Math.sin(t * BOB_RATE + i * 0.37)
      let z = lerp(a.position[i3 + 2] ?? 0, b.position[i3 + 2] ?? 0, mix)

      let tx = 0
      let ty = 0
      let tz = 0
      if (repel) {
        const wx = x - pointerLocal.x
        const wy = y - pointerLocal.y
        const wz = z - pointerLocal.z
        const along = wx * viewLocal.x + wy * viewLocal.y + wz * viewLocal.z
        const qx = wx - along * viewLocal.x
        const qy = wy - along * viewLocal.y
        const qz = wz - along * viewLocal.z
        const dist = Math.sqrt(qx * qx + qy * qy + qz * qz)
        if (dist < radius && dist > 1e-6) {
          const falloff = 1 - dist / radius
          const push = (falloff * falloff * radius * REPEL_STRENGTH) / dist
          tx = qx * push
          ty = qy * push
          tz = qz * push
        }
      }
      const ox = offsets[i3] ?? 0
      const oy = offsets[i3 + 1] ?? 0
      const oz = offsets[i3 + 2] ?? 0
      const dx = tx - ox
      const dy = ty - oy
      const dz = tz - oz
      energy = Math.max(energy, Math.abs(dx), Math.abs(dy), Math.abs(dz))
      offsets[i3] = ox + dx * spring
      offsets[i3 + 1] = oy + dy * spring
      offsets[i3 + 2] = oz + dz * spring
      x += offsets[i3] ?? 0
      y += offsets[i3 + 1] ?? 0
      z += offsets[i3 + 2] ?? 0

      const s = lerp(a.scale[i] ?? 0, b.scale[i] ?? 0, mix)
      matrices[i16] = s
      matrices[i16 + 5] = s
      matrices[i16 + 10] = s
      matrices[i16 + 12] = x
      matrices[i16 + 13] = y
      matrices[i16 + 14] = z

      colours[i3] = lerp(a.colour[i3] ?? 0, b.colour[i3] ?? 0, mix)
      colours[i3 + 1] = lerp(a.colour[i3 + 1] ?? 0, b.colour[i3 + 1] ?? 0, mix)
      colours[i3 + 2] = lerp(a.colour[i3 + 2] ?? 0, b.colour[i3 + 2] ?? 0, mix)
    }

    mesh.count = Math.max(a.count, b.count)
    mesh.instanceMatrix.needsUpdate = true
    colour.needsUpdate = true

    if (!live.current) {
      live.current = true
      // The attribute flips after this frame has actually been presented.
      liveFrame.current = requestAnimationFrame(() => {
        liveFrame.current = 0
        onLive(true)
      })
    }

    // Keep stepping while a spring or the parallax is still settling.
    const settling = energy > radius * 1e-3 || Math.abs(ny * PARALLAX - m.parallaxX) > 1e-4 || Math.abs(nx * PARALLAX - m.parallaxY) > 1e-4
    if (settling) invalidate()
  })

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

  const touch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0

  return (
    <div ref={wrapper} className="absolute inset-0">
      <div ref={washFrom} className="absolute inset-0" style={{ background: washCss('monolith') }} />
      <div ref={washTo} className="absolute inset-0" style={{ opacity: 0 }} />
      <Canvas
        frameloop="demand"
        // R3F's default resize debounce is 0, so a mobile URL-bar collapse mid-scroll
        // would rebuild every target bundle. 150 ms matches FieldCanvas.
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
