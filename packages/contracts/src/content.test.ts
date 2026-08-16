import { describe, expect, it } from 'vitest'
import { projectSchema, profileSchema, skillGroupSchema } from './content.js'

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

describe('profileSchema', () => {
  it('requires at least one role and one KPI', () => {
    expect(() =>
      profileSchema.parse({
        name: 'Wieslaw Samushonga',
        headline: 'x',
        sub: 'y',
        location: 'Harare, Zimbabwe',
        email: 'a@b.com',
        availability: 'Open to consulting & collaboration',
        roles: [],
        links: [],
        kpis: [],
      })
    ).toThrow()
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
