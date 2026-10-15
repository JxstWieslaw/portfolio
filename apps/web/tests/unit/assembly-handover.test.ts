import { describe, expect, it } from 'vitest'
import { handoverFades } from '@/lib/assembly/handover'
import { assemblyS, heroWeight, scrollP } from '@/lib/hero/progress'
import { resolveScroll, type SectionBox } from '@/lib/assembly/scroll'

describe('handoverFades', () => {
  it('changes nothing while the hero engine has not painted', () => {
    expect(handoverFades(false, 'monolith', 'stream')).toEqual({ from: 1, to: 1 })
    expect(handoverFades(false, 'stream', 'monolith')).toEqual({ from: 1, to: 1 })
  })

  it('draws the monolith side at size 0 and the stream at full size when the engine owns the hero', () => {
    expect(handoverFades(true, 'monolith', 'stream')).toEqual({ from: 0, to: 1 })
    // Scrolling back up: the stream shrinks away as the engine's monolith reassembles.
    expect(handoverFades(true, 'stream', 'monolith')).toEqual({ from: 1, to: 0 })
  })

  it('leaves every other pair, and the on-load cloud seed, at full size', () => {
    expect(handoverFades(true, 'stream', 'lattice')).toEqual({ from: 1, to: 1 })
    expect(handoverFades(true, 'orbit', 'scatter')).toEqual({ from: 1, to: 1 })
    expect(handoverFades(true, 'cloud', 'stream')).toEqual({ from: 1, to: 1 })
    expect(handoverFades(true, 'cloud', 'monolith')).toEqual({ from: 1, to: 0 })
  })
})

describe('the hero band and the hand-over line up', () => {
  const vh = 800
  const boxes: SectionBox[] = [
    { id: 'hero', formation: 'monolith', top: 0, height: vh },
    { id: 'proof', formation: 'stream', top: vh, height: 500 },
  ]

  it('has the monolith dispersing before the cubes start to grow, and gone before the stream is whole', () => {
    // Cubes begin growing where the scroll store's mix leaves 0.
    let firstMix = -1
    for (let y = 0; y <= vh; y += 4) {
      if (resolveScroll(boxes, y, vh).mix > 0) {
        firstMix = y
        break
      }
    }
    expect(firstMix).toBeGreaterThan(0)
    const pAtFirstMix = scrollP(firstMix, vh)
    // By then the engine's monolith has already started to disperse (assembly below 1) and is still opaque.
    expect(assemblyS(1, pAtFirstMix)).toBeLessThan(1)
    expect(heroWeight(pAtFirstMix)).toBe(1)
    // The engine's layer is fully faded by the time the page has scrolled 0.9 viewports, and the mix is done by then.
    expect(heroWeight(scrollP(0.9 * vh, vh))).toBe(0)
    const end = resolveScroll(boxes, 0.9 * vh, vh)
    // Either the morph is nearly done or it has finished and the stream holds the view on its own.
    expect(end.from === 'stream' || end.mix > 0.9).toBe(true)
  })

  it('the effective cube size is a function of scroll alone: 0 at the top, rising monotonically through the band to 1, and the same going up as going down', () => {
    // Effective size of a cube is the mix of the two slot multipliers by the morph's mix.
    const size = (y: number): number => {
      const state = resolveScroll(boxes, y, vh)
      const fades = handoverFades(true, state.from, state.to)
      return fades.from + (fades.to - fades.from) * state.mix
    }
    const ys: number[] = []
    for (let y = 0; y <= 1.6 * vh; y += 8) ys.push(y)
    const down = ys.map(size)
    const up = [...ys].reverse().map(size).reverse()
    expect(up).toEqual(down)
    expect(down[0]).toBe(0)
    expect(down.at(-1)).toBe(1)
    for (let i = 1; i < down.length; i += 1) expect(down[i] as number).toBeGreaterThanOrEqual(down[i - 1] as number)
    // It actually passes through the middle: the hand-over is a ramp, not a switch.
    expect(down.some((v) => v > 0.2 && v < 0.8)).toBe(true)
  })
})
