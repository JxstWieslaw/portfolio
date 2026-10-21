import { describe, expect, it } from 'vitest'
import { emptyProbe, makeCubeFreeze, readCubeFreeze } from '@/lib/assembly/cube-freeze'
import { FORMATION_IDS } from '@/lib/formations/config'

describe('readCubeFreeze', () => {
  it('reads time, two formation indices and a mix', () => {
    expect(readCubeFreeze('?cubefreeze=20,1,2,0.5')).toEqual({
      t: 20,
      scroll: { from: FORMATION_IDS[1], to: FORMATION_IDS[2], mix: 0.5, opacity: 1 },
    })
  })

  it('is absent without the parameter', () => {
    expect(readCubeFreeze('')).toBeNull()
    expect(readCubeFreeze('?hero=off')).toBeNull()
  })

  it.each([
    ['too few parts', '?cubefreeze=20,1,2'],
    ['too many parts', '?cubefreeze=20,1,2,0.5,1'],
    ['an empty part', '?cubefreeze=20,,2,0.5'],
    ['a word', '?cubefreeze=soon,1,2,0.5'],
    ['a negative time', '?cubefreeze=-1,1,2,0.5'],
    ['a formation past the last', `?cubefreeze=1,${FORMATION_IDS.length},2,0.5`],
    ['a fractional formation', '?cubefreeze=1,1.5,2,0.5'],
    ['a mix above 1', '?cubefreeze=1,1,2,1.01'],
    ['a negative mix', '?cubefreeze=1,1,2,-0.1'],
  ])('rejects %s', (_name, search) => {
    expect(readCubeFreeze(search)).toBeNull()
  })
})

describe('makeCubeFreeze', () => {
  it('keeps full opacity: the frozen layer is never faded out', () => {
    expect(makeCubeFreeze(0, 0, 0, 0)?.scroll.opacity).toBe(1)
  })

  it('starts the probe at zero', () => {
    expect(emptyProbe()).toEqual({ frames: 0, calls: 0, triangles: 0, programs: 0, geometries: 0, textures: 0 })
  })
})
