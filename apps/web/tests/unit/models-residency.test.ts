import { describe, expect, it } from 'vitest'
import { EMPTY_RESIDENCY, GRACE_MS, MAX_RESIDENT, markFailed, planResidency, type ResidencyState } from '@/lib/models/residency'

/** Applies a plan the way the slot does: the state it returns is the new truth. */
const step = (state: ResidencyState, wanted: string[], now: number) => planResidency(state, wanted, now)

describe('planResidency', () => {
  it('does nothing when nothing is wanted and nothing is held', () => {
    expect(step(EMPTY_RESIDENCY, [], 0)).toEqual({ state: EMPTY_RESIDENCY, load: [], evict: [] })
  })

  it('loads what is wanted, once', () => {
    const first = step(EMPTY_RESIDENCY, ['a'], 0)
    expect(first.load).toEqual(['a'])
    expect(first.state.held).toEqual(['a'])
    const second = step(first.state, ['a'], 16)
    expect(second.load).toEqual([])
    expect(second.evict).toEqual([])
  })

  it('never holds more than two, whatever is wanted', () => {
    expect(MAX_RESIDENT).toBe(2)
    const plan = step(EMPTY_RESIDENCY, ['a', 'b', 'c'], 0)
    expect(plan.load).toEqual(['a', 'b'])
    expect(plan.state.held).toHaveLength(2)
  })

  it('keeps an asset that left the wanted set for the grace period, then evicts it', () => {
    const held = step(EMPTY_RESIDENCY, ['a'], 0).state
    const gone = step(held, [], 1000)
    expect(gone.evict).toEqual([])
    expect(gone.state.held).toEqual(['a'])
    const stillWaiting = step(gone.state, [], 1000 + GRACE_MS - 1)
    expect(stillWaiting.evict).toEqual([])
    const out = step(stillWaiting.state, [], 1000 + GRACE_MS)
    expect(out.evict).toEqual(['a'])
    expect(out.state.held).toEqual([])
  })

  it('forgets the grace clock when the asset is wanted again (scroll jitter does not evict)', () => {
    const held = step(EMPTY_RESIDENCY, ['a'], 0).state
    const leaving = step(held, [], 500).state
    const back = step(leaving, ['a'], 900)
    expect(back.state.leaving).toEqual({})
    const awayAgain = step(back.state, [], 1000)
    expect(step(awayAgain.state, [], 1000 + GRACE_MS - 1).evict).toEqual([])
  })

  it('makes room for a new asset by evicting the longest-waiting leaver, so a third is never resident', () => {
    let state = step(EMPTY_RESIDENCY, ['a', 'b'], 0).state
    state = step(state, ['b'], 100).state // a leaves at 100
    state = step(state, [], 200).state // b leaves at 200
    const plan = step(state, ['c'], 300)
    expect(plan.evict).toEqual(['a'])
    expect(plan.load).toEqual(['c'])
    expect([...plan.state.held].sort()).toEqual(['b', 'c'])
    expect(plan.state.held.length).toBeLessThanOrEqual(MAX_RESIDENT)
  })

  it('walks a scroll through three sections without ever exceeding two', () => {
    let state = EMPTY_RESIDENCY
    const timeline: Array<[number, string[]]> = [
      [0, ['a']],
      [100, ['a', 'b']],
      [200, ['b']],
      [300, ['b', 'c']],
      [400, ['c']],
      [500, ['c', 'a']],
      [600, ['a']],
    ]
    for (const [now, wanted] of timeline) {
      state = step(state, wanted, now).state
      expect(state.held.length).toBeLessThanOrEqual(MAX_RESIDENT)
    }
    expect(state.held).toContain('a')
  })

  it('never retries a failed asset', () => {
    const loading = step(EMPTY_RESIDENCY, ['a'], 0).state
    const failed = markFailed(loading, 'a')
    expect(failed.held).toEqual([])
    expect(failed.failed).toEqual(['a'])
    const again = step(failed, ['a'], 5000)
    expect(again.load).toEqual([])
    expect(again.state.held).toEqual([])
    // Marking twice does not duplicate.
    expect(markFailed(failed, 'a').failed).toEqual(['a'])
  })

  it('frees the room of a failed asset for the next one', () => {
    let state = step(EMPTY_RESIDENCY, ['a', 'b'], 0).state
    state = markFailed(state, 'a')
    const plan = step(state, ['b', 'c'], 10)
    expect(plan.load).toEqual(['c'])
    expect([...plan.state.held].sort()).toEqual(['b', 'c'])
  })

  it('ignores duplicates in the wanted list', () => {
    expect(step(EMPTY_RESIDENCY, ['a', 'a'], 0).load).toEqual(['a'])
  })
})
