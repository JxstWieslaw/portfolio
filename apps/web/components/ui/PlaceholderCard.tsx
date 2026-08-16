import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '@/lib/cx'

/**
 * The placeholder convention, invented by the export and adopted for every
 * unresolved slot on the page (reconciliation § 6.7):
 *
 *   `1px dashed --line-2` container
 * + `1px dotted --line-2` underline on unresolved strings
 * + `--fg-2` text
 *
 * Nothing here fabricates content — it *shows* that content is missing. The
 * testimonial block is the one exception that hides entirely rather than
 * rendering a placeholder, because a fabricated quote is a lie rather than a
 * gap.
 */
export type PlaceholderCardProps = {
  children: ReactNode
  as?: 'div' | 'article' | 'figure' | 'li' | 'aside'
  className?: string
} & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'>

export function PlaceholderCard({
  children,
  as = 'div',
  className,
  ...rest
}: PlaceholderCardProps) {
  const Tag = as as 'div'
  return (
    <Tag {...rest} data-placeholder="true" className={cx('placeholder-card', className)}>
      {children}
    </Tag>
  )
}

/**
 * An unresolved string: muted, with the dotted underline. Wraps bracketed copy
 * (`[AR project name]`) and any value pulled at runtime that has not arrived.
 */
export type PlaceholderTextProps = {
  children: ReactNode
  as?: 'span' | 'h3' | 'p' | 'strong' | 'time'
  className?: string
} & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'>

export function PlaceholderText({
  children,
  as = 'span',
  className,
  ...rest
}: PlaceholderTextProps) {
  const Tag = as as 'span'
  return (
    <Tag {...rest} data-placeholder="true" className={cx('placeholder-text', className)}>
      {children}
    </Tag>
  )
}

/**
 * An empty dashed chip outline — the AR card's three skeleton tags
 * (§ 6.10). Decorative: it carries no text, so it is hidden from the
 * accessibility tree rather than announced as an empty element.
 */
export function PlaceholderGhost({ width = 72 }: { width?: number }) {
  return (
    <span aria-hidden="true" className="placeholder-ghost" style={{ width: `${width}px` }} />
  )
}
