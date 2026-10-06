import { afterEach, describe, expect, it } from 'vitest'
import { assemblyClock, resetAssemblyClock } from '@/lib/hero/clock'

describe('the shared assembly clock', () => {
  afterEach(() => resetAssemblyClock())

  it('starts unset, so the hero uses its own first frame when the cubes never ran', () => {
    expect(assemblyClock.t0).toBe(-1)
  })

  it('resetting (the 3D scene unmounting) forgets a stale start, so a remounted page cannot seed the hero from it', () => {
    assemblyClock.t0 = 1234
    resetAssemblyClock()
    expect(assemblyClock.t0).toBe(-1)
  })
})
