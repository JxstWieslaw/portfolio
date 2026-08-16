import type { CSSProperties } from 'react'
import { Section } from '@/components/layout/Section'
import { SectionBackdrop } from '@/components/three/SectionBackdrop'
import { Chip } from '@/components/ui/Chip'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { GlassCard } from '@/components/ui/GlassCard'
import { Reveal } from '@/components/ui/Reveal'
import { StackLegend } from '@/components/ui/StackLegend'
import type { Tone } from '@/lib/accent'

/**
 * Stack — the export's layout, the spec's content.
 *
 * **Reconciliation § 6.6 is the whole story of this section.** The export's
 * Home.dc.html ships a JVM engineer: Java, Kotlin, Spring Boot, Hibernate/JPA,
 * MongoDB, Azure, Nginx, JUnit, Mockito, Jira. That is part of the late
 * editorial pivot the owner rejected. What is kept is the *presentation* —
 * coloured mono group headings, three proficiency tiers, the Core/Working/
 * Familiar legend and the sticky "How I choose" aside — and the content comes
 * from `content/skills.json`, which is authored TypeScript-first.
 *
 * Nothing in this file names a technology. Every chip arrives as a prop, so the
 * section cannot drift from the content file and cannot be the place a rejected
 * stack sneaks back in.
 *
 * Layout (design-home.md § 8): outer `1fr 380px` at `gap: 64px` with
 * `align-items: start`; inner group grid `repeat(2, 1fr)` at `gap: 40px 48px`;
 * the eyebrow sits *outside* the two-column grid while the `h2` sits inside the
 * left column. The aside is the **only glass card without the lit top edge**,
 * which is what `GlassCard`'s `aside` variant encodes.
 */

/* ── Group accents ────────────────────────────────────────────────────────── */

/**
 * Six groups, six different accents (design-home.md § 8 "Full stack
 * inventory"). Keyed by the content file's group ids; an id this map does not
 * know falls back to the same six in order, so an added or renamed group still
 * gets a distinct heading colour rather than an unstyled one.
 */
const GROUP_TONES: Readonly<Record<string, Tone>> = {
  languages: 'iris',
  frontend: 'fuchsia',
  backend: 'cyan',
  cloud: 'emerald',
  'three-d': 'cyan-400',
  practice: 'amber',
}

const TONE_CYCLE: readonly Tone[] = ['iris', 'fuchsia', 'cyan', 'emerald', 'cyan-400', 'amber']

export function toneForGroup(id: string, index: number): Tone {
  return GROUP_TONES[id] ?? TONE_CYCLE[index % TONE_CYCLE.length] ?? 'violet'
}

/* ── Props ────────────────────────────────────────────────────────────────── */

/** Mirrors `SkillLevel` in `lib/content.ts`, which mirrors `@repo/contracts`. */
export type StackLevel = 'core' | 'working' | 'familiar'

export interface StackSkill {
  readonly name: string
  readonly level: StackLevel
}

export interface StackGroup {
  readonly id: string
  readonly label: string
  readonly items: readonly StackSkill[]
}

export interface StackNote {
  readonly title: string
  /** Rendered in order; the first is body-weight, the rest are muted. */
  readonly paragraphs: readonly string[]
}

export interface StackProps {
  /** The six skill groups, in the order they should appear. */
  readonly groups: readonly StackGroup[]
  readonly index?: string
  readonly eyebrow?: string
  readonly title?: string
  readonly note?: StackNote
}

/**
 * The aside copy, rewritten from the export under § 6.6.
 *
 * The export's version reads "Spring Boot on the JVM, PostgreSQL behind it" and
 * deviates to "MongoDB when the data is document-shaped". Both belong to the
 * rejected pivot. The shape of the argument — a default, then the conditions
 * under which it is abandoned, then "not because something is new" — is the
 * part worth keeping, and it is kept verbatim in structure.
 */
export const DEFAULT_STACK_NOTE: StackNote = {
  title: 'How I choose',
  paragraphs: [
    'Default stack: TypeScript end to end — Next.js on the front, Node behind it, Postgres or Firebase holding the state.',
    'I deviate when the problem asks for it — Firebase when realtime and auth matter more than SQL, Postgres when the data is relational and the queries are the product, Three.js and React Three Fiber when the interface should move. Not because something is new.',
  ],
}

/* ── Measured values ──────────────────────────────────────────────────────── */

/** design-home.md § 8 — the chip row is `flex-wrap` at a 6px gap. */
const CHIP_LIST: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  margin: 0,
  padding: 0,
  listStyle: 'none',
}

const NOTE_BODY: CSSProperties = {
  margin: 0,
  color: 'var(--fg-1)',
  fontSize: '0.9375rem',
  lineHeight: 1.6,
}

/** The lede is body-weight; everything after it steps back to muted. */
const NOTE_MUTED: CSSProperties = { ...NOTE_BODY, color: 'var(--fg-2)' }

function noteParagraphStyle(position: number, count: number): CSSProperties {
  return {
    ...(position === 0 ? NOTE_BODY : NOTE_MUTED),
    marginBottom: position === count - 1 ? 0 : 16,
  }
}

/* ── Section ──────────────────────────────────────────────────────────────── */

function SkillGroupBlock({ group, tone }: { group: StackGroup; tone: Tone }) {
  const headingId = `stack-group-${group.id}`

  return (
    <div data-group={group.id}>
      <Eyebrow as="h3" size="sm" tone={tone} id={headingId} className="mb-4">
        {group.label}
      </Eyebrow>
      {/* `role="list"` restores the semantics that `list-style: none` strips in
          Safari — the tier ladder is only legible as a list. */}
      <ul role="list" aria-labelledby={headingId} style={CHIP_LIST}>
        {group.items.map((item) => (
          <Chip key={item.name} as="li" variant="tier" tier={item.level}>
            {item.name}
          </Chip>
        ))}
      </ul>
    </div>
  )
}

export function Stack({
  groups,
  index = '04',
  eyebrow = 'Stack',
  title = 'What I reach for',
  note = DEFAULT_STACK_NOTE,
}: StackProps) {
  return (
    <Section
      id="stack"
      formation="grid"
      labelledBy="stack-h"
      backdrop={<SectionBackdrop formation="grid" />}
    >
      {/* The eyebrow sits outside the two-column grid; the h2 sits inside it. */}
      <Eyebrow tone="violet" className="mb-4">{`${index} — ${eyebrow}`}</Eyebrow>

      {/*
        § 3.3 — one column with the aside stacked below it up to 1023 (the
        `380px` track is fixed, not a fraction, so at 390 it computes the left
        column to −86px); `1fr 320px` at 1024, `1fr 380px` from 1280.
      */}
      <div className="grid items-start gap-12 lg:grid-cols-[1fr_320px] lg:gap-16 xl:grid-cols-[1fr_380px]">
        <div>
          <h2 id="stack-h" className="type-h2 mb-12">
            {title}
          </h2>

          {/* Groups: one column below 768, two from 768 — 40px row, 48px column. */}
          <div className="grid grid-cols-1 gap-y-10 md:grid-cols-2 md:gap-x-12">
            {groups.map((group, position) => (
              <SkillGroupBlock
                key={group.id}
                group={group}
                tone={toneForGroup(group.id, position)}
              />
            ))}
          </div>

          <StackLegend />
        </div>

        {/*
          Sticky only where there is a column for it to track. Below 1024 the
          aside is stacked under the groups, and a sticky element in normal flow
          there would pin itself over the section below.
        */}
        <Reveal as="aside" className="lg:sticky lg:top-[120px]">
          <GlassCard variant="aside">
            <h3 className="type-h3 mb-4">{note.title}</h3>
            {note.paragraphs.map((paragraph, position) => (
              <p key={paragraph} style={noteParagraphStyle(position, note.paragraphs.length)}>
                {paragraph}
              </p>
            ))}
          </GlassCard>
        </Reveal>
      </div>
    </Section>
  )
}
