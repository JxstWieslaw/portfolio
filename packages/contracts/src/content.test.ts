import { describe, expect, it } from 'vitest'
import {
  countDomainsShipped,
  profileSchema,
  projectSchema,
  resolveDerivedKpis,
  skillGroupSchema,
} from './content.js'

const validProject = {
  slug: 'heycreator',
  name: 'heycreator',
  domain: 'creator-economy',
  role: 'Senior Software Engineer',
  period: { from: '2024-01' },
  summary: 'Creator-discovery platform with automated enrichment pipelines.',
  stack: ['Next.js', 'TypeScript', 'Firebase'],
  visibility: 'private',
  featured: true,
  order: 1,
}

describe('projectSchema', () => {
  it('accepts a valid project and defaults placeholder to false', () => {
    const parsed = projectSchema.parse(validProject)
    expect(parsed.placeholder).toBe(false)
    expect(parsed.stack).toHaveLength(3)
  })

  it('rejects an unknown visibility', () => {
    expect(() => projectSchema.parse({ ...validProject, visibility: 'secret' })).toThrow()
  })

  it('rejects an empty stack, because a card with no chips would render empty', () => {
    expect(() => projectSchema.parse({ ...validProject, stack: [] })).toThrow()
  })

  it('rejects a slug that is not kebab-case', () => {
    expect(() => projectSchema.parse({ ...validProject, slug: 'Hey Creator' })).toThrow()
  })
})

const validProfile = {
  name: 'Wieslaw Samushonga',
  headline: 'x',
  sub: 'y',
  location: 'Harare, Zimbabwe',
  email: 'a@b.com',
  availability: 'Open to consulting & collaboration',
  roles: [{ org: 'Data Age', title: 'Tech Lead' }],
  links: [{ label: 'GitHub', url: 'https://github.com/JxstWieslaw', kind: 'primary' }],
  kpis: [{ label: 'Domains shipped', value: '4', group: 'hero' }],
}

describe('profileSchema', () => {
  it('rejects a profile with no roles', () => {
    expect(() => profileSchema.parse({ ...validProfile, roles: [] })).toThrow()
  })

  it('rejects a profile with no KPIs', () => {
    expect(() => profileSchema.parse({ ...validProfile, kpis: [] })).toThrow()
  })
})

describe('profileSchema — KPI groups and provisional email', () => {
  it('requires every KPI to name its group', () => {
    expect(() =>
      profileSchema.parse({ ...validProfile, kpis: [{ label: 'Years', value: '5+' }] }),
    ).toThrow()
  })

  it('keeps group and emailPlaceholder instead of stripping them', () => {
    const parsed = profileSchema.parse({ ...validProfile, emailPlaceholder: true })
    expect(parsed.kpis[0]?.group).toBe('hero')
    expect(parsed.emailPlaceholder).toBe(true)
  })
})

describe('derived KPIs', () => {
  const projects = [
    { domain: 'healthcare', placeholder: false },
    { domain: 'healthcare', placeholder: false },
    { domain: 'education', placeholder: false },
    { domain: 'interactive-3d', placeholder: true },
  ]

  it('counts distinct domains across non-placeholder projects only', () => {
    expect(countDomainsShipped(projects)).toBe(2)
  })

  it('replaces a derived KPI value and leaves authored ones alone', () => {
    const profile = profileSchema.parse({
      ...validProfile,
      kpis: [
        { label: 'Domains shipped', value: '99', derived: 'domainsShipped', group: 'hero' },
        { label: 'Years shipping', value: '5+', group: 'hero' },
      ],
    })
    const resolved = resolveDerivedKpis(profile, projects)
    expect(resolved.kpis.map((k) => k.value)).toEqual(['2', '5+'])
    // Pure: the input is not mutated.
    expect(profile.kpis[0]?.value).toBe('99')
  })
})

describe('skillGroupSchema', () => {
  it('defaults a skill level to working', () => {
    const parsed = skillGroupSchema.parse({
      id: 'languages',
      label: 'Languages',
      items: [{ name: 'TypeScript' }],
    })
    expect(parsed.items[0]?.level).toBe('working')
  })
})
