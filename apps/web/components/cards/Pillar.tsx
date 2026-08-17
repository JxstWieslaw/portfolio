import { BulletList } from '@/components/ui/BulletList'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { GlassCard } from '@/components/ui/GlassCard'
import type { Tone } from '@/lib/accent'
import { cx } from '@/lib/cx'

/**
 * A How-I-Lead pillar card (design-home.md § 6, layout only).
 *
 * The export's *layout* is kept in full — `rgba(22,27,34,.80)`, 32px padding, a
 * distinct tinted `border-top` per card, a mono eyebrow, an `h3` at `wdth 100`
 * (the widest setting on the page, a deliberate contrast against the narrower
 * display headings) and a hanging-indent bullet list with a `▸` glyph.
 *
 * The export's *copy* is not: reconciliation § 1 reverses "Habit 01/02/03" back
 * to the spec's three leadership pillars. This component is copy-free — the
 * titles and practices arrive as props.
 *
 * Three tones, because the export tints three things independently: the top
 * border, the eyebrow and the bullet glyph. Card 3 is the case that needs all
 * three separated — `#22D3EE` border, `#67E8F9` eyebrow, `#22D3EE` glyph.
 */
export interface PillarProps {
  /** The mono micro-label, e.g. `Pillar 01`. */
  readonly eyebrow?: string
  readonly title: string
  /** Concrete practices, one per bullet. */
  readonly practices: readonly string[]
  /** Tints the `border-top` at 30% alpha. */
  readonly tone?: Tone
  /** Defaults to `tone`. */
  readonly eyebrowTone?: Tone
  /** The `▸` glyph colour. Defaults to `tone`. */
  readonly glyphTone?: Tone
  readonly className?: string
}

export function Pillar({
  eyebrow,
  title,
  practices,
  tone = 'violet',
  eyebrowTone,
  glyphTone,
  className,
}: PillarProps) {
  return (
    <GlassCard
      as="article"
      variant="pillar"
      tone={tone}
      className={cx('w-full', className)}
    >
      {eyebrow === undefined ? null : (
        <Eyebrow size="sm" as="p" tone={eyebrowTone ?? tone}>
          {eyebrow}
        </Eyebrow>
      )}
      <h3 className="type-h3 mt-4 mb-5">{title}</h3>
      <BulletList variant="accent" tone={glyphTone ?? tone} items={practices} />
    </GlassCard>
  )
}
