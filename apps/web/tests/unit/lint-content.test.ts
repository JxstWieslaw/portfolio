import { describe, expect, it } from 'vitest'

import { listPlaceholders } from '@/lib/content'

/**
 * `scripts/lint-content.ts` is a thin formatter over `listPlaceholders()` — it groups the
 * list by `kind` and prints it, nothing more. So the behaviour worth testing is
 * `listPlaceholders()` itself: does it report every item the content actually flags, and
 * nothing it doesn't.
 *
 * The expected list is enumerated literally rather than re-derived by re-running
 * `.filter(x => x.placeholder)` over the same getters the implementation reads. That
 * used to be this test's shape, and it was structurally blind to a fifth source: it
 * verified the four sources `listPlaceholders()` already checks against themselves, so
 * it could not fail when a real placeholder (`profile.emailPlaceholder`) was missing
 * from the implementation entirely — there was no fifth entry in `expected` for it to
 * disagree with. A literal list has no such blind spot: adding a new placeholder source
 * to content without reporting it here changes nothing about `expected`, so the totals
 * and membership assertions below fail immediately.
 *
 * Keep this list in sync with `content/*.json` by hand. That hand-maintenance is the
 * point — it is what makes the test able to notice a reporting gap instead of mirroring
 * one.
 *
 * The contact address has since been confirmed real, so `profile.emailPlaceholder` is no
 * longer set and the profile branch of `listPlaceholders()` is dormant. The branch stays:
 * it is the mechanism, not a one-off, and it fires again the moment any address is marked
 * provisional.
 */
describe('listPlaceholders (the data lint:content reports)', () => {
  const reports = listPlaceholders()

  const expected = [
    { kind: 'kpi', label: 'Production platforms led/shipped' },
    { kind: 'kpi', label: 'Concurrent production systems monitored' },
    { kind: 'project', label: 'AR Product Visualiser' },
    { kind: 'project', label: 'youth-care' },
    { kind: 'project', label: 'angelo-crown' },
    { kind: 'experience', label: 'Earlier engineering roles' },
    { kind: 'writing', label: 'Reversible data migrations: dry-run, apply, rollback' },
    { kind: 'writing', label: 'One draw call: holding 60 fps on a mid-range phone' },
  ] as const

  function sortedByKindAndLabel(items: readonly { kind: string; label: string }[]) {
    return [...items].sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label))
  }

  it('reports exactly the flagged items, nothing more, nothing less', () => {
    expect(sortedByKindAndLabel(reports)).toEqual(sortedByKindAndLabel(expected))
  })

  it('totals exactly the number of items enumerated above', () => {
    expect(reports).toHaveLength(expected.length)
  })

  it('has real signal to report — at least one placeholder exists', () => {
    expect(reports.length).toBeGreaterThan(0)
  })

  it('does not flag real, non-placeholder content', () => {
    expect(reports.some((r) => r.label === 'heycreator')).toBe(false)
  })
})
