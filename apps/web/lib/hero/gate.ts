/**
 * Whether the hero engine mounts — hero monolith spec § 6. Pure.
 *
 * This file is in the initial bundle (the layer that decides lives there), so
 * it stays a few lines: the real work is `shouldMountWebGL`, which already says
 * no to reduced motion, no WebGL2, `?nogl=1` and Save-Data. The hero adds one
 * thing, the flag.
 */

import { shouldMountWebGL, type MountInputs } from '@/lib/assembly/capabilities'
import { heroModeFor } from '@/lib/hero/mode'

export interface HeroGateInputs extends MountInputs {
  /** `?hero=a` or `NEXT_PUBLIC_HERO=monolith`. */
  readonly flag: boolean
}

export function shouldMountHero({ flag, ...rest }: HeroGateInputs): boolean {
  return flag && shouldMountWebGL(rest)
}

/**
 * Whether this visit is a hero-monolith visit: `?hero=a`, `NEXT_PUBLIC_HERO=monolith`, or the default
 * (`HERO_DEFAULT_ON`, off until S3). `?hero=off` and `NEXT_PUBLIC_HERO=off` win over the default.
 */
export function heroFlagOn(search: string): boolean {
  return heroModeFor(search) === 'on'
}
