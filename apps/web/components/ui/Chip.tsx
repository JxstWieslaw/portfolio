import type { HTMLAttributes, MouseEventHandler, ReactNode } from 'react'
import { ChipScrollerList } from '@/components/ui/ChipScrollerList'
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

/**
 * The row the eight domain chips sit in.
 *
 * Reconciliation § 3.4 — below 768 it is a horizontal scroll-snap row with
 * masked edges, and from 768 up it wraps. Deliberately not the brief's
 * marquee: a marquee autoplays, which contradicts "nothing autoplays except
 * the Assembly's idle breathing", and it needs a separate static variant under
 * reduced motion anyway. A swipeable, keyboard- and screen-reader-navigable
 * scroller gives the same "there are more of these" affordance for no
 * animation frames. The edge fade is a CSS mask, not motion.
 *
 * The `<ul>`'s implicit `list` role is left alone (deliberately — a first
 * attempt overrode it to `role="region"`, which "worked" for the mobile
 * focusability fix below but orphaned every `<li>` child from a list-rooted
 * ARIA tree, trading one axe violation for a second one, `listitem`'s
 * required-parent check); `list` already correctly describes eight domain
 * names, and every call site is already required to give it an accessible
 * name via `aria-label`/`aria-labelledby` (`ProofStrip` passes `aria-label`).
 * This does not remove or replace the horizontal scroll, which is a
 * deliberate design decision, not a defect.
 *
 * The tab-stop logic (needed below 768px, dead weight at and above it) lives
 * in `ChipScrollerList` — see that file for the why. This function itself
 * stays a plain server component; only that one piece pays for the client.
 */
export function ChipScroller({
  children,
  className,
  ...rest
}: {
  children: ReactNode
  className?: string
} & Omit<HTMLAttributes<HTMLUListElement>, 'children' | 'className'>) {
  return (
    <ChipScrollerList className={className} {...rest}>
      {children}
    </ChipScrollerList>
  )
}
