import { describe, expect, it } from 'vitest'
import { REPO_CONTENT_DIR } from '../../test/support/content'
import { contentHash } from './hash'
import { experienceId, toRows } from './rows'
import { loadContentFromDir } from './source'

describe('experienceId', () => {
  it('derives a stable kebab-case key from org and start month', () => {
    expect(
      experienceId({ org: 'Data Age', title: 'Tech Lead', period: { from: '2025-01' }, highlights: ['x'], placeholder: false }),
    ).toBe('data-age-2025-01')
    expect(
      experienceId({
        org: 'Earlier engineering roles (2020–)',
        title: 'x',
        period: { from: '2020-01' },
        highlights: ['x'],
        placeholder: true,
      }),
    ).toBe('earlier-engineering-roles-2020-2020-01')
  })
})

describe('toRows', () => {
  it('maps every content item to exactly one parent row, with positions and hashes', async () => {
    const bundle = await loadContentFromDir(REPO_CONTENT_DIR)
    const rows = toRows(bundle)

    expect(rows.profile.id).toBe(1)
    expect(rows.profile.emailPlaceholder).toBe(bundle.profile.emailPlaceholder ?? false)
    expect(rows.domains.map((d) => d.position)).toEqual(bundle.domains.map((_, i) => i))
    expect(rows.projects).toHaveLength(bundle.projects.length)
    expect(rows.experiences).toHaveLength(bundle.experience.length)
    expect(rows.skillGroups.flatMap((g) => g.skills)).toHaveLength(bundle.skills.flatMap((g) => g.items).length)

    const first = bundle.projects[0]
    const firstRow = rows.projects[0]
    expect(firstRow?.row).toMatchObject({ slug: first?.slug, domainId: first?.domain, sortOrder: first?.order })
    expect(firstRow?.outcomes.map((o) => o.position)).toEqual(first?.outcome.map((_, i) => i))
  })

  it('changes a hash when position changes, so reordering is a real change', async () => {
    const bundle = await loadContentFromDir(REPO_CONTENT_DIR)
    const reordered = { ...bundle, domains: [...bundle.domains].reverse() }
    const before = new Map(toRows(bundle).domains.map((d) => [d.id, d.contentHash]))
    const after = toRows(reordered).domains
    expect(after.some((d) => d.contentHash !== before.get(d.id))).toBe(true)
    expect(contentHash(bundle.profile)).toBe(toRows(bundle).profile.contentHash)
  })
})
