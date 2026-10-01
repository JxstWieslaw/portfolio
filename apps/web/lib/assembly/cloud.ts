/**
 * The `cloud` pseudo-formation — journey spec § 3.1.
 *
 * PURE. The hero assembles on load from a cloud to the monolith: the same
 * points as the monolith bundle, each pushed to a seeded random point on a
 * sphere of radius 3.0 model units. It exists only as a bundle in the cache;
 * the generators and the 2D painter never see it.
 */

import type { ScrollState } from '@/lib/assembly/scroll'
import type { BundleKind, ModelBundle } from '@/lib/assembly/targets'
import { createRng, seedFor } from '@/lib/formations/generators'

export const CLOUD_RADIUS = 3

/** How long the on-load assembly takes, seconds (open question § 11.2; 1.8 reads as deliberate). */
export const ASSEMBLY_SECONDS = 1.8

/** Ease-out quintic: the assembly arrives fast and settles. */
export function easeOutQuint(t: number): number {
  const u = t < 0 ? 0 : t > 1 ? 1 : t
  const v = 1 - u
  return 1 - v * v * v * v * v
}

export function buildCloudBundle(monolith: ModelBundle): ModelBundle {
  const r = createRng(seedFor('cloud'))
  const position = new Float32Array(monolith.capacity * 3)
  for (let i = 0; i < monolith.capacity; i += 1) {
    // Uniform on the sphere: z uniform in [-1, 1], azimuth uniform.
    const z = r() * 2 - 1
    const azimuth = r() * Math.PI * 2
    const ring = Math.sqrt(Math.max(0, 1 - z * z))
    position[i * 3] = Math.cos(azimuth) * ring * CLOUD_RADIUS
    position[i * 3 + 1] = z * CLOUD_RADIUS
    position[i * 3 + 2] = Math.sin(azimuth) * ring * CLOUD_RADIUS
  }
  return { ...monolith, kind: 'cloud', position }
}

/** After the assembly, the scroll's own mix is blended in over this long so the handoff has no step. */
export const SETTLE_SECONDS = 0.6

export interface AssemblyState {
  readonly from: BundleKind
  readonly to: BundleKind
  readonly mix: number
}

/**
 * What the cubes morph between at `elapsed` seconds since the first drawn
 * frame. While assembling: cloud -> monolith on the clock, whatever the scroll
 * store says (at scrollY 0 its `to` is already the next section). Afterwards
 * the scroll state takes over, with its mix ramped in over `SETTLE_SECONDS`
 * from the monolith the assembly landed on, so a visitor who scrolled during
 * the assembly sees one continuous motion and never a one-frame jump.
 */
export function resolveAssembly(scroll: ScrollState, elapsed: number): AssemblyState {
  if (elapsed < ASSEMBLY_SECONDS) {
    return { from: 'cloud', to: 'monolith', mix: easeOutQuint(elapsed / ASSEMBLY_SECONDS) }
  }
  const settle = easeOutQuint((elapsed - ASSEMBLY_SECONDS) / SETTLE_SECONDS)
  if (settle >= 1) return scroll
  if (scroll.from === 'monolith') return { from: 'monolith', to: scroll.to, mix: scroll.mix * settle }
  // Scrolled past the hero inside two seconds: ramp from the monolith to where the visitor is.
  return { from: 'monolith', to: scroll.from, mix: settle }
}
