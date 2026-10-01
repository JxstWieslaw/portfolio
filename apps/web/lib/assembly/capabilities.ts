/**
 * The Assembly's mount decision — spec § 4.4.
 *
 * WebGL is a sixth rung *above* the 2D ladder in `lib/formations/fallback.ts`,
 * not a replacement for it: the 2D canvases always mount, and the WebGL layer
 * only cross-fades over them once it has drawn a frame. So the decision here
 * can afford to be strict — every "no" simply leaves the page exactly as M0
 * shipped it.
 *
 * `shouldMountWebGL` is pure so the truth table can be tested. Only the two
 * probes below touch the DOM.
 */

import type { FallbackRung } from '@/lib/formations/fallback'

export interface MountInputs {
  /** The 2D ladder's answer for this device. */
  readonly rung: FallbackRung
  /** `getContext('webgl2')` returned a context. */
  readonly webgl2: boolean
  /** `?nogl=1` — the manual kill switch for debugging the 2D path. */
  readonly noGl: boolean
}

/**
 * Only the two rungs that may animate at all get WebGL. `reduced-motion` never
 * does: the static 2D frame *is* the reduced-motion design, by spec, and this
 * function is where that promise is kept.
 */
export function shouldMountWebGL({ rung, webgl2, noGl }: MountInputs): boolean {
  if (noGl || !webgl2) return false
  return rung === 'live' || rung === 'reduced-instances'
}

/** `?nogl=1` anywhere in the query string. */
export function hasNoGlFlag(search: string): boolean {
  try {
    return new URLSearchParams(search).get('nogl') === '1'
  } catch {
    return false
  }
}

/**
 * Probes WebGL2 on a throwaway canvas. Locked-down browsers can throw here
 * rather than returning null; both answers mean "stay on 2D".
 */
export function probeWebGL2(canvas: HTMLCanvasElement): boolean {
  if (typeof canvas.getContext !== 'function') return false
  try {
    return Boolean(canvas.getContext('webgl2'))
  } catch {
    return false
  }
}
