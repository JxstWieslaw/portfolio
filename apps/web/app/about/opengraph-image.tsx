import { getProfile } from '@/lib/content'
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from '@/lib/og'

export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export const alt = 'About Wieslaw Samushonga'

export default function Image() {
  const profile = getProfile()

  return ogCard({
    eyebrow: 'About',
    title: profile.name,
    subtitle: profile.roles.map((role) => `${role.title}, ${role.org}`).join(' · '),
    tags: [profile.location],
  })
}
