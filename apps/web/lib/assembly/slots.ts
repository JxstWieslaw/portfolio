/**
 * Attribute-slot ping-pong — journey spec § 4.5, decision D9.
 *
 * PURE. The GPU holds two formation slots, A and B. On a scroll-store change
 * this decides which slot (if any) to rewrite and what `uSwap` becomes, with
 * one rule: the slot holding `from` is never touched mid-morph.
 */

import type { BundleKind } from '@/lib/assembly/targets'

export type Slot = 'a' | 'b'

export interface SlotState {
  readonly a: BundleKind | null
  readonly b: BundleKind | null
}

export interface SlotPlan {
  readonly state: SlotState
  /** Slots to (re)write, in order. */
  readonly writes: ReadonlyArray<{ readonly slot: Slot; readonly kind: BundleKind }>
  /** `0` when A holds `from`, `1` when B does. */
  readonly swap: 0 | 1
}

export const EMPTY_SLOTS: SlotState = { a: null, b: null }

const NO_WRITES: SlotPlan['writes'] = []

export function planSlots(state: SlotState, from: BundleKind, to: BundleKind): SlotPlan {
  // Fast path for the common frame: the slots already hold from and to.
  if (state.a === from && state.b === to) return { state, writes: NO_WRITES, swap: 0 }
  if (state.b === from && state.a === to) return { state, writes: NO_WRITES, swap: 1 }
  if (state.a === from) {
    const writes = state.b === to ? [] : [{ slot: 'b' as const, kind: to }]
    return { state: { a: from, b: to }, writes, swap: 0 }
  }
  if (state.b === from) {
    const writes = state.a === to ? [] : [{ slot: 'a' as const, kind: to }]
    return { state: { a: to, b: from }, writes, swap: 1 }
  }
  // Neither slot holds `from` (first frame, or a jump): fill both.
  return {
    state: { a: from, b: to },
    writes: [
      { slot: 'a', kind: from },
      { slot: 'b', kind: to },
    ],
    swap: 0,
  }
}
