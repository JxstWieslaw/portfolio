import { afterEach, describe, expect, it, vi } from 'vitest'

import { SITE_DESCRIPTION, SITE_TITLE, canonical, personJsonLd, siteUrl } from '@/lib/seo'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('siteUrl', () => {
  it('prefers an explicit origin', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://wieslaw.dev')
    expect(siteUrl()).toBe('https://wieslaw.dev')
  })

  it('strips a trailing slash so canonicals never double up', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://wieslaw.dev/')
    expect(siteUrl()).toBe('https://wieslaw.dev')
    expect(canonical('/')).toBe('https://wieslaw.dev/')
  })

  it('falls back to the Vercel origin when no domain is set', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_VERCEL_URL', 'portfolio-abc123.vercel.app')
    expect(siteUrl()).toBe('https://portfolio-abc123.vercel.app')
  })
})

describe('metadata copy', () => {
  it('names both roles in the title', () => {
    expect(SITE_TITLE).toContain('Tech Lead')
  })

  it('describes the reconciled identity, not the export pivot', () => {
    expect(SITE_DESCRIPTION).toContain('Tech Lead at Data Age')
    expect(SITE_DESCRIPTION).toContain('Rapidev Labs')
    expect(SITE_DESCRIPTION).not.toContain('Full Stack Engineer')
  })

  it('is short enough to survive a search result', () => {
    // Google truncates around 155-160 chars; this is allowed to run longer for social cards
    // but must not be so long that the first clause is lost.
    expect(SITE_DESCRIPTION.length).toBeLessThan(320)
    expect(SITE_DESCRIPTION.indexOf('Tech Lead')).toBeLessThan(40)
  })
})

describe('personJsonLd', () => {
  const ld = personJsonLd()

  it('is a schema.org Person', () => {
    expect(ld['@context']).toBe('https://schema.org')
    expect(ld['@type']).toBe('Person')
    expect(ld.name).toBe('Wieslaw Samushonga')
  })

  it('asserts both job titles, because both roles are current', () => {
    // Collapsing these to one would misrepresent the positioning the whole site rests on.
    expect(ld.jobTitle).toEqual(['Tech Lead', 'Senior Software Engineer'])
  })

  it('lists both employers', () => {
    const orgs = ld.worksFor as { '@type': string; name: string }[]
    expect(orgs.map((o) => o.name)).toEqual(['Data Age', 'Rapidev Labs'])
    for (const org of orgs) expect(org['@type']).toBe('Organization')
  })

  it('includes only real profile URLs in sameAs', () => {
    const sameAs = ld.sameAs as string[]
    expect(sameAs.length).toBeGreaterThan(0)
    for (const url of sameAs) expect(url.startsWith('http')).toBe(true)
    // mailto: is not an identity, and a company site is not a personal profile.
    expect(sameAs.some((u) => u.startsWith('mailto:'))).toBe(false)
    expect(sameAs).not.toContain('https://rapidevlabs.com')
  })

  it('locates him in Harare', () => {
    const address = ld.address as Record<string, string>
    expect(address.addressLocality).toBe('Harare')
    expect(address.addressCountry).toBe('ZW')
  })

  it('serialises without throwing', () => {
    expect(() => JSON.stringify(ld)).not.toThrow()
  })
})
