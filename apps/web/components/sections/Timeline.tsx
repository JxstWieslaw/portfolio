import { Section } from '@/components/layout/Section'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { TimelineItem, type TimelineEntry } from '@/components/cards/TimelineItem'
import type { Tone } from '@/lib/accent'

export type { TimelineEntry }

export interface TimelineProps {
  /** Authored order, newest first. Rendered exactly as passed. */
  readonly entries: readonly TimelineEntry[]
}

/**
 * The dot walks violet → fuchsia → cyan → emerald → iris down the rail
 * (design-home.md § 9). The placeholder entry overrides this with `line`.
 */
const DOT_TONES: readonly Tone[] = ['violet', 'fuchsia', 'cyan', 'emerald', 'iris']

function toneFor(entry: TimelineEntry, index: number): Tone {
  if (entry.placeholder === true) return 'line'
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
 * **No canvas.** Together with `#writing` this is the design's quiet zone
 * between the atmospheric sections, so the ground is flat `--bg-0`
 * (reconciliation § 5).
 *
 * The rail itself is the `<ol>`: a 1px left border, 32px of padding and a 48px
 * row gap. Every node hangs off that one border — there is no per-item line.
 */
export function Timeline({ entries }: TimelineProps) {
  return (
    <Section id="timeline" labelledBy="timeline-h" background="bg-0">
      <SectionHeader index="05" eyebrow="Experience" title="Experience" titleId="timeline-h" />

      <ol className="m-0 grid list-none gap-12 border-l border-[color:var(--line-1)] pl-6 md:pl-8">
        {entries.map((entry, index) => (
          <TimelineItem
            key={`${entry.org}-${entry.title}`}
            entry={entry}
            tone={toneFor(entry, index)}
          />
        ))}
      </ol>
    </Section>
  )
}
