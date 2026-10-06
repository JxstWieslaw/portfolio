/**
 * Whether the hero engine mounts — hero monolith spec § 6. Pure.
 *
 * This file is in the initial bundle (the layer that decides lives there), so
 * it stays a few lines: the real work is `shouldMountWebGL`, which already says
 * no to reduced motion, no WebGL2, `?nogl=1` and Save-Data. The hero adds one
 * thing, the flag.
 */

import { shouldMountWebGL, type MountInputs } from '@/lib/assembly/capabilities'

export interface HeroGateInputs extends MountInputs {
  /** `?hero=a` or `NEXT_PUBLIC_HERO=monolith`. */
  readonly flag: boolean
}

export function shouldMountHero({ flag, ...rest }: HeroGateInputs): boolean {
  return flag && shouldMountWebGL(rest)
}

/** The S1 flag. Off by default: nothing changes unless a preview opts in. */
export function heroFlagOn(search: string): boolean {
  return process.env.NEXT_PUBLIC_HERO === 'monolith' || new URLSearchParams(search).get('hero') === 'a'
}
