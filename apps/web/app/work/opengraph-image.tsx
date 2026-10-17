import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from '@/lib/og'
import { getCaseStudies } from '@/lib/routes'

export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export const alt = 'Selected work by Wieslaw Samushonga'

export default function Image() {
  return ogCard({
    eyebrow: 'Work',
    title: 'Selected work',
    subtitle: 'Case studies across healthcare, education, creator tooling, procurement and real-time 3D.',
    tags: getCaseStudies().slice(0, 4).map((project) => project.name),
  })
}
