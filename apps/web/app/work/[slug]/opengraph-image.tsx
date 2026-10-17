import { notFound } from 'next/navigation'

import { getDomain } from '@/lib/content'
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from '@/lib/og'
import { caseStudyParams, getCaseStudy } from '@/lib/routes'

export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export const alt = 'Case study'

export function generateStaticParams() {
  return caseStudyParams()
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const project = getCaseStudy(slug)
  if (project === undefined) notFound()

  return ogCard({
    eyebrow: `Case study · ${getDomain(project.domain)?.label ?? project.role}`,
    title: project.name,
    subtitle: project.summary,
    tags: project.stack,
  })
}
