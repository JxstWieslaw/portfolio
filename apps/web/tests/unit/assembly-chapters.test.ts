import { describe, expect, it } from 'vitest'
import { easeOutBack } from '@/lib/assembly/artefact'
import {
  CHAPTERS,
  chapterFor,
  lerpChapter,
  modelScale,
  modelWeight,
  nextAssetAfter,
  scrubTime,
  wantedAssets,
  type Chapter,
  type ModelPlacement,
} from '@/lib/assembly/chapters'
import { scatterWeight } from '@/lib/assembly/motion'
import { FORMATION_IDS, type FormationId } from '@/lib/formations/config'

const placement = (asset: string, over: Partial<ModelPlacement> = {}): ModelPlacement => ({
  asset,
  role: 'prop',
  position: [0, 0, 0],
  scale: 1,
  rotation: [0, 0, 0],
  spin: 0,
  exclusion: 0,
  appear: [0.2, 0.8],
  ...over,
})

/** The committed ledger with some rows filled, for the paths no merged row exercises yet. */
function ledgerWith(rows: Partial<Record<FormationId, ModelPlacement>>): Record<FormationId, Chapter> {
  const out = { ...CHAPTERS }
  for (const id of FORMATION_IDS) {
    const model = rows[id]
    if (model) out[id] = { ...CHAPTERS[id], model }
  }
  return out
}

describe('the chapter ledger', () => {
  it('has a row for every formation', () => {
    expect(Object.keys(CHAPTERS).sort()).toEqual([...FORMATION_IDS].sort())
  })

  it('merges with no model and neutral values, so no pixel changes', () => {
    for (const id of FORMATION_IDS) {
      expect(CHAPTERS[id]).toEqual({ target: [0, 0, 0], keyBias: 1, fillBias: 1, model: null })
    }
  })

  it('resolves the cloud to the monolith, as the camera table does', () => {
    expect(chapterFor('cloud')).toBe(CHAPTERS.monolith)
    expect(chapterFor('orbit')).toBe(CHAPTERS.orbit)
  })

  it('lerps target and biases by the clamped mix', () => {
    const a: Chapter = { target: [0, 0, 0], keyBias: 1, fillBias: 1, model: null }
    const b: Chapter = { target: [2, -4, 6], keyBias: 2, fillBias: 0.5, model: null }
    expect(lerpChapter(a, b, 0.5)).toEqual({ target: [1, -2, 3], keyBias: 1.5, fillBias: 0.75 })
    expect(lerpChapter(a, b, -3)).toEqual({ target: [0, 0, 0], keyBias: 1, fillBias: 1 })
    expect(lerpChapter(a, b, 7)).toEqual({ target: [2, -4, 6], keyBias: 2, fillBias: 0.5 })
  })
})

describe('modelWeight', () => {
  it.each([
    ['scatter', 'scatter', 0.3],
    ['monolith', 'scatter', 0.25],
    ['scatter', 'grid', 0.6],
    ['stream', 'lattice', 0.5],
    ['monolith', 'monolith', 0],
  ] as const)('matches scatterWeight for %s -> %s at %s', (from, to, mix) => {
    expect(modelWeight(from, to, mix, 'scatter')).toBeCloseTo(scatterWeight(from, to, mix), 12)
  })

  it('is 1 at rest on the formation and 0 when it is in neither slot', () => {
    expect(modelWeight('orbit', 'orbit', 0, 'orbit')).toBe(1)
    expect(modelWeight('stream', 'lattice', 0.4, 'orbit')).toBe(0)
  })

  it('treats the cloud as the monolith, so the on-load assembly keeps the hero at full weight', () => {
    expect(modelWeight('cloud', 'monolith', 0.37, 'monolith')).toBeCloseTo(1, 12)
  })
})

describe('modelScale', () => {
  const appear = [0.2, 0.8] as const

  it('is exactly 0 at and below appear[0] and exactly 1 at and above appear[1]', () => {
    expect(modelScale(0, appear)).toBe(0)
    expect(modelScale(0.2, appear)).toBe(0)
    expect(modelScale(0.8, appear)).toBe(1)
    expect(modelScale(1, appear)).toBe(1)
  })

  it('follows the artefact ignition curve across the window', () => {
    for (const w of [0.25, 0.4, 0.5, 0.65, 0.79]) expect(modelScale(w, appear)).toBeCloseTo(easeOutBack((w - 0.2) / 0.6), 12)
  })

  it('rises through the window to the back-out overshoot and settles at 1, never below 0', () => {
    // easeOutBack overshoots (peak about 1.1) before it settles, so the curve is not monotonic past the peak.
    let peak = 0
    let previous = 0
    let rising = true
    for (let i = 0; i <= 100; i += 1) {
      const s = modelScale(0.2 + (0.6 * i) / 100, appear)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThan(1.2)
      if (rising && s < previous) rising = false
      if (rising) expect(s).toBeGreaterThanOrEqual(previous)
      previous = s
      peak = Math.max(peak, s)
    }
    expect(peak).toBeGreaterThan(1)
    expect(previous).toBe(1)
  })
})

describe('scrubTime', () => {
  it('is a pure, clamped function of the formation weight', () => {
    expect(scrubTime(0, 4)).toBe(0)
    expect(scrubTime(0.5, 4)).toBe(2)
    expect(scrubTime(1, 4)).toBe(4)
    expect(scrubTime(-1, 4)).toBe(0)
    expect(scrubTime(3, 4)).toBe(4)
  })
})

describe('wantedAssets', () => {
  it('is empty for the merged ledger', () => {
    expect(wantedAssets('monolith', 'stream', 0.5)).toEqual([])
  })

  it('names the placements of from and to whose weight is above zero, deduplicated', () => {
    const ledger = ledgerWith({ monolith: placement('hero'), stream: placement('flow'), orbit: placement('hero') })
    expect(wantedAssets('monolith', 'stream', 0.5, ledger)).toEqual(['hero', 'flow'])
    expect(wantedAssets('monolith', 'monolith', 0, ledger)).toEqual(['hero'])
    expect(wantedAssets('stream', 'lattice', 0.5, ledger)).toEqual(['flow'])
    // At mix 0 the destination has weight 0: it is not wanted yet.
    expect(wantedAssets('monolith', 'stream', 0, ledger)).toEqual(['hero'])
    // Two formations sharing one asset want it once.
    expect(wantedAssets('monolith', 'orbit', 0.5, ledger)).toEqual(['hero'])
  })

  it('never returns more than two', () => {
    const ledger = ledgerWith({ monolith: placement('a'), stream: placement('b'), lattice: placement('c') })
    for (const mix of [0, 0.2, 0.5, 0.9]) expect(wantedAssets('monolith', 'stream', mix, ledger).length).toBeLessThanOrEqual(2)
  })
})

describe('nextAssetAfter', () => {
  it('is null for the merged ledger', () => {
    expect(nextAssetAfter('monolith')).toBeNull()
  })

  it('finds the next formation in document order that has a placement', () => {
    const ledger = ledgerWith({ lattice: placement('rack'), ring: placement('door') })
    expect(nextAssetAfter('monolith', ledger)).toBe('rack')
    expect(nextAssetAfter('lattice', ledger)).toBe('door')
    expect(nextAssetAfter('ring', ledger)).toBeNull()
  })
})
