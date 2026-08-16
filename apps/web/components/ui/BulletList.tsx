import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '@/lib/cx'
import { type Tone, toneStyle } from '@/lib/accent'

/**
 * A hanging-indent list with no `list-style`: every item is
 * `grid-template-columns: 14px 1fr; gap: 12px`, so wrapped lines align to the
 * text column rather than under the glyph (design-home.md § 6, § 9).
 *
 * Two variants:
 *  - `accent`   — `▸` in an accent colour, 12px row gap (the pillar cards).
 *  - `timeline` — `—` in `--line-2`, 8px row gap, capped at 70ch.
 *
 * The glyph is `aria-hidden`: it is a bullet, and a screen reader already
 * announces list items.
 */
export type BulletVariant = 'accent' | 'timeline'

const DEFAULT_GLYPH: Record<BulletVariant, string> = {
  accent: '▸',
  timeline: '—',
}

const DEFAULT_TONE: Record<BulletVariant, Tone> = {
  accent: 'violet-500',
  timeline: 'line',
}

export type BulletListProps = {
  items: ReadonlyArray<ReactNode>
  variant?: BulletVariant
  /** Overrides the variant's default glyph colour. */
  tone?: Tone
  glyph?: string
  className?: string
} & Omit<HTMLAttributes<HTMLUListElement>, 'children' | 'className'>

export function BulletList({
  items,
  variant = 'accent',
  tone,
  glyph,
  className,
  ...rest
}: BulletListProps) {
  const mark = glyph ?? DEFAULT_GLYPH[variant]
  const style = toneStyle('--bullet-tint', tone ?? DEFAULT_TONE[variant])

  return (
    <ul {...rest} data-variant={variant} className={cx('bullets', className)}>
      {/* Static content from JSON with no stable id and no reordering, so the
          position is the identity. */}
      {items.map((item, index) => (
        <li key={index} className="bullets-item">
          <span aria-hidden="true" style={style} className="bullets-glyph">
            {mark}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}
