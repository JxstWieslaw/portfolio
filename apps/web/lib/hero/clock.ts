/**
 * The page's assembly start, shared between the 3D cubes and the hero engine.
 *
 * The cubes begin assembling when the 3D layer's first frame runs; the hero engine may go live later. If the hero
 * counted from its own first frame it would restart the assembly at the hand-off. It seeds its clock from this
 * instead, so it joins at the progress the cubes had reached. `-1` until the cubes have started.
 */
export const assemblyClock = { t0: -1 }

/** Called when the 3D scene unmounts. */
export function resetAssemblyClock(): void {
  assemblyClock.t0 = -1
}
