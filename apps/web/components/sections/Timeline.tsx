import { Section } from '@/components/layout/Section'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { TimelineItem, type TimelineCompany, type TimelineEntry } from '@/components/cards/TimelineItem'
import type { Tone } from '@/lib/accent'

export type { TimelineCompany, TimelineEntry }

export interface TimelineProps {
  /**
   * One row per role, newest first — `content/experience.json` as the contract
   * stores it. Rows are grouped by `org` at render time; the content and the
   * API keep one title per row.
   */
  readonly entries: readonly TimelineEntry[]
}

/**
 * Groups the flat role rows into one company per `org`, in first-appearance
 * order. The input is newest first, so the company order follows the newest
 * role at each company and the roles inside a company stay newest first.
 *
 * `location` and `placeholder` are taken from the first row of the group: the
 * content authors both per company, and the aggregate placeholder is one row.
 */
export function groupByOrg(entries: readonly TimelineEntry[]): TimelineCompany[] {
  const companies: TimelineCompany[] = []

  for (const entry of entries) {
    const existing = companies.find((company) => company.org === entry.org)
    if (existing === undefined) {
      companies.push({
        org: entry.org,
        location: entry.location,
        placeholder: entry.placeholder === true,
        roles: [entry],
      })
    } else {
      existing.roles.push(entry)
    }
  }

  return companies
}

/**
 * The dot walks violet → fuchsia → cyan → emerald → iris down the rail
 * (design-home.md § 9). The placeholder entry overrides this with `line`.
 */
const DOT_TONES: readonly Tone[] = ['violet', 'fuchsia', 'cyan', 'emerald', 'iris']

function toneFor(company: TimelineCompany, index: number): Tone {
  if (company.placeholder) return 'line'
  return DOT_TONES[index % DOT_TONES.length] ?? 'violet'
}

/**
 * Experience — reconciliation § 1 / OD-3.
 *
 * The section id is **`#timeline`** with the heading `Experience`; the export's
 * `#experience` / "Where I've done it" was rejected along with its five-entry
 * employment history (Ikarus 3D, Virtualize Technologies, Baeldung.com). The
 * roster is the spec's: Data Age, Rapidev Labs, and one aggregate placeholder.
 *
 * Each company appears once and carries a role ladder underneath — the owner
 * started as a Senior Software Engineer at both companies and moved up, and
 * the rail has to show that rather than list four unrelated rows.
 *
 * **No canvas.** Together with `#writing` this is the design's quiet zone
 * between the atmospheric sections, so the ground is flat `--bg-0`
 * (reconciliation § 5).
 *
 * The rail itself is the `<ol>`: a 1px left border, 32px of padding and a 48px
 * row gap. Every company hangs off that one border — there is no per-item line.
 */
export function Timeline({ entries }: TimelineProps) {
  const companies = groupByOrg(entries)

  return (
    <Section id="timeline" labelledBy="timeline-h" background="bg-0">
      <SectionHeader index="05" eyebrow="Experience" title="Experience" titleId="timeline-h" />

      <ol className="m-0 grid list-none gap-12 border-l border-[color:var(--line-1)] pl-6 md:pl-8">
        {companies.map((company, index) => (
          <TimelineItem key={company.org} company={company} tone={toneFor(company, index)} />
        ))}
      </ol>
    </Section>
  )
}
