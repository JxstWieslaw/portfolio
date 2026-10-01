import type { Experience } from '@repo/contracts'
import type {
  domains,
  experiences,
  profile,
  projectOutcomes,
  projects,
  skillGroups,
  skills,
} from '../db/schema'
import { contentHash } from './hash'
import type { ContentBundle } from './source'

export interface SeedRows {
  profile: typeof profile.$inferInsert
  domains: (typeof domains.$inferInsert)[]
  projects: { row: typeof projects.$inferInsert; outcomes: (typeof projectOutcomes.$inferInsert)[] }[]
  experiences: (typeof experiences.$inferInsert)[]
  skillGroups: { row: typeof skillGroups.$inferInsert; skills: (typeof skills.$inferInsert)[] }[]
}

/** Experience has no id in content; org + start month is unique and stable across edits to copy. */
export function experienceId(experience: Experience): string {
  return `${experience.org}-${experience.period.from}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Content → rows. Each parent's hash covers its children and its position, so reordering or
 * editing a child is a change to the parent.
 */
export function toRows(bundle: ContentBundle): SeedRows {
  const { profile: p } = bundle
  return {
    profile: {
      id: 1,
      name: p.name,
      headline: p.headline,
      sub: p.sub,
      location: p.location,
      email: p.email,
      emailPlaceholder: p.emailPlaceholder ?? false,
      availability: p.availability,
      roles: p.roles,
      links: p.links,
      kpis: p.kpis,
      contentHash: contentHash(p),
    },
    domains: bundle.domains.map((domain, position) => ({
      ...domain,
      position,
      contentHash: contentHash({ ...domain, position }),
    })),
    projects: bundle.projects.map((project) => ({
      row: {
        slug: project.slug,
        name: project.name,
        domainId: project.domain,
        role: project.role,
        periodFrom: project.period.from,
        periodTo: project.period.to ?? null,
        summary: project.summary,
        stack: project.stack,
        visibility: project.visibility,
        featured: project.featured,
        sortOrder: project.order,
        links: project.links,
        formation: project.formation,
        placeholder: project.placeholder,
        contentHash: contentHash(project),
      },
      outcomes: project.outcome.map((metric, position) => ({
        projectSlug: project.slug,
        position,
        label: metric.label,
        value: metric.value,
        placeholder: metric.placeholder,
      })),
    })),
    experiences: bundle.experience.map((experience, position) => ({
      id: experienceId(experience),
      org: experience.org,
      title: experience.title,
      periodFrom: experience.period.from,
      periodTo: experience.period.to ?? null,
      location: experience.location ?? null,
      highlights: experience.highlights,
      placeholder: experience.placeholder,
      position,
      contentHash: contentHash({ ...experience, position }),
    })),
    skillGroups: bundle.skills.map((group, position) => ({
      row: { id: group.id, label: group.label, position, contentHash: contentHash({ ...group, position }) },
      skills: group.items.map((item, index) => ({
        groupId: group.id,
        position: index,
        name: item.name,
        level: item.level,
      })),
    })),
  }
}
