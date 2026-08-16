import type { ReactNode } from 'react'
import { cx } from '@/lib/cx'
import type { ContainerWidth } from '@/components/layout/Container'

/**
 * `--section-y` is `clamp(4rem, 10vw, 10rem)`; the proof strip is the one
 * section that overrides it with a fixed 48px (design-home.md § 4).
 */
export type SectionPadding = 'section' | 'compact' | 'none'

export type SectionBackground = 'none' | 'bg-0' | 'bg-1'

export type SectionProps = {
  /** Doubles as the anchor target and as `data-section`, which the scroll-spy
   *  observes and M2's scroll store reuses. */
  id: string
  /**
   * The canvas formation this section owns. Typed as a string rather than
   * imported from `@repo/contracts` on purpose: the contract still carries a
   * dead `badge` member (reconciliation § 10) and the canvas layer is being
   * built concurrently, so this stays a loose seam until both settle.
   */
  formation?: string
  /** id of the heading that names the region. */
  labelledBy?: string
  /** For the one section with no visible heading — the proof strip. */
  label?: string
  /**
   * The decorative canvas + scrim layer. Rendered before the content wrapper
   * and expected to be absolutely positioned and `aria-hidden`. `SectionBackdrop`
   * is built elsewhere; this component only reserves the slot for it.
   */
  backdrop?: ReactNode
  width?: ContainerWidth
  padding?: SectionPadding
  /** The hairline above the section. True for every section except the hero. */
  divider?: boolean
  background?: SectionBackground
  className?: string
  innerClassName?: string
  children: ReactNode
}

/**
 * The section shell.
 *
 * Reconciliation § 6: section padding and max-width are ONE wrapper, not a
 * `Section` wrapping a `Container`. The `<section>` element is the positioning
 * context for the backdrop; the inner `<div>` carries the cap, the gutter, the
 * vertical rhythm and `position:relative` so content sits above the canvas.
 *
 * Responsive: entirely fluid. `--section-y` and `--page-x` are clamps, so the
 * shell needs no media query at any of 390 / 834 / 1440 / 2560.
 */
export function Section({
  id,
  formation,
  labelledBy,
  label,
  backdrop,
  width = 'content',
  padding = 'section',
  divider = true,
  background = 'none',
  className,
  innerClassName,
  children,
}: SectionProps) {
  return (
    <section
      id={id}
      data-section={id}
      data-formation={formation}
      data-divider={divider ? 'true' : 'false'}
      data-background={background}
      aria-labelledby={labelledBy}
      aria-label={label}
      className={cx('section-shell', className)}
    >
      {backdrop}
      <div
        data-width={width}
        data-pad={padding}
        className={cx('section-inner', innerClassName)}
      >
        {children}
      </div>
    </section>
  )
}
