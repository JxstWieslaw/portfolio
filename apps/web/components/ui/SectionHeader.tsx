import type { ReactNode } from 'react'
import { cx } from '@/lib/cx'
import type { Tone } from '@/lib/accent'
import { Eyebrow } from '@/components/ui/Eyebrow'

/**
 * The section header pattern (design-home.md § 5 "Header row"):
 *
 *   mono eyebrow `NN — Title` in the section accent
 *   Bricolage `h2` at `wdth 95`
 *   muted lede, capped at 68ch
 *   optional pill link on the right
 *
 * `align-items:flex-end` sits the pill on the h2/lede baseline and
 * `flex-wrap:wrap` drops it below when the row is cramped — which is the whole
 * mobile story for this component: no media query, the wrap does the work. The
 * 48px gap fluidly closes to 24px so the wrapped state is not airy.
 */
export type SectionHeaderProps = {
  /** The two-digit ordinal — `01`, `02`. Rendered as `01 — Selected work`. */
  index?: string
  eyebrow: string
  title: ReactNode
  /** Must match the owning `Section`'s `labelledBy`. */
  titleId: string
  lede?: ReactNode
  tone?: Tone
  /** The trailing pill link, e.g. `<Button href="/work">All work</Button>`. */
  action?: ReactNode
  /** `max-width:22ch` on the h2 is how the export forces its two-line break. */
  titleClassName?: string
  className?: string
}

export function SectionHeader({
  index,
  eyebrow,
  title,
  titleId,
  lede,
  tone = 'violet',
  action,
  titleClassName,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cx('section-head', className)}>
      <div className="section-head-title">
        <Eyebrow tone={tone} className="mb-4">
          {index === undefined ? eyebrow : `${index} — ${eyebrow}`}
        </Eyebrow>
        <h2 id={titleId} className={cx('type-h2', 'mb-4', titleClassName)}>
          {title}
        </h2>
        {lede === undefined ? null : <p className="section-head-lede">{lede}</p>}
      </div>
      {action}
    </div>
  )
}
