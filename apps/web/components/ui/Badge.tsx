import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '@/lib/cx'

/**
 * Status badges — the right-hand chip on a work card.
 *
 * Reconciliation § 6.11 adds the fourth state: `In preparation` in
 * `--warning` #D29922, the treatment for announced-but-unshipped work. The
 * other three carry the neutral `--line-2` chrome.
 */
export type BadgeStatus = 'public' | 'client' | 'private' | 'in-preparation'

const BADGE_LABELS: Record<BadgeStatus, string> = {
  public: 'Public',
  client: 'Client codebase',
  private: 'Private',
  'in-preparation': 'In preparation',
}

export type BadgeProps = {
  status: BadgeStatus
  /** Overrides the canonical label. Use sparingly — the four labels are copy. */
  children?: ReactNode
  as?: 'span' | 'li' | 'div'
  className?: string
} & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'>

export function Badge({ status, children, as = 'span', className, ...rest }: BadgeProps) {
  const Tag = as as 'span'
  return (
    <Tag {...rest} data-status={status} className={cx('badge', className)}>
      {children ?? BADGE_LABELS[status]}
    </Tag>
  )
}

export { BADGE_LABELS }
