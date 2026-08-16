import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DOMAIN_TINTS,
  DOMAIN_TONES,
  accentForDomain,
  toneStyle,
  toneVar,
} from '@/lib/accent'

const repoWeb = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const css = readFileSync(join(repoWeb, 'app', 'globals.css'), 'utf8')
const domains: Array<{ id: string; accent: string }> = JSON.parse(
  readFileSync(join(repoWeb, '..', '..', 'content', 'domains.json'), 'utf8')
) as Array<{ id: string; accent: string }>

/** design-home.md § 4 "Domain chip row" — the measured tint per domain. */
const EXPECTED_TINTS: Record<string, string> = {
  healthcare: '#6EE7B7',
  education: '#FCD34D',
  'creator-economy': '#F0ABFC',
  'procurement-erp': '#FCD34D',
  'social-services': '#C4B5FD',
  'developer-tooling': '#67E8F9',
  'interactive-3d': '#67E8F9',
  'ar-xr': '#F0ABFC',
}

describe('lib/accent — domain tints', () => {
  it.each(Object.entries(EXPECTED_TINTS))('maps %s to %s', (id, hex) => {
    expect(DOMAIN_TINTS[id as keyof typeof DOMAIN_TINTS]).toBe(hex)
  })

  it('covers every domain in content/domains.json', () => {
    for (const domain of domains) {
      expect(Object.keys(DOMAIN_TONES)).toContain(domain.id)
    }
  })

  it('falls back to violet for an unknown id rather than throwing', () => {
    expect(accentForDomain('not-a-domain')).toBe('violet')
  })

  it('resolves tones to tokens, never to raw hex', () => {
    for (const tone of Object.values(DOMAIN_TONES)) {
      expect(toneVar(tone)).toMatch(/^var\(--[a-z0-9-]+\)$/)
    }
  })

  it('declares every tint token it references in globals.css', () => {
    const referenced = new Set(
      Object.values(DOMAIN_TONES).map((tone) => toneVar(tone).slice(4, -1))
    )
    for (const token of referenced) {
      expect(css).toContain(`${token}:`)
    }
  })
})

describe('lib/accent — the contract boundary (OD-2)', () => {
  // The shared contract carries only the semantic pair. Brand hex must not
  // enter a schema the API and third parties consume.
  it('leaves content/domains.json carrying only violet or cyan', () => {
    for (const domain of domains) {
      expect(['violet', 'cyan']).toContain(domain.accent)
    }
  })

  it('keeps every brand hex out of the content files', () => {
    const serialised = readFileSync(
      join(repoWeb, '..', '..', 'content', 'domains.json'),
      'utf8'
    )
    for (const hex of Object.values(DOMAIN_TINTS)) {
      expect(serialised).not.toContain(hex)
    }
  })

  it('resolves eight domains onto five hues — amber and fuchsia are shared', () => {
    expect(Object.keys(DOMAIN_TINTS)).toHaveLength(8)
    expect(new Set(Object.values(DOMAIN_TINTS)).size).toBe(5)
    expect(DOMAIN_TINTS.education).toBe(DOMAIN_TINTS['procurement-erp'])
    expect(DOMAIN_TINTS['creator-economy']).toBe(DOMAIN_TINTS['ar-xr'])
  })
})

describe('lib/accent — toneStyle', () => {
  it('produces an inline custom property declaration', () => {
    expect(toneStyle('--chip-tint', 'emerald')).toEqual({
      '--chip-tint': 'var(--accent-emerald)',
    })
  })

  it('produces nothing when there is no tone', () => {
    expect(toneStyle('--chip-tint', undefined)).toBeUndefined()
  })
})
