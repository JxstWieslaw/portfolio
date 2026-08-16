import type { ReactNode } from 'react'
import { cx } from '@/lib/cx'

/**
 * Content is capped at 1440px everywhere; the bento is the single exception at
 * 1600px (design-home.md § 5). Above 2560 the cap holds and the extra width
 * becomes air, never wider text — reconciliation § 3.2 principle 4.
 */
export type ContainerWidth = 'content' | 'bento'

export type ContainerProps = {
  children: ReactNode
  width?: ContainerWidth
  className?: string
  id?: string
}

/**
 * Horizontal shell only: max-width, centring and the `--page-x` gutter
 * (`clamp(1rem, 4vw, 4rem)` — 16px at 390, 64px at 2560). Vertical rhythm
 * belongs to `Section`, which merges both into one wrapper.
 *
 * Use this directly only outside sections — the nav row and the footer.
 */
export function Container({ children, width = 'content', className, id }: ContainerProps) {
  return (
    <div
      id={id}
      data-width={width}
      className={cx(width === 'bento' ? 'shell-bento' : 'shell-content', className)}
    >
      {children}
    </div>
  )
}
