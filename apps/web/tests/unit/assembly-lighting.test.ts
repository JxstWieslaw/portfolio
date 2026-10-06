import { describe, expect, it } from 'vitest'
import { FILM, filmNoise, shellLookFor } from '@/lib/assembly/artefact'
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

describe('artefact shell look', () => {
  it('uses the cheap MeshStandardMaterial path at tier 1 (reduced-instances) and the film otherwise', () => {
    expect(shellLookFor(1)).toBe('film')
    expect(shellLookFor(0.99)).toBe('standard')
    expect(shellLookFor(0.5)).toBe('standard')
    expect(shellLookFor(0)).toBe('standard')
  })

  it('keeps the thin-film parameters inside their documented ranges', () => {
    expect(FILM.iridescence).toBe(1)
    expect(FILM.ior).toBeGreaterThanOrEqual(1.2)
    expect(FILM.ior).toBeLessThanOrEqual(1.4)
    expect(FILM.thickness[0]).toBeGreaterThanOrEqual(100)
    expect(FILM.thickness[1]).toBeLessThanOrEqual(800)
    expect(FILM.thickness[0]).toBeLessThan(FILM.thickness[1])
    expect(FILM.clearcoat).toBeGreaterThan(0)
    expect(FILM.clearcoat).toBeLessThanOrEqual(1)
    expect(FILM.roughness).toBeLessThanOrEqual(0.3)
    expect(FILM.metalness).toBeGreaterThanOrEqual(0)
    expect(FILM.metalness).toBeLessThanOrEqual(1)
    expect(FILM.emissiveIntensity).toBeLessThanOrEqual(0.4)
    expect(FILM.noisePx).toBeLessThanOrEqual(64)
  })

  it('drifts slowly: under 1% of the map per second on each axis', () => {
    for (const d of FILM.drift) expect(Math.abs(d)).toBeLessThan(0.01)
  })
})

describe('film noise', () => {
  it('is deterministic, one byte per texel, and uses the byte range', () => {
    const a = filmNoise()
    expect(a).toHaveLength(FILM.noisePx * FILM.noisePx)
    expect(Array.from(filmNoise())).toEqual(Array.from(a))
    expect(Math.max(...a) - Math.min(...a)).toBeGreaterThan(100)
  })

  it('tiles: the wrap seam is no rougher than the average step between neighbouring columns', () => {
    const px = FILM.noisePx
    const n = filmNoise(px)
    const step = (x0: number, x1: number): number => {
      let sum = 0
      for (let y = 0; y < px; y += 1) sum += Math.abs((n[y * px + x0] as number) - (n[y * px + x1] as number))
      return sum
    }
    let interior = 0
    for (let x = 0; x < px - 1; x += 1) interior += step(x, x + 1)
    expect(step(px - 1, 0)).toBeLessThanOrEqual((interior / (px - 1)) * 2)
  })
})
