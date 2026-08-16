import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '@/lib/cx'
import { PlaceholderText } from '@/components/ui/PlaceholderCard'

/**
 * Reconciliation § 6.4 — `KpiTile` needs a `variant`, and **neither variant
 * has the M0 plan's `border-l pl-4`**.
 *
 *  - `hero`  — a cell in a three-track `<dl>` sitting above a `--line-1`
 *              hairline. Value in Bricolage at `wdth 92`, 1.75rem at desktop.
 *  - `proof` — a cell *inside* the hairline grid, so it paints its own
 *              `rgba(17,22,29,.86)` ground. Value 2.25rem.
 *
 * Both render `<dt>`/`<dd>`, so both must sit inside a `<dl>`: `KpiGroup` for
 * the hero, `HairlineGrid as="dl"` for the proof strip.
 */
export type KpiVariant = 'hero' | 'proof'

export type KpiTileProps = {
  label: ReactNode
  value: ReactNode
  variant?: KpiVariant
  /**
   * Marks an unverified figure. Reconciliation § 1.1: a soft claim keeps the
   * placeholder treatment rather than being quietly presented as fact — the
   * DOM always says so, and the dotted underline shows outside production.
   */
  placeholder?: boolean
  className?: string
}

export function KpiTile({
  label,
  value,
  variant = 'hero',
  placeholder = false,
  className,
}: KpiTileProps) {
  const showUnresolvedRule = placeholder && process.env.NODE_ENV !== 'production'

  return (
    <div
      data-variant={variant}
      data-placeholder={placeholder ? 'true' : undefined}
      className={cx('kpi', className)}
    >
      <dt>{label}</dt>
      <dd>{showUnresolvedRule ? <PlaceholderText>{value}</PlaceholderText> : value}</dd>
    </div>
  )
}

/**
 * The hero's KPI row: `<dl>` at `repeat(3,1fr)` above a `border-top`
 * (design-home.md § 3). The § 3.3 matrix keeps three tracks at every width, so
 * the gap fluidly closes from 24px to 12px instead of the grid re-flowing.
 */
export function KpiGroup({
  children,
  className,
  ...rest
}: {
  children: ReactNode
  className?: string
} & Omit<HTMLAttributes<HTMLDListElement>, 'children' | 'className'>) {
  return (
    <dl {...rest} className={cx('kpi-group', className)}>
      {children}
    </dl>
  )
}
