import type { CSSProperties } from 'react'
import { BulletList } from '@/components/ui/BulletList'
import { Reveal } from '@/components/ui/Reveal'
import { type Tone, toneVar } from '@/lib/accent'
import { formatPeriod, type Period } from '@/lib/format-period'

/**
 * One role row, as `content/experience.json` stores it.
 *
 * Shape mirrors `Experience` in `lib/content.ts` / `@repo/contracts`, declared
 * locally so the section stays prop-driven and this file never reaches for
 * content itself.
 */
export interface TimelineEntry {
  readonly org: string
  readonly title: string
  readonly period: Period
  readonly location?: string
  readonly highlights: readonly string[]
  /** Reconciliation § 1: the "Earlier engineering roles" aggregate. */
  readonly placeholder?: boolean
}

/** One company on the rail: its rows grouped by `org`, newest role first. */
export interface TimelineCompany {
  readonly org: string
  readonly location?: string
  readonly placeholder: boolean
  readonly roles: TimelineEntry[]
}

export interface TimelineItemProps {
  readonly company: TimelineCompany
  /**
   * The node's tint. `Timeline` walks violet → fuchsia → cyan → emerald down
   * the rail and forces `line` on the placeholder entry.
   */
  readonly tone: Tone
}

/**
 * The node marker sits **outside** the rail's padding box: `left:-38px` is
 * 32px of padding + the 1px border + 5px to centre a 12px dot on the line. At
 * mobile the rail closes to 24px of padding, so the dot moves to `-30px`
 * (reconciliation § 3.3, "Timeline").
 *
 * The glow is `0 0 24px` at 30% of the dot's own tint. The placeholder entry
 * gets **no glow at all** — the design has the rail fade into the past, and
 * that missing shadow is the whole of the effect (design-home.md § 9).
 */
function dotStyle(tone: Tone, placeholder: boolean): CSSProperties {
  const tint = toneVar(tone)
  const base: CSSProperties = { background: 'var(--bg-0)', borderColor: tint }

  return placeholder
    ? base
    : { ...base, boxShadow: `0 0 24px color-mix(in srgb, ${tint} 30%, transparent)` }
}

interface RungProps {
  readonly role: TimelineEntry
  /** The role this one led to, when there is one. */
  readonly next: TimelineEntry | undefined
  readonly tone: Tone
  readonly placeholder: boolean
}

/**
 * One rung of a company's role ladder.
 *
 * `1fr 200px` with the period right-aligned from 768 up; one column below it,
 * where explicit row/column placement is dropped and the period — DOM first —
 * reads above the title as a mono label. One node, both layouts: the period is
 * never duplicated and never read twice.
 *
 * The progression reads from the periods (text) and the order, newest first,
 * so it never depends on the rail's dots or their colour. The current rung's
 * dot is filled; earlier rungs are hollow.
 */
function Rung({ role, next, tone, placeholder }: RungProps) {
  const current = next === undefined
  const tint = placeholder ? 'var(--line-2)' : toneVar(tone)

  return (
    <li className="relative" data-rung={current ? 'current' : 'earlier'}>
      <span
        aria-hidden="true"
        className="absolute top-[7px] -left-[25px] h-2 w-2 rounded-full border-2"
        style={{ background: current ? tint : 'var(--bg-0)', borderColor: tint }}
      />

      <div className="grid grid-cols-1 items-baseline gap-2 md:grid-cols-[1fr_200px] md:gap-8">
        <span className="font-[family-name:var(--font-mono)] text-[length:0.75rem] tracking-[0.08em] text-[color:var(--fg-2)] md:col-start-2 md:row-start-1 md:text-right">
          {formatPeriod(role.period)}
        </span>

        <div className="md:col-start-1 md:row-start-1">
          <h4
            style={{ color: placeholder ? 'var(--fg-2)' : toneVar(tone) }}
            className="m-0 text-[length:0.9375rem] leading-[1.4] font-medium"
          >
            {role.title}
          </h4>
          <BulletList variant="timeline" className="mt-3" items={role.highlights} />
        </div>
      </div>
    </li>
  )
}

/**
 * One company on the Experience rail (design-home.md § 9): the org once, with
 * its location, then a nested list of roles — newest first — down a thinner
 * inner rail. Headings stay in order: `h3` for the company, `h4` per role.
 */
export function TimelineItem({ company, tone }: TimelineItemProps) {
  const { placeholder, roles } = company

  return (
    <Reveal as="li" className="relative">
      <span
        aria-hidden="true"
        data-dot={placeholder ? 'muted' : 'lit'}
        data-tone={tone}
        style={dotStyle(tone, placeholder)}
        className="absolute top-2 -left-[30px] h-3 w-3 rounded-full border-2 md:-left-[38px]"
      />

      <div data-placeholder={placeholder ? 'true' : undefined}>
        {/* wdth 96 — the rail's own axis value, shared with the standard bento h3. */}
        <h3 className="type-bento-standard mb-1 text-2xl leading-[1.2]">{company.org}</h3>
        {company.location === undefined ? null : (
          <p className="mt-0 mb-0 text-[length:0.9375rem] text-[color:var(--fg-2)]">
            {company.location}
          </p>
        )}

        <ol
          aria-label={`Roles at ${company.org}`}
          className="m-0 mt-5 grid list-none gap-8 border-l border-[color:var(--line-2)] pl-5"
        >
          {roles.map((role, index) => (
            <Rung
              key={`${role.title}-${role.period.from}`}
              role={role}
              next={index === 0 ? undefined : roles[index - 1]}
              tone={tone}
              placeholder={placeholder}
            />
          ))}
        </ol>
      </div>
    </Reveal>
  )
}
