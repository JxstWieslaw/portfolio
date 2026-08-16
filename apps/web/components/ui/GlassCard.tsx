import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '@/lib/cx'
import { type Tone, toneStyle } from '@/lib/accent'

/**
 * The glass recipe (design-foundations.md § 3.1):
 *
 *   background: rgba(17,22,29,.72)      → `--glass-bg`
 *   backdrop-filter: blur(12px)         → `--glass-blur`
 *   border: 1px solid --line-1
 *   border-top: 1px solid rgba(255,255,255,.06)   ← the signature lit edge
 *   border-radius: 20px                 → `--r-panel`
 *
 * The `border-top` override of the four-sided border is the lit top edge, and
 * it recurs on every glass card **except the Stack aside**, which is flat on
 * all four sides (design-home.md § 8).
 *
 * Variants differ only in ground alpha and padding — the blur, border and
 * radius never change.
 */
export type GlassVariant =
  /** Hero panel — `rgba(17,22,29,.72)`, 48px padding at desktop. */
  | 'panel'
  /** Bento LARGE — `rgba(22,27,34,.78)`, 32px, `min-height:340px`. */
  | 'work-large'
  /** Bento STANDARD — `rgba(22,27,34,.78)`, 28px. */
  | 'work-standard'
  /** Pillar card — `rgba(22,27,34,.80)` with a tinted top border. */
  | 'pillar'
  /** Stack aside — `rgba(22,27,34,.80)`, **no lit top edge**. */
  | 'aside'
  /** Craft panel — `rgba(17,22,29,.76)`, cyan top border. */
  | 'craft'
  /** Contact form — `rgba(17,22,29,.78)`. */
  | 'form'

/**
 * Padding steps, from the § 3.3 matrix. The hero and craft panels are the only
 * ones that move through three stops (24 → 40 → 48); cards go 24 → 28/32.
 * These are the sanctioned kind of media query: a discrete step, never a clamp
 * re-declared inside a breakpoint.
 */
const VARIANT_PADDING: Record<GlassVariant, string> = {
  panel: 'p-6 md:p-10 lg:p-12',
  'work-large': 'p-6 lg:p-8',
  'work-standard': 'p-6 lg:p-7',
  pillar: 'p-6 lg:p-8',
  aside: 'p-6 lg:p-8',
  craft: 'p-6 md:p-10 lg:p-12',
  form: 'p-6 lg:p-8',
}

/**
 * `min-height:340px` is a desktop-only rule: at 390 a 340px card with 24px
 * padding is mostly empty space, so the floor only applies from 768 up
 * (design-home.md § 5 "Responsive").
 */
const VARIANT_EXTRA: Partial<Record<GlassVariant, string>> = {
  'work-large': 'md:min-h-[340px]',
}

export type GlassCardProps = {
  children: ReactNode
  variant?: GlassVariant
  /** Accent-tinted top border at 30% alpha. Never combine with `aside`. */
  tone?: Tone
  /** Hover + focus-visible glow family. Border-colour and shadow only. */
  glow?: 'violet' | 'cyan'
  /** Set false to lay out the padding yourself. */
  padded?: boolean
  as?: 'div' | 'article' | 'aside' | 'figure' | 'section' | 'form'
  /** Present ⇒ the whole card is one `<a>` (reconciliation § 6.9). */
  href?: string
  target?: string
  rel?: string
  className?: string
} & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'>

export function GlassCard({
  children,
  variant = 'panel',
  tone,
  glow,
  padded = true,
  as = 'div',
  href,
  target,
  rel,
  className,
  ...rest
}: GlassCardProps) {
  const classes = cx(
    'glass',
    padded && VARIANT_PADDING[variant],
    VARIANT_EXTRA[variant],
    className
  )
  const style = toneStyle('--glass-tone', tone)

  if (href !== undefined) {
    return (
      <a
        {...rest}
        href={href}
        target={target}
        rel={rel}
        style={style}
        data-variant={variant}
        data-tone={tone}
        data-glow={glow}
        className={classes}
      >
        {children}
      </a>
    )
  }

  const Tag = as as 'div'
  return (
    <Tag
      {...rest}
      style={style}
      data-variant={variant}
      data-tone={tone}
      data-glow={glow}
      className={classes}
    >
      {children}
    </Tag>
  )
}
