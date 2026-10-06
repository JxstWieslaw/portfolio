import { describe, expect, it } from 'vitest'
import { ENVIRONMENT_DOME, ENVIRONMENT_FACE_PX, ENVIRONMENT_INTENSITY, LIGHTFORMERS } from '@/lib/assembly/environment'

const luminance = (hex: string): number => {
  const n = Number.parseInt(hex.slice(1), 16)
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
}

describe('environment layout', () => {
  it('is two long white strips plus two thin brand-coloured edge strips', () => {
    expect(LIGHTFORMERS.map((l) => l.name)).toEqual(['key-strip', 'rim-strip', 'edge-cyan', 'edge-violet'])
    expect(LIGHTFORMERS.find((l) => l.name === 'edge-cyan')?.color).toBe('#22D3EE')
    expect(LIGHTFORMERS.find((l) => l.name === 'edge-violet')?.color).toBe('#7C3AED')
  })

  it('keeps the plane count small and every strip long and thin', () => {
    expect(LIGHTFORMERS.length).toBeLessThanOrEqual(5)
    for (const l of LIGHTFORMERS) expect(Math.max(...l.size) / Math.min(...l.size)).toBeGreaterThanOrEqual(5)
  })

  it('has a bright white key above and a white rim behind (high contrast against the dome)', () => {
    const key = LIGHTFORMERS.find((l) => l.name === 'key-strip')
    const rim = LIGHTFORMERS.find((l) => l.name === 'rim-strip')
    expect(key?.color).toBe('#ffffff')
    expect(rim?.color).toBe('#ffffff')
    expect(key?.position[1]).toBeGreaterThan(0)
    expect(rim?.position[2]).toBeLessThan(0)
    for (const l of LIGHTFORMERS) expect(l.intensity).toBeGreaterThan(ENVIRONMENT_DOME.intensity * 5)
  })

  it('has no near-black fill planes: the dome is the only fill and it is coloured, not black', () => {
    for (const l of LIGHTFORMERS) expect(luminance(l.color)).toBeGreaterThan(0.1)
    expect(ENVIRONMENT_DOME.bottom).toBe('#7C3AED')
    expect(ENVIRONMENT_DOME.top).toBe('#22D3EE')
    expect(ENVIRONMENT_DOME.intensity).toBeGreaterThan(0)
    expect(ENVIRONMENT_DOME.intensity).toBeLessThanOrEqual(0.4)
  })

  it('stays inside the PMREM budget (64 px faces) and the environment multiplier stays modest', () => {
    expect(ENVIRONMENT_FACE_PX).toBeLessThanOrEqual(64)
    expect(ENVIRONMENT_INTENSITY).toBeGreaterThan(0)
    expect(ENVIRONMENT_INTENSITY).toBeLessThanOrEqual(1.2)
  })
})
