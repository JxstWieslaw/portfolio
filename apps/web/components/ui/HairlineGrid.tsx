import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '@/lib/cx'

/**
 * Reconciliation § 6.5 — the hairline grid is a **primitive**, used three
 * times: proof tiles, the process rail and the contact channel list.
 *
 *   display: grid; gap: 1px;
 *   background: --line-1;
 *   border: 1px solid --line-1;
 *   border-radius: 12px;
 *   overflow: hidden;
 *
 * The `gap:1px` over a `--line-1` ground, clipped by `overflow:hidden`, *is*
 * the divider. Cells carry zero borders — they only paint their own opaque
 * ground and the 1px of grid ground shows through between them.
 *
 * Responsive: the column count is the only thing that changes, which is
 * exactly what § 3.2 permits a media query to do. One column collapses the
 * vertical hairlines into horizontal rules with no extra rules at all.
 */
export type HairlineCols = 1 | 2 | 3 | 4 | 5

const BASE_COLS: Record<HairlineCols, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
}

const MD_COLS: Record<HairlineCols, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  5: 'md:grid-cols-5',
}

const LG_COLS: Record<HairlineCols, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
}

export type HairlineGridProps = {
  children: ReactNode
  /** Tracks below 768. Never more than two — § 3.2 principle 2. */
  cols?: HairlineCols
  /** Tracks from 768. */
  colsMd?: HairlineCols
  /** Tracks from 1024. */
  colsLg?: HairlineCols
  as?: 'div' | 'dl' | 'ol' | 'ul'
  className?: string
} & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'>

export function HairlineGrid({
  children,
  cols = 1,
  colsMd,
  colsLg,
  as = 'div',
  className,
  ...rest
}: HairlineGridProps) {
  const Tag = as as 'div'
  return (
    <Tag
      {...rest}
      data-cols={cols}
      data-cols-md={colsMd}
      data-cols-lg={colsLg}
      className={cx(
        'hairline',
        BASE_COLS[cols],
        colsMd !== undefined && MD_COLS[colsMd],
        colsLg !== undefined && LG_COLS[colsLg],
        className
      )}
    >
      {children}
    </Tag>
  )
}

export type HairlineCellProps = {
  children: ReactNode
  /** `rail` is the process rail's 0.88 ground; the default is 0.86. */
  tone?: 'default' | 'rail'
  /** Contact channel rows: hover and focus-within lift the ground. */
  interactive?: boolean
  as?: 'div' | 'li'
  href?: string
  target?: string
  rel?: string
  className?: string
} & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'>

export function HairlineCell({
  children,
  tone = 'default',
  interactive = false,
  as = 'div',
  href,
  target,
  rel,
  className,
  ...rest
}: HairlineCellProps) {
  const attributes = {
    ...rest,
    'data-tone': tone,
    'data-interactive': interactive ? 'true' : undefined,
    className: cx('hairline-cell', className),
  }

  if (href !== undefined) {
    return (
      <a {...attributes} href={href} target={target} rel={rel}>
        {children}
      </a>
    )
  }

  const Tag = as as 'div'
  return <Tag {...attributes}>{children}</Tag>
}
