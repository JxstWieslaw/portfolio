import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '@/lib/cx'
import { type Tone, toneStyle } from '@/lib/accent'

/**
 * The mono micro-label: JetBrains Mono, uppercase, `0.12em` tracking
 * (design-home.md § 15, component 9). Four roles, two sizes:
 *
 *  - section eyebrow (`md`, violet or cyan) — `01 — Selected work`
 *  - card eyebrow (`sm`) — `Pillar 01`, `Medium · Mar 2026`
 *  - form field label (`sm`, as `label`)
 *  - stack group heading (`sm`, as `h3`, tinted per group)
 *
 * The tint is passed as a custom property rather than a class so any of the
 * eleven tones works without eleven variants.
 */
export type EyebrowSize = 'sm' | 'md'

export type EyebrowProps = {
  children: ReactNode
  tone?: Tone
  size?: EyebrowSize
  as?: 'p' | 'span' | 'div' | 'h3' | 'h4' | 'label' | 'dt' | 'figcaption'
  className?: string
} & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'>

export function Eyebrow({
  children,
  tone = 'muted',
  size = 'md',
  as = 'p',
  className,
  ...rest
}: EyebrowProps) {
  const Tag = as as 'p'
  return (
    <Tag
      {...rest}
      style={toneStyle('--eyebrow-tint', tone)}
      data-size={size}
      data-tone={tone}
      className={cx('eyebrow', className)}
    >
      {children}
    </Tag>
  )
}
