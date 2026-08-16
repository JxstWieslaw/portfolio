import { describe, expect, it } from 'vitest'

import {
  BENTO_SLOTS,
  countDomainsShipped,
  getBentoProjects,
  getDomain,
  getDomains,
  getExperience,
  getFeaturedProjects,
  getKpis,
  getProfile,
  getProjects,
  getSkills,
  getWriting,
  listPlaceholders,
} from '@/lib/content'

/**
 * These are not ordinary loader tests. The design export contains a late editorial pivot that
 * the owner rejected (reconciliation section 1): it reframes Wieslaw from Tech Lead to
 * hands-on engineer, deletes Rapidev Labs, and swaps the TypeScript stack for a JVM one.
 *
 * Because the export is still committed in `docs/Portfolio Design/` and reads as authoritative,
 * the rejected copy is one careless copy-paste away from returning. This file is the guard.
 */
describe('content: the rejected pivot must never come back', () => {
  const corpus = JSON.stringify([
    getProfile(),
    getDomains(),
    getProjects(),
    getExperience(),
    getSkills(),
    getWriting(),
  ])

  it.each([
    'Ikarus',
    'Virtualize',
    'Baeldung',
    'Full Stack Engineer',
    'I build production software',
    'Software Engineer @ Data Age',
    'Load time cut',
    'Infra cost cut',
    '6+',
  ])('does not contain the rejected string %j', (rejected) => {
    expect(corpus).not.toContain(rejected)
  })

  it.each([
    'Java',
    'Kotlin',
    'Spring Boot',
    'Hibernate',
    'MongoDB',
    'Azure',
    'Nginx',
    'JUnit',
    'Mockito',
    'Jira',
  ])('does not contain the rejected JVM-stack technology %j', (tech) => {
    // Word-boundary, so "JavaScript" does not trip the "Java" assertion.
    expect(corpus).not.toMatch(new RegExp(`\\b${tech}\\b`))
  })

  it('keeps both current roles, concurrently', () => {
    const roles = getProfile().roles
    expect(roles).toHaveLength(2)
    expect(roles.map((r) => `${r.title} @ ${r.org}`)).toEqual([
      'Tech Lead @ Data Age',
      'Senior Software Engineer @ Rapidev Labs',
    ])
  })

  it('keeps the leadership headline', () => {
    expect(getProfile().headline).toBe(
      'I lead teams that ship production software — and I make the web move.',
    )
  })

  it('lists exactly three experience entries, including Rapidev Labs', () => {
    const orgs = getExperience().map((e) => e.org)
    expect(orgs).toHaveLength(3)
    expect(orgs).toContain('Data Age')
    expect(orgs).toContain('Rapidev Labs')
  })
})

describe('content: derived figures', () => {
  it('counts domains across non-placeholder projects only', () => {
    // 7, not 8: the AR case study is a placeholder and must not inflate the claim.
    expect(countDomainsShipped()).toBe(7)
  })

  it('resolves the derived KPI value rather than trusting the authored one', () => {
    const derived = [...getKpis('hero'), ...getKpis('proof')].filter(
      (k) => k.derived === 'domainsShipped',
    )
    expect(derived.length).toBeGreaterThan(0)
    for (const kpi of derived) expect(kpi.value).toBe(String(countDomainsShipped()))
  })
})

describe('content: KPI grouping', () => {
  it('splits into a hero trio and four proof tiles', () => {
    expect(getKpis('hero')).toHaveLength(3)
    expect(getKpis('proof')).toHaveLength(4)
  })

  it('assigns every KPI to a group', () => {
    // Guards the OD-7 gap: the shared schema has no `group` field yet, so the loader reads it
    // from raw JSON. If a Zod parse is ever introduced upstream it will strip the key, and
    // both groups would silently empty. This test fails loudly if that happens.
    expect(getProfile().kpis.every((k) => k.group === 'hero' || k.group === 'proof')).toBe(true)
  })

  it('flags the unverified proof claims as placeholders', () => {
    const flagged = getKpis('proof').filter((k) => k.placeholder)
    expect(flagged.map((k) => k.label)).toContain('Production platforms led/shipped')
  })
})

describe('content: the bento', () => {
  it('renders seven cards in the design sequence', () => {
    expect(getBentoProjects()).toHaveLength(BENTO_SLOTS)
    expect(getBentoProjects().map((p) => p.slug)).toEqual([
      'gabar',
      'vantage-health-system',
      'we-assist-you',
      'heycreator',
      'learnx',
      'pr-pulse',
      'ar-product-visualiser',
    ])
  })

  it('is deliberately not the featured set', () => {
    // The spec's featured six and the design's bento seven are different sets — the design
    // adds we-assist-you. Reconciliation section 0: roster is content, sequence is layout.
    const featured = getFeaturedProjects().map((p) => p.slug)
    const bento = getBentoProjects().map((p) => p.slug)
    expect(featured).toHaveLength(6)
    expect(bento).not.toEqual(featured)
    expect(bento).toContain('we-assist-you')
    expect(featured).not.toContain('we-assist-you')
  })

  it('orders projects deterministically', () => {
    const orders = getProjects().map((p) => p.order)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
    expect(new Set(orders).size).toBe(orders.length)
  })
})

describe('content: referential integrity', () => {
  it('resolves every project domain to a real domain record', () => {
    for (const project of getProjects()) {
      expect(getDomain(project.domain), `${project.slug} → ${project.domain}`).toBeDefined()
    }
  })

  it('uses only the semantic accent pair in the contract', () => {
    // Brand tints live in lib/accent.ts, not in content — see OD-2.
    for (const domain of getDomains()) {
      expect(['violet', 'cyan']).toContain(domain.accent)
    }
  })

  it('marks exactly one project as public', () => {
    const isPublic = getProjects().filter((p) => p.visibility === 'public')
    expect(isPublic.map((p) => p.slug)).toEqual(['pr-pulse'])
  })
})

describe('content: placeholder policy', () => {
  it('reports every placeholder for the linter to surface', () => {
    const kinds = new Set(listPlaceholders().map((p) => p.kind))
    expect(kinds).toContain('kpi')
    expect(kinds).toContain('project')
    expect(kinds).toContain('experience')
    expect(kinds).toContain('writing')
  })

  it('ships two writing entries, not three', () => {
    // The third slot in the design is a designed RSS-failure card — a component, not a row.
    expect(getWriting()).toHaveLength(2)
  })

  it('never uses lorem ipsum', () => {
    const corpus = JSON.stringify([getProfile(), getProjects(), getExperience(), getWriting()])
    expect(corpus.toLowerCase()).not.toContain('lorem')
  })
})

describe('content: skills', () => {
  it('ships the six spec groups', () => {
    expect(getSkills()).toHaveLength(6)
    for (const group of getSkills()) expect(group.items.length).toBeGreaterThan(0)
  })

  it('leads with TypeScript', () => {
    const all = getSkills().flatMap((g) => g.items.map((i) => i.name))
    expect(all).toContain('TypeScript')
  })
})
