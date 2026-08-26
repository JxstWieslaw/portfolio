import type { ReactNode } from 'react'

import { ProjectCard, type ProjectCardProps } from '@/components/cards/ProjectCard'
import { Section } from '@/components/layout/Section'
import { SectionBackdrop } from '@/components/three/SectionBackdrop'
import { Button } from '@/components/ui/Button'
import { Reveal } from '@/components/ui/Reveal'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { cx } from '@/lib/cx'

/**
 * Section 01 — Selected work, THE BENTO (design-home.md § 5).
 *
 * `repeat(6, 1fr)`, `gap:24px`, capped at **1600px** — the only block on the
 * page wider than 1440, and deliberately so.
 *
 * Seven cards with spans **3, 3, 4, 2, 2, 3, 3**, which auto-place into:
 *
 *   row 1  [ 3 ][ 3 ]
 *   row 2  [ 4 ][ 2 ]
 *   row 3  [ 2 ][ 3 ]          + 1 empty column
 *   row 4  [ 3 ]               + 3 empty columns
 *
 * The span-3 placeholder cannot fit the single column left at the end of row 3,
 * so it wraps. That ragged tail is the bento's character — do not rebalance the
 * spans to close it.
 *
 * Data comes in as props; this file never imports `lib/content.ts`.
 */

/** The per-project data the bento needs — the `Project` record plus its domain. */
export type SelectedWorkProject = Pick<
  ProjectCardProps,
  | 'slug'
  | 'name'
  | 'summary'
  | 'stack'
  | 'visibility'
  | 'domain'
  | 'href'
  | 'placeholder'
  | 'placeholderName'
  | 'ariaLabel'
  | 'media'
>

export interface SelectedWorkProps {
  /** In bento order. Anything past the seventh slot is not rendered. */
  readonly projects: readonly SelectedWorkProject[]
  readonly index?: string
  readonly eyebrow?: string
  readonly title?: string
  readonly lede?: ReactNode
  /** Label on the (disabled) index pill. */
  readonly allWorkLabel?: string
  /** The affordance announced in its place — § 9, `/work` is not built yet. */
  readonly comingSoonLabel?: string
}

/**
 * The bento span map, verbatim from design-home.md § 5 "THE GRID DEFINITION".
 *
 * Slot 3 (`span 4`) keeps the long CTA even though it is a standard-size card;
 * everything else takes the size default.
 */
export type BentoSpan = 2 | 3 | 4

interface BentoSlot {
  readonly span: BentoSpan
  readonly size: ProjectCardProps['size']
  readonly cta?: string
}

const BENTO_LAYOUT: readonly BentoSlot[] = [
  { span: 3, size: 'large' },
  { span: 3, size: 'large' },
  { span: 4, size: 'standard', cta: 'Read the case study' },
  { span: 2, size: 'standard' },
  { span: 2, size: 'standard' },
  { span: 3, size: 'standard' },
  { span: 3, size: 'standard' },
]

export const BENTO_SPANS: readonly BentoSpan[] = BENTO_LAYOUT.map((slot) => slot.span)

/**
 * Reconciliation § 3.3: `1fr` below 768 with every card spanning one track,
 * `repeat(2,1fr)` on tablet — still one track each — and the authored
 * `repeat(6,1fr)` with the real spans from 1024 up. The export has no width
 * media queries at all; at 390 a span-2 card computes to 103px.
 */
const SPAN_CLASS: Record<BentoSpan, string> = {
  2: 'lg:col-span-2',
  3: 'lg:col-span-3',
  4: 'lg:col-span-4',
}

/**
 * Deliberately does not name a domain count. The adjacent proof-strip KPI
 * derives one (`countDomainsShipped()`, excluding placeholder projects) — this
 * section takes its content as props and has no access to that derivation, so
 * a number hardcoded here would be a second, unrelated count on the same
 * screen, free to drift from the real one. It already had: the export's copy
 * said "Eight domains" while the KPI correctly said seven (`domains.json` has
 * eight entries, but one project's domain is still `placeholder`, so the
 * count of domains actually *shipped* is seven).
 */
const DEFAULT_LEDE =
  'One habit, across every domain: decide the architecture early, make every migration ' +
  'reversible, and leave the next engineer a system they can read.'

export function SelectedWork({
  projects,
  index = '01',
  eyebrow = 'Selected work',
  title = 'Selected work',
  lede = DEFAULT_LEDE,
  allWorkLabel = 'All work',
  comingSoonLabel = 'Coming soon',
}: SelectedWorkProps) {
  const slots = projects.slice(0, BENTO_LAYOUT.length)

  return (
    <Section
      id="work"
      formation="lattice"
      labelledBy="work-h"
      width="bento"
      backdrop={<SectionBackdrop formation="lattice" />}
    >
      <SectionHeader
        index={index}
        eyebrow={eyebrow}
        title={title}
        titleId="work-h"
        lede={lede}
        tone="violet"
        action={
          /**
           * `/work` is out of scope for this milestone (§ 9), so the pill is a
           * designed dead end rather than a 404 trap: `aria-disabled`, never
           * the `disabled` attribute, so it stays focusable, and the
           * `Coming soon` badge is real text inside the accessible name rather
           * than a visual-only cue.
           */
          <Button
            variant="unsupported"
            unsupportedLabel={comingSoonLabel}
            trailing="→"
            title="The full work index is not published yet"
          >
            {allWorkLabel}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-6">
        {slots.map((project, slot) => {
          const layout = BENTO_LAYOUT[slot]
          if (layout === undefined) return null

          return (
            /**
             * The reveal target is the grid item, so the `70ms * siblingIndex`
             * stagger walks the cards in DOM order (0 → 420ms across seven).
             * The wrapper carries the span and `display:flex`; the card fills
             * it, which keeps `min-height:340px` and the tag-row baseline
             * working exactly as they do on a bare grid item.
             */
            <Reveal
              key={project.slug}
              as="div"
              data-span={layout.span}
              className={cx('col-span-1 flex', SPAN_CLASS[layout.span])}
            >
              <ProjectCard {...project} size={layout.size} cta={layout.cta} />
            </Reveal>
          )
        })}
      </div>
    </Section>
  )
}
