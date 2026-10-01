import { describe, expect, it } from 'vitest'
import { easeInOut, isFormationId, resolveScroll, type SectionBox } from '@/lib/assembly/scroll'

const VH = 900

/** The home page's nine sections, in document order, with plausible heights. */
const BOXES: readonly SectionBox[] = [
  { id: 'hero', formation: 'monolith', top: 0, height: 900 },
  { id: 'proof', formation: 'stream', top: 900, height: 600 },
  { id: 'work', formation: 'lattice', top: 1500, height: 1400 },
  { id: 'lead', formation: 'orbit', top: 2900, height: 1200 },
  { id: 'craft', formation: 'scatter', top: 4100, height: 1200 },
  { id: 'stack', formation: 'grid', top: 5300, height: 1200 },
  { id: 'timeline', formation: null, top: 6500, height: 1500 },
  { id: 'writing', formation: null, top: 8000, height: 1200 },
  { id: 'contact', formation: 'ring', top: 9200, height: 900 },
]

/** scrollY that puts the viewport centre on a document y. */
const centreAt = (y: number): number => y - VH / 2

describe('resolveScroll', () => {
  it.each([
    ['hero top', 0, 'monolith', 'monolith', 0, 1],
    ['midway between proof and work', centreAt(1500), 'stream', 'lattice', 0.5, 1],
    ['deep inside work', centreAt(2200), 'lattice', 'orbit', 0, 1],
    ['over timeline', centreAt(7250), 'grid', 'grid', 0, 0],
    ['over writing', centreAt(8600), 'grid', 'grid', 0, 0],
    ['contact', centreAt(9650), 'ring', 'ring', 0, 1],
  ] as const)('%s', (_label, scrollY, from, to, mix, opacity) => {
    const state = resolveScroll(BOXES, scrollY, VH)
    expect(state.from).toBe(from)
    expect(state.to).toBe(to)
    expect(state.mix).toBeCloseTo(mix, 2)
    expect(state.opacity).toBeCloseTo(opacity, 2)
  })

  it('fades out across the stack -> timeline boundary and back in for contact', () => {
    const leaving = resolveScroll(BOXES, centreAt(6500), VH)
    expect(leaving.from).toBe('grid')
    expect(leaving.opacity).toBeCloseTo(0.5, 2)

    const arriving = resolveScroll(BOXES, centreAt(9200), VH)
    expect(arriving.to).toBe('ring')
    expect(arriving.opacity).toBeCloseTo(0.5, 2)
    // The cubes hold the last formation while hidden, then morph into the ring.
    expect(arriving.from).toBe('grid')
  })

  it('eases in and out across the band around a boundary', () => {
    const quarter = resolveScroll(BOXES, centreAt(1500 - 0.35 * VH * 0.5), VH)
    expect(quarter.mix).toBeCloseTo(easeInOut(0.25), 4)
    expect(quarter.mix).toBeLessThan(0.25)
    const edge = resolveScroll(BOXES, centreAt(1500 - 0.35 * VH), VH)
    expect(edge.mix).toBe(0)
  })

  it('never exceeds the last section', () => {
    const state = resolveScroll(BOXES, 50_000, VH)
    expect(state.from).toBe('ring')
    expect(state.to).toBe('ring')
    expect(state.mix).toBe(0)
  })

  it('is idle and hidden with nothing to measure', () => {
    expect(resolveScroll([], 0, VH)).toEqual({ from: 'monolith', to: 'monolith', mix: 0, opacity: 0 })
    expect(resolveScroll(BOXES, 0, 0).opacity).toBe(0)
  })

  it('only trusts real formation ids from the DOM', () => {
    expect(isFormationId('monolith')).toBe(true)
    expect(isFormationId('badge')).toBe(false)
    expect(isFormationId(undefined)).toBe(false)
  })
})
