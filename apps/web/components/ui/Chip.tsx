import type { HTMLAttributes, MouseEventHandler, ReactNode } from 'react'
import { cx } from '@/lib/cx'
import { type Tone, toneStyle } from '@/lib/accent'

/**
 * Reconciliation § 6.2 — every chip is JetBrains Mono on a tinted ground at
 * 8–10% alpha with a `6px` radius. The M0 plan's body-font, border-only chip
 * is wrong.
 *
 * Three variants:
 *  - `domain` — tinted by the domain's brand accent (`lib/accent.ts`).
 *  - `tier`   — the Stack's Core / Working / Familiar ladder, plus the
 *               cyan-highlight tier used only by "3D & creative".
 *  - `filter` — the only interactive chip, so the only one that carries the
 *               44px tap target.
 */
export type ChipVariant = 'domain' | 'tier' | 'filter'

export type ChipTier = 'core' | 'working' | 'familiar'

/**
 * `sm` = 11px uppercase at `5px 10px` (the in-card domain badge).
 * `md` = 12px at `6px 11px` (§ 6.2's canonical chip — the Stack tiers).
 * `lg` = 12px at `7px 12px` (the proof-strip domain row).
 */
export type ChipSize = 'sm' | 'md' | 'lg'

type ChipOwnProps = {
  children: ReactNode
  variant?: ChipVariant
  size?: ChipSize
  /** Brand tint for the `domain` variant. */
  tone?: Tone
  /** Proficiency for the `tier` variant. */
  tier?: ChipTier
  /** The cyan-highlight tier. Only "3D & creative" uses it. */
  highlight?: boolean
  /** Selected state for the `filter` variant; drives `aria-pressed`. */
  selected?: boolean
  onClick?: MouseEventHandler<HTMLElement>
  as?: 'span' | 'li' | 'div'
  className?: string
}

export type ChipProps = ChipOwnProps &
  Omit<HTMLAttributes<HTMLElement>, 'children' | 'className' | 'onClick'>

export function Chip({
  children,
  variant = 'tier',
  size = 'md',
  tone,
  tier = 'working',
  highlight = false,
  selected,
  onClick,
  as = 'span',
  className,
  ...rest
}: ChipProps) {
  const style = variant === 'domain' ? toneStyle('--chip-tint', tone) : undefined

  if (variant === 'filter') {
    return (
      <button
        {...rest}
        type="button"
        onClick={onClick}
        aria-pressed={selected === true}
        data-variant="filter"
        data-size={size}
        data-selected={selected === true ? 'true' : 'false'}
        className={cx('chip', className)}
      >
        {children}
      </button>
    )
  }

  const attributes = {
    ...rest,
    style,
    'data-variant': variant,
    'data-size': size,
    'data-tier': variant === 'tier' ? tier : undefined,
    'data-highlight': highlight ? 'true' : undefined,
    className: cx('chip', className),
  }

  // A union of intrinsic tags cannot be spread without collapsing to `never`,
  // so the tag is narrowed to one concrete element — every member of the union
  // takes the same DOM props.
  const Tag = as as 'span'
  return <Tag {...attributes}>{children}</Tag>
}
