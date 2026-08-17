import type { ReactNode } from 'react'

import { Pillar, type PillarProps } from '@/components/cards/Pillar'
import { Section } from '@/components/layout/Section'
import { SectionBackdrop } from '@/components/three/SectionBackdrop'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { GlassCard } from '@/components/ui/GlassCard'
import { HairlineCell, HairlineGrid } from '@/components/ui/HairlineGrid'
import { Reveal } from '@/components/ui/Reveal'
import { SectionHeader } from '@/components/ui/SectionHeader'
import type { Tone } from '@/lib/accent'

/**
 * Section 02 — **How I Lead** (`#lead`).
 *
 * Reconciliation § 0 in one section: the export's layout is kept whole and its
 * copy is reversed. The export retitled this block "How I work", led with
 * "Tested, typed, and shipped with a rollback plan." and framed the three cards
 * as Habit 01/02/03 — part of an editorial pivot from Tech Lead to hands-on
 * engineer that the owner has confirmed is not to be built (§ 1). What ships is
 * the spec's three leadership **pillars** inside the export's measurements.
 *
 * Violet-led, per the semantic rule: violet is leadership and architecture.
 * Backdrop formation is `orbit`.
 *
 * Three sub-layouts, all of which the export leaves un-breakpointed and § 3.3
 * fixes here:
 *   pillars       1fr ≤767 · repeat(3,1fr) ≥768 (24px padding, 32px from 1024)
 *   process rail  1fr stacked ≤767 (the hairline becomes horizontal rules with
 *                 no extra CSS) · repeat(5,1fr) ≥768
 *   testimonial   single column with the portrait above ≤767 · `1fr auto` ≥768
 */

export interface ProcessStep {
  readonly title: string
  readonly body: string
}

/** A real, attributable quote. There is no placeholder form — see § 6.7. */
export interface TestimonialQuote {
  readonly quote: string
  readonly author: string
  /** `Role, Company`. */
  readonly role: string
}

export interface HowILeadProps {
  readonly index?: string
  readonly eyebrow?: string
  readonly title?: string
  readonly lede?: ReactNode
  readonly pillars?: readonly PillarProps[]
  readonly processTitle?: string
  readonly process?: readonly ProcessStep[]
  /** Omit it and the whole block is absent from the DOM. */
  readonly testimonial?: TestimonialQuote
}

/**
 * The reconciled pillars — spec § 5.5, restored over the export's habits.
 *
 * Titles are fixed copy (§ 1: `Technical direction` · `Code review & standards`
 * · `Mentorship & delivery`); the practices are the spec's parentheticals
 * written out as concrete sentences. Tints are the export's, verbatim.
 */
export const LEAD_PILLARS: readonly PillarProps[] = [
  {
    eyebrow: 'Pillar 01',
    title: 'Technical direction',
    tone: 'violet',
    eyebrowTone: 'violet',
    glyphTone: 'violet-500',
    practices: [
      'Architecture standards decided early and written down, not discovered in review.',
      'Migrations reversible by design — dry-run, apply, rollback — so no release is a one-way door.',
      'Honest error handling: failures surface with context instead of being swallowed.',
    ],
  },
  {
    eyebrow: 'Pillar 02',
    title: 'Code review & standards',
    tone: 'fuchsia',
    eyebrowTone: 'fuchsia',
    glyphTone: 'fuchsia-400',
    practices: [
      'Typed backends — the contract lives in the code, not in a document nobody opens.',
      'Security rules enforced at the boundary rather than assumed by the caller.',
      'Conventional commits and staged builds, so history and releases both stay readable.',
    ],
  },
  {
    eyebrow: 'Pillar 03',
    title: 'Mentorship & delivery',
    tone: 'cyan-400',
    eyebrowTone: 'cyan',
    glyphTone: 'cyan-400',
    practices: [
      'Engineers grow through review — it is the default unit of work, not a gate at the end.',
      "Accountable for how it's built, not just that it ships.",
      'Handover documentation written while the context is still fresh.',
    ],
  },
]

/** Retained export copy — § 1 changes nothing in the process rail. */
export const LEAD_PROCESS: readonly ProcessStep[] = [
  { title: 'Discovery', body: 'Constraints, users, and the one thing that must not break.' },
  {
    title: 'Architecture',
    body: 'Data model, boundaries, migration strategy. Written before code.',
  },
  {
    title: 'Delivery cadence',
    body: 'Staged builds, weekly demo, review as the default unit of work.',
  },
  { title: 'Launch', body: 'Rollback rehearsed, logging in place, on-call agreed.' },
  { title: 'Operate', body: 'Monitored, measured, and handed over so it outlives me.' },
]

/** The step numbers walk violet → cyan, mirroring the canvas gradient. */
const STEP_TONES: readonly Tone[] = ['violet', 'iris', 'violet', 'cyan', 'cyan-400']

/**
 * The testimonial block — reconciliation § 6.7 and a Global Constraint.
 *
 * The export ships a dashed placeholder here. It is the one unresolved slot on
 * the page that does **not** take the placeholder treatment: a missing
 * testimonial is not a gap to advertise, and a fabricated one is not acceptable
 * on a resume site. With no quote, this renders nothing at all — no figure, no
 * heading, no reserved space. A blank or whitespace-only quote counts as none.
 */
export function Testimonial({ testimonial }: { testimonial?: TestimonialQuote }) {
  if (testimonial === undefined) return null
  if (testimonial.quote.trim() === '') return null

  const initials = testimonial.author
    .split(/\s+/)
    .map((word) => word.slice(0, 1))
    .filter((letter) => letter !== '')
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <Reveal as="div">
      <GlassCard
        as="figure"
        padded={false}
        className="m-0 grid grid-cols-1 items-center gap-8 p-8 md:grid-cols-[1fr_auto] md:gap-12 md:p-12"
      >
        <div className="order-2 md:order-1">
          <blockquote
            className="m-0 max-w-[44ch]"
            style={{
              fontFamily: 'var(--font-display)',
              fontVariationSettings: "'wdth' 95",
              /* The only Bricolage medium weight on the page. */
              fontWeight: 500,
              fontSize: '1.5rem',
              lineHeight: 1.35,
              color: 'var(--fg-0)',
            }}
          >
            {testimonial.quote}
          </blockquote>
          <figcaption
            className="mt-4"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--label)',
              color: 'var(--fg-2)',
            }}
          >
            {testimonial.author} · {testimonial.role}
          </figcaption>
        </div>
        <div
          aria-hidden="true"
          className="order-1 flex h-[88px] w-[88px] flex-none items-center justify-center rounded-full md:order-2"
          style={{
            border: '1px solid var(--line-2)',
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            color: 'var(--fg-2)',
          }}
        >
          {initials}
        </div>
      </GlassCard>
    </Reveal>
  )
}

export function HowILead({
  index = '02',
  eyebrow = 'How I Lead',
  title = "Accountable for how it's built, not just that it shipped.",
  lede = 'Three pillars that follow me into every codebase.',
  pillars = LEAD_PILLARS,
  processTitle = 'How I run a project',
  process = LEAD_PROCESS,
  testimonial,
}: HowILeadProps) {
  return (
    <Section
      id="lead"
      formation="orbit"
      labelledBy="lead-h"
      backdrop={<SectionBackdrop formation="orbit" />}
    >
      <SectionHeader
        index={index}
        eyebrow={eyebrow}
        title={title}
        titleId="lead-h"
        lede={lede}
        tone="violet"
        /* `max-width:22ch` is how the export forces the two-line break. */
        titleClassName="max-w-[22ch]"
      />

      <div className="mb-16 grid grid-cols-1 gap-6 md:grid-cols-3">
        {pillars.map((pillar) => (
          <Reveal key={pillar.title} as="div" className="flex">
            <Pillar {...pillar} />
          </Reveal>
        ))}
      </div>

      <Reveal as="div" className="mb-16">
        <Eyebrow as="h3" tone="muted" className="mb-6">
          {processTitle}
        </Eyebrow>
        {/* The same hairline primitive as the proof strip, at five tracks.
            One column below 768 turns the vertical hairlines into horizontal
            rules with no extra CSS at all. */}
        <HairlineGrid as="ol" cols={1} colsMd={5}>
          {process.map((step, position) => (
            <HairlineCell key={step.title} as="li" tone="rail">
              <Eyebrow size="sm" as="div" tone={STEP_TONES[position] ?? 'muted'} className="mb-3">
                {String(position + 1).padStart(2, '0')}
              </Eyebrow>
              <div
                className="type-h3 mb-2"
                style={{ fontSize: '1.0625rem', color: 'var(--fg-0)' }}
              >
                {step.title}
              </div>
              <p className="m-0 text-sm leading-[1.55]" style={{ color: 'var(--fg-2)' }}>
                {step.body}
              </p>
            </HairlineCell>
          ))}
        </HairlineGrid>
      </Reveal>

      <Testimonial testimonial={testimonial} />
    </Section>
  )
}
