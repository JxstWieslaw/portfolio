import { describe, expect, it } from 'vitest'
import { dampFrame, freeRect, heroFrame, MAX_ZOOM } from '@/lib/hero/frame'

describe('heroFrame', () => {
  it('reproduces the lab at 390x844: centre 0.5, 0.755, zoom 2.835', () => {
    // The lab's measured free band at 390 px: from 8 px under the nav to 6 px above its mock panel.
    const f = heroFrame({ w: 390, h: 844 }, { x0: 0, y0: 63.9, x1: 390, y1: 349.7 })
    expect(f.cx).toBeCloseTo(0.5, 3)
    expect(f.cy).toBeCloseTo(0.755, 3)
    expect(f.zoom).toBeCloseTo(2.835, 3)
  })

  it('puts the subject right of the panel at 1440x900', () => {
    const f = heroFrame({ w: 1440, h: 900 }, { x0: 712, y0: 72, x1: 1440, y1: 900 })
    expect(f.cx).toBeCloseTo((712 + 1440) / 2 / 1440, 10)
    expect(f.cy).toBeCloseTo(1 - (72 + 900) / 2 / 900, 10)
    // Height governs: 900 / 828 * 0.96 is below 1, so the zoom floors at 1; width needs 0.98 * 900 / 728.
    expect(f.zoom).toBeCloseTo(Math.max(1, (0.98 * 900) / 728), 10)
  })

  it('never zooms past the cap, and a tiny free band cannot divide by zero', () => {
    const f = heroFrame({ w: 390, h: 844 }, { x0: 0, y0: 100, x1: 390, y1: 101 })
    expect(f.zoom).toBe(MAX_ZOOM)
    expect(Number.isFinite(f.cy)).toBe(true)
  })

  it('never zooms out below 1', () => {
    expect(heroFrame({ w: 2000, h: 500 }, { x0: 0, y0: 0, x1: 2000, y1: 500 }).zoom).toBe(1)
  })
})

describe('freeRect', () => {
  const panel = { left: 60, top: 400, right: 700 }

  it('is the band above the panel below 900 px', () => {
    expect(freeRect({ w: 390, h: 844 }, 56, { left: 0, top: 356, right: 390 })).toEqual({ x0: 0, y0: 64, x1: 390, y1: 350 })
  })

  it('is the area right of the panel from 900 px', () => {
    expect(freeRect({ w: 1440, h: 900 }, 64, panel)).toEqual({ x0: 712, y0: 72, x1: 1440, y1: 900 })
  })

  it('is the whole viewport under the nav before the panel has been measured', () => {
    expect(freeRect({ w: 1000, h: 700 }, 50, null)).toEqual({ x0: 0, y0: 58, x1: 1000, y1: 700 })
  })
})

describe('dampFrame', () => {
  it('moves toward the target without overshooting and settles', () => {
    let f = { cx: 0.5, cy: 0.5, zoom: 1 }
    const target = { cx: 0.7, cy: 0.4, zoom: 2 }
    for (let i = 0; i < 600; i += 1) {
      f = dampFrame(f, target, 1 / 60)
      expect(f.zoom).toBeLessThanOrEqual(2)
    }
    expect(f.zoom).toBeCloseTo(2, 3)
    expect(f.cx).toBeCloseTo(0.7, 3)
  })

  it('does nothing for a zero step', () => {
    expect(dampFrame({ cx: 0.1, cy: 0.2, zoom: 3 }, { cx: 0.9, cy: 0.9, zoom: 1 }, 0)).toEqual({ cx: 0.1, cy: 0.2, zoom: 3 })
  })
})
