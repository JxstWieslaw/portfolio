/**
 * Which models are resident — model platform spec § 3.2.
 *
 * PURE. At most two assets are held (resident or loading) at once. An asset
 * that leaves the wanted set waits `GRACE_MS` before it is evicted, so scroll
 * jitter at a section boundary does not thrash the GPU; when a new asset needs
 * the room it takes it from the one that has waited longest. An asset that
 * failed is never asked for again in the session.
 */

export const MAX_RESIDENT = 2
export const GRACE_MS = 2000

export interface ResidencyState {
  /** Resident or loading, in the order they were asked for. */
  readonly held: readonly string[]
  /** Asset id to the time it left the wanted set. */
  readonly leaving: Readonly<Record<string, number>>
  readonly failed: readonly string[]
}

export const EMPTY_RESIDENCY: ResidencyState = { held: [], leaving: {}, failed: [] }

export interface ResidencyPlan {
  readonly state: ResidencyState
  /** Start loading these. */
  readonly load: readonly string[]
  /** Dispose these (cancel them if still loading). */
  readonly evict: readonly string[]
}

export function planResidency(state: ResidencyState, wantedInput: readonly string[], now: number): ResidencyPlan {
  const wanted = wantedInput.filter((id, i) => wantedInput.indexOf(id) === i && !state.failed.includes(id)).slice(0, MAX_RESIDENT)

  let held = [...state.held]
  const leaving: Record<string, number> = {}
  for (const id of held) {
    if (wanted.includes(id)) continue
    leaving[id] = state.leaving[id] ?? now
  }

  const evict: string[] = []
  // Hysteresis: the ones that have waited out the grace period go.
  for (const id of held) {
    const since = leaving[id]
    if (since !== undefined && now - since >= GRACE_MS) evict.push(id)
  }
  held = held.filter((id) => !evict.includes(id))

  // New assets take room from the longest-waiting leaver; the cap is never exceeded.
  const load: string[] = []
  for (const id of wanted) {
    if (held.includes(id)) continue
    while (held.length >= MAX_RESIDENT) {
      const victim = held
        .filter((h) => leaving[h] !== undefined)
        .sort((a, b) => (leaving[a] ?? 0) - (leaving[b] ?? 0))[0]
      if (victim === undefined) break
      held = held.filter((h) => h !== victim)
      evict.push(victim)
    }
    if (held.length >= MAX_RESIDENT) continue
    held.push(id)
    load.push(id)
  }

  const stillLeaving: Record<string, number> = {}
  for (const id of held) {
    const since = leaving[id]
    if (since !== undefined) stillLeaving[id] = since
  }
  return { state: { held, leaving: stillLeaving, failed: state.failed }, load, evict }
}

/** A load failed (network, integrity, parse, compile): free its room and never retry it. */
export function markFailed(state: ResidencyState, id: string): ResidencyState {
  const leaving = { ...state.leaving }
  delete leaving[id]
  return {
    held: state.held.filter((h) => h !== id),
    leaving,
    failed: state.failed.includes(id) ? state.failed : [...state.failed, id],
  }
}
