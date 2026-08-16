import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '@/lib/cx'

/**
 * The work-card technology tag: JetBrains Mono at 11px, `--fg-2` on a
 * `1px solid --line-1` outline, `4px 9px`, `6px` radius (design-home.md § 5).
 *
 * Distinct from `Chip`: a `TechTag` is smaller, dimmer and never tinted — it
 * is metadata *inside* a card, not a category label.
 */
export type TechTagProps = {
  children: ReactNode
  as?: 'li' | 'span'
  className?: string
} & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'>

export function TechTag({ children, as = 'li', className, ...rest }: TechTagProps) {
  const Tag = as as 'li'
  return (
    <Tag {...rest} className={cx('tech-tag', className)}>
      {children}
    </Tag>
  )
}

/**
 * The row a card's tags sit in. Its `margin: auto 0 24px` is load-bearing:
 * reconciliation § 6.9 — the `auto` is the flex spacer that pins tag rows to a
 * common baseline across cards of different heights. Do not remove it.
 */
export type TechTagListProps = {
  children: ReactNode
  className?: string
} & Omit<HTMLAttributes<HTMLUListElement>, 'children' | 'className'>

export function TechTagList({ children, className, ...rest }: TechTagListProps) {
  return (
    <ul {...rest} className={cx('tech-tag-list', className)}>
      {children}
    </ul>
  )
}
