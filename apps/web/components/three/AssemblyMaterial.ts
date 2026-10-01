import { Color, InstancedBufferAttribute, MeshStandardMaterial, Vector2, Vector3, Vector4, type BufferGeometry, type InstancedBufferGeometry } from 'three'
import { MAX_ATTRACTORS } from '@/lib/assembly/attractors'
import CustomShaderMaterial from 'three-custom-shader-material/vanilla'
import type { Slot } from '@/lib/assembly/slots'
import type { ModelBundle } from '@/lib/assembly/targets'
import { FRAGMENT, VERTEX } from './assembly.glsl'

/**
 * The cubes' material and attribute slots — journey spec § 5.1.
 *
 * `MeshStandardMaterial` extended through three-custom-shader-material: the
 * base keeps its lighting, our vertex program owns position (morph, stagger,
 * curl, spin, pointer) and colour. The CPU writes uniforms per frame and one
 * attribute slot per formation change; the frame loop writes no per-instance
 * data.
 */

export interface AssemblyUniforms {
  readonly uMix: { value: number }
  readonly uSwap: { value: number }
  readonly uTime: { value: number }
  readonly uNoiseAmp: { value: number }
  readonly uUnitA: { value: number }
  readonly uUnitB: { value: number }
  readonly uEdgeA: { value: number }
  readonly uEdgeB: { value: number }
  readonly uBob: { value: number }
  readonly uPointerOrigin: { value: Vector3 }
  readonly uPointerDir: { value: Vector3 }
  readonly uRepel: { value: number }
  readonly uRepelRadius: { value: number }
  readonly uPalette: { value: Color[] }
  readonly uBias: { value: number }
  /** `uTime` of the craft drop; `-1` until it has triggered (§ 3.5). */
  readonly uDropAt: { value: number }
  /** The contact ring's calm, 0..1 (§ 3.7). */
  readonly uCalm: { value: number }
  /** Pile shiver amplitude, model units, for the from and to slots. */
  readonly uShiver: { value: Vector2 }
  /** `1` staggers the morph by the target's colour `t` instead of the seed (the ring). */
  readonly uStaggerByT: { value: number }
  /** Group-space attractor points, `w` = strength 0..1; `w <= 0` is inactive (§ 3.3). */
  readonly uAttractors: { value: Vector4[] }
  /** World-unit radius and pull of the attractors. */
  readonly uAttractRadius: { value: number }
  readonly uAttractPull: { value: number }
  /** How many leading entries of `uAttractors` are live; bounds the shader loop. */
  readonly uAttractCount: { value: number }
}

/** The 2D painter's ramp, sRGB; the shader converts to linear. */
const PALETTE = ['#7C3AED', '#E879F9', '#22D3EE'].map((hex) => new Color().setHex(Number.parseInt(hex.slice(1), 16), 'srgb-linear'))

/** Noise amplitude in model units; tier 2–3 value (tier 1 gets 0.2 in slice 3). */
export const NOISE_AMPLITUDE = 0.35

export function createAssemblyUniforms(): AssemblyUniforms {
  return {
    uMix: { value: 0 },
    uSwap: { value: 0 },
    uTime: { value: 0 },
    uNoiseAmp: { value: NOISE_AMPLITUDE },
    uUnitA: { value: 1 },
    uUnitB: { value: 1 },
    uEdgeA: { value: 0 },
    uEdgeB: { value: 0 },
    uBob: { value: 0 },
    uPointerOrigin: { value: new Vector3(0, 0, 10) },
    uPointerDir: { value: new Vector3(0, 0, -1) },
    uRepel: { value: 0 },
    uRepelRadius: { value: 1 },
    uPalette: { value: PALETTE },
    uBias: { value: 0 },
    uDropAt: { value: -1 },
    uCalm: { value: 0 },
    uShiver: { value: new Vector2(0, 0) },
    uStaggerByT: { value: 0 },
    uAttractors: { value: Array.from({ length: MAX_ATTRACTORS }, () => new Vector4(0, 0, 0, 0)) },
    uAttractRadius: { value: 1 },
    uAttractPull: { value: 0 },
    uAttractCount: { value: 0 },
  }
}

export function createAssemblyMaterial(uniforms: AssemblyUniforms): MeshStandardMaterial {
  const material = new CustomShaderMaterial({
    baseMaterial: MeshStandardMaterial,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: uniforms as unknown as Record<string, { value: unknown }>,
    flatShading: true,
    roughness: 0.45,
    metalness: 0.25,
    envMapIntensity: 0.8,
  })
  return material as unknown as MeshStandardMaterial
}

export interface SlotAttributes {
  readonly pos: InstancedBufferAttribute
  readonly live: InstancedBufferAttribute
  readonly colT: InstancedBufferAttribute
  readonly spin: InstancedBufferAttribute
  readonly flow: InstancedBufferAttribute
  readonly fall: InstancedBufferAttribute
}

export interface AssemblySlots {
  readonly a: SlotAttributes
  readonly b: SlotAttributes
  readonly seed: InstancedBufferAttribute
  /** Dev-only counter: how many slot writes have happened. */
  writes: number
  write(slot: Slot, bundle: ModelBundle): void
}

/**
 * Adds the A/B slots and the shared seed to an instanced geometry. The buffers
 * are allocated once at capacity; `write` copies a bundle into one slot and
 * flags it — three re-uploads just that attribute.
 */
export function attachSlots(geometry: BufferGeometry | InstancedBufferGeometry, capacity: number, seed: Float32Array): AssemblySlots {
  const make = (suffix: 'A' | 'B'): SlotAttributes => {
    const pos = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3)
    const live = new InstancedBufferAttribute(new Float32Array(capacity), 1)
    const colT = new InstancedBufferAttribute(new Float32Array(capacity), 1)
    const spin = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4)
    const flow = new InstancedBufferAttribute(new Float32Array(capacity), 1)
    const fall = new InstancedBufferAttribute(new Float32Array(capacity), 1)
    geometry.setAttribute(`aPos${suffix}`, pos)
    geometry.setAttribute(`aLive${suffix}`, live)
    geometry.setAttribute(`aColT${suffix}`, colT)
    geometry.setAttribute(`aSpin${suffix}`, spin)
    geometry.setAttribute(`aFlow${suffix}`, flow)
    geometry.setAttribute(`aFall${suffix}`, fall)
    return { pos, live, colT, spin, flow, fall }
  }
  const a = make('A')
  const b = make('B')
  const seedAttribute = new InstancedBufferAttribute(seed, 1)
  geometry.setAttribute('aSeed', seedAttribute)

  const slots: AssemblySlots = {
    a,
    b,
    seed: seedAttribute,
    writes: 0,
    write(slot, bundle) {
      const target = slot === 'a' ? a : b
      ;(target.pos.array as Float32Array).set(bundle.position)
      ;(target.live.array as Float32Array).set(bundle.live)
      ;(target.colT.array as Float32Array).set(bundle.colT)
      ;(target.spin.array as Float32Array).set(bundle.spin)
      ;(target.flow.array as Float32Array).set(bundle.flow)
      ;(target.fall.array as Float32Array).set(bundle.fall)
      target.pos.needsUpdate = true
      target.live.needsUpdate = true
      target.colT.needsUpdate = true
      target.spin.needsUpdate = true
      target.flow.needsUpdate = true
      target.fall.needsUpdate = true
      slots.writes += 1
    },
  }
  return slots
}
