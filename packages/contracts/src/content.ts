import { z } from 'zod'

export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be kebab-case')
const slug = slugSchema
const yearMonth = z.string().regex(/^\d{4}-\d{2}$/, 'must be YYYY-MM')

export const visibilitySchema = z.enum(['public', 'private', 'client'])
export type Visibility = z.infer<typeof visibilitySchema>

export const formationIdSchema = z.enum([
  'monolith', 'stream', 'lattice', 'orbit', 'scatter', 'grid', 'ring', 'badge',
])
export type FormationId = z.infer<typeof formationIdSchema>

export const skillLevelSchema = z.enum(['core', 'working', 'familiar'])
export type SkillLevel = z.infer<typeof skillLevelSchema>

export const domainSchema = z.object({
  id: slug,
  label: z.string().min(1),
  blurb: z.string().min(1),
  accent: z.enum(['violet', 'cyan']),
})
export type Domain = z.infer<typeof domainSchema>

const metricSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  placeholder: z.boolean().default(false),
})

export const projectSchema = z.object({
  slug,
  name: z.string().min(1),
  domain: slug,
  role: z.string().min(1),
  period: z.object({ from: yearMonth, to: yearMonth.optional() }),
  summary: z.string().min(1).max(280),
  stack: z.array(z.string().min(1)).min(1, 'at least one stack chip is required'),
  visibility: visibilitySchema,
  featured: z.boolean(),
  order: z.number().int().nonnegative(),
  outcome: z.array(metricSchema).default([]),
  links: z.array(z.object({ label: z.string().min(1), url: z.string().url() })).default([]),
  formation: formationIdSchema.default('badge'),
  placeholder: z.boolean().default(false),
})
export type Project = z.infer<typeof projectSchema>

export const experienceSchema = z.object({
  org: z.string().min(1),
  title: z.string().min(1),
  period: z.object({ from: yearMonth, to: yearMonth.optional() }),
  location: z.string().optional(),
  highlights: z.array(z.string().min(1)).min(1),
  placeholder: z.boolean().default(false),
})
export type Experience = z.infer<typeof experienceSchema>

export const skillGroupSchema = z.object({
  id: slug,
  label: z.string().min(1),
  items: z
    .array(z.object({ name: z.string().min(1), level: skillLevelSchema.default('working') }))
    .min(1),
})
export type SkillGroup = z.infer<typeof skillGroupSchema>

export const writingSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
  source: z.enum(['medium', 'other']),
  excerpt: z.string().min(1),
  placeholder: z.boolean().default(false),
})
export type Writing = z.infer<typeof writingSchema>

/**
 * Which KPI set a tile belongs to. Spec §5.5 defines two — the hero trio and the proof strip —
 * rendered by different components, so the flat array needs a discriminator (was OD-7).
 */
export const kpiGroupSchema = z.enum(['hero', 'proof'])
export type KpiGroup = z.infer<typeof kpiGroupSchema>

export const profileSchema = z.object({
  name: z.string().min(1),
  headline: z.string().min(1),
  sub: z.string().min(1),
  location: z.string().min(1),
  email: z.string().email(),
  /** Marks the address as provisional; it then renders with the placeholder treatment. */
  emailPlaceholder: z.boolean().optional(),
  availability: z.string().min(1),
  roles: z.array(z.object({
    org: z.string().min(1),
    title: z.string().min(1),
    url: z.string().url().optional(),
  })).min(1),
  links: z.array(z.object({
    label: z.string().min(1),
    url: z.string().url(),
    kind: z.enum(['primary', 'secondary', 'elsewhere']),
  })).min(1),
  kpis: z.array(z.object({
    label: z.string().min(1),
    value: z.string().min(1),
    derived: z.enum(['domainsShipped']).optional(),
    placeholder: z.boolean().default(false),
    group: kpiGroupSchema,
  })).min(1),
})
export type Profile = z.infer<typeof profileSchema>

/**
 * Distinct domains across NON-placeholder projects. Placeholder work is excluded so the figure
 * never claims a domain that is not yet real (spec §5.5: derived, never written down).
 */
export function countDomainsShipped(
  projects: readonly Pick<Project, 'domain' | 'placeholder'>[],
): number {
  return new Set(projects.filter((p) => !p.placeholder).map((p) => p.domain)).size
}

/** Returns a copy of `profile` with every derived KPI's value computed from `projects`. */
export function resolveDerivedKpis(
  profile: Profile,
  projects: readonly Pick<Project, 'domain' | 'placeholder'>[],
): Profile {
  return {
    ...profile,
    kpis: profile.kpis.map((kpi) =>
      kpi.derived === 'domainsShipped' ? { ...kpi, value: String(countDomainsShipped(projects)) } : kpi,
    ),
  }
}
