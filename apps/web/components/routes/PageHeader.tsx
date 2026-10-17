import type { ReactNode } from 'react'

import { Breadcrumbs, type BreadcrumbItem } from '@/components/routes/Breadcrumbs'
import { Eyebrow } from '@/components/ui/Eyebrow'
import type { Tone } from '@/lib/accent'

export type PageHeaderProps = {
  readonly crumbs?: readonly BreadcrumbItem[]
  readonly eyebrow: string
  readonly title: string
  readonly lede?: ReactNode
  readonly tone?: Tone
  /** Badges, chips or buttons that sit under the lede. */
  readonly children?: ReactNode
}

/** The H1 of a deep route. One per page; every section below it is an H2. */
export function PageHeader({ crumbs, eyebrow, title, lede, tone = 'violet', children }: PageHeaderProps) {
  return (
    <header className="max-w-[60rem]">
      {crumbs === undefined ? null : <Breadcrumbs items={crumbs} />}
      <Eyebrow tone={tone} className="mt-6 mb-4">
        {eyebrow}
      </Eyebrow>
      <h1 id="page-h" className="type-display-2 mb-5">
        {title}
      </h1>
      {lede === undefined ? null : (
        <p className="m-0 max-w-[68ch] text-[length:var(--body-lg)] leading-[1.6] text-[color:var(--fg-1)] text-pretty">
          {lede}
        </p>
      )}
      {children === undefined ? null : <div className="mt-6 flex flex-wrap items-center gap-3">{children}</div>}
    </header>
  )
}
