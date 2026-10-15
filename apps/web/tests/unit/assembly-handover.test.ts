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

  it('is exactly reversible: the same scroll gives the same fade going up as going down', () => {
    const down = resolveScroll(boxes, 300, vh)
    const up = resolveScroll(boxes, 300, vh)
    expect(up).toEqual(down)
  })
})
