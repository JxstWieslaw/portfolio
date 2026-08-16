import type { CSSProperties } from 'react'
import { BulletList } from '@/components/ui/BulletList'
import { Reveal } from '@/components/ui/Reveal'
import { type Tone, toneVar } from '@/lib/accent'
import { formatPeriod, type Period } from '@/lib/format-period'

/**
 * One entry on the Experience rail (design-home.md § 9).
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

export interface TimelineItemProps {
  readonly entry: TimelineEntry
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

export function TimelineItem({ entry, tone }: TimelineItemProps) {
  const placeholder = entry.placeholder === true
  const role =
    entry.location === undefined ? entry.title : `${entry.title} · ${entry.location}`

  return (
    <Reveal as="li" className="relative">
      <span
        aria-hidden="true"
        data-dot={placeholder ? 'muted' : 'lit'}
        data-tone={tone}
        style={dotStyle(tone, placeholder)}
        className="absolute top-2 -left-[30px] h-3 w-3 rounded-full border-2 md:-left-[38px]"
      />

      {/*
        `1fr 200px` with the period right-aligned from 768 up; one column below
        it, where explicit row/column placement is dropped and the period — DOM
        first — reads above the title as a mono label. One node, both layouts:
        the period is never duplicated and never read twice.
      */}
      <div
        data-placeholder={placeholder ? 'true' : undefined}
        className="grid grid-cols-1 items-baseline gap-2 md:grid-cols-[1fr_200px] md:gap-8"
      >
        <span className="font-[family-name:var(--font-mono)] text-[length:0.75rem] tracking-[0.08em] text-[color:var(--fg-2)] md:col-start-2 md:row-start-1 md:text-right">
          {formatPeriod(entry.period)}
        </span>

        <div className="md:col-start-1 md:row-start-1">
          {/* wdth 96 — the rail's own axis value, shared with the standard bento h3. */}
          <h3 className="type-bento-standard mb-1 text-2xl leading-[1.2]">{entry.org}</h3>
          <p
            style={{ color: placeholder ? 'var(--fg-2)' : toneVar(tone) }}
            className="mt-0 mb-4 text-[length:0.9375rem]"
          >
            {role}
          </p>
          <BulletList variant="timeline" items={entry.highlights} />
        </div>
      </div>
    </Reveal>
  )
}
