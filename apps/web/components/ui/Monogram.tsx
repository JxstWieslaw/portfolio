import type { HTMLAttributes } from 'react'
import { cx } from '@/lib/cx'

/**
 * Reconciliation § 6.3 — an **outlined box, not a gradient tile**: 44px,
 * `1px solid --line-2`, `12px` radius, Bricolage at `wdth 90`, hover
 * `border-color: --violet-400`.
 *
 * The M0 plan's gradient monogram would have been a fourth placement of
 * `--gradient`, and § 2 fixes the count at three (canvas, hero display clip,
 * primary-CTA hover). A fourth use is a bug, so this is a border.
 *
 * Two sizes: `nav` (44px, interactive, the header home link) and `footer`
 * (40px, static and decorative — the footer already links home elsewhere).
 */
export type MonogramSize = 'nav' | 'footer'

export type MonogramProps = {
  /** Full name; initials are derived from it. */
  name?: string
  /** Explicit initials, when derivation would be wrong. */
  initials?: string
  size?: MonogramSize
  /** Present ⇒ interactive `<a>`; absent ⇒ decorative, `aria-hidden` mark. */
  href?: string
  /** Accessible name for the interactive variant. */
  label?: string
  className?: string
} & Omit<HTMLAttributes<HTMLElement>, 'className'>

/** First letters of the first two words: "Wieslaw Samushonga" → "WS". */
export function deriveInitials(name: string): string {
  return name
    .split(/\s+/u)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => (part[0] ?? '').toUpperCase())
    .join('')
}

export function Monogram({
  name = 'Wieslaw Samushonga',
  initials,
  size = 'nav',
  href,
  label,
  className,
  ...rest
}: MonogramProps) {
  const mark = initials ?? deriveInitials(name)

  if (href !== undefined) {
    return (
      <a
        {...rest}
        href={href}
        aria-label={label ?? `${name} — home`}
        data-size={size}
        data-interactive="true"
        className={cx('monogram', className)}
      >
        {mark}
      </a>
    )
  }

  return (
    <span
      {...rest}
      aria-hidden="true"
      data-size={size}
      data-interactive="false"
      className={cx('monogram', className)}
    >
      {mark}
    </span>
  )
}
