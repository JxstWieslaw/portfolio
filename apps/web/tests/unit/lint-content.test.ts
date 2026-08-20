import { describe, expect, it } from 'vitest'

import { getExperience, getProfile, getProjects, getWriting, listPlaceholders } from '@/lib/content'

/**
 * `scripts/lint-content.ts` is a thin formatter over `listPlaceholders()` — it groups the
 * list by `kind` and prints it, nothing more. So the behaviour worth testing is
 * `listPlaceholders()` itself: does it report every item the content actually flags, and
 * nothing it doesn't.
 *
 * The expected sets are derived from the same getters the app uses (`getProfile`,
 * `getProjects`, ...) rather than a hardcoded count, so this test tracks the real content
 * instead of a number someone assumed once.
 */
describe('listPlaceholders (the data lint:content reports)', () => {
  const reports = listPlaceholders()

  const expected = {
    kpi: getProfile().kpis.filter((k) => k.placeholder).map((k) => k.label),
    project: getProjects().filter((p) => p.placeholder).map((p) => p.name),
    experience: getExperience().filter((e) => e.placeholder).map((e) => e.org),
    writing: getWriting().filter((w) => w.placeholder).map((w) => w.title),
  } as const

  it.each(Object.keys(expected) as (keyof typeof expected)[])(
    'reports exactly the flagged %s items, nothing more, nothing less',
    (kind) => {
      const reported = reports
        .filter((r) => r.kind === kind)
        .map((r) => r.label)
        .sort()
      expect(reported).toEqual([...expected[kind]].sort())
    },
  )

  it('reports no items outside the four known content kinds', () => {
    expect(new Set(reports.map((r) => r.kind))).toEqual(new Set(Object.keys(expected)))
  })

  it('totals exactly the sum of flagged items across every content source', () => {
    const expectedTotal = Object.values(expected).reduce((sum, labels) => sum + labels.length, 0)
    expect(reports).toHaveLength(expectedTotal)
  })

  it('has real signal to report — at least one placeholder exists', () => {
    expect(reports.length).toBeGreaterThan(0)
  })

  it('does not flag real, non-placeholder content', () => {
    expect(reports.some((r) => r.label === 'heycreator')).toBe(false)
  })
})
