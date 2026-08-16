/**
 * Typed access to `content/*.json`.
 *
 * The shapes below MIRROR `@repo/contracts` (session-A, `packages/contracts/src/content.ts`).
 * They are declared locally only because the contracts package lives on a branch this one has
 * not merged yet. When the branches join, replace these declarations with
 * `import type { Profile, Project, … } from '@repo/contracts'` — nothing else in this file, and
 * nothing in any component, needs to change.
 *
 * Sections never import this module. They take their data as props, so they stay pure and
 * testable and this stays the single place that knows where content comes from.
 */

import domainsJson from '../../../content/domains.json'
import experienceJson from '../../../content/experience.json'
import profileJson from '../../../content/profile.json'
import projectsJson from '../../../content/projects.json'
import skillsJson from '../../../content/skills.json'
import writingJson from '../../../content/writing.json'

export type Visibility = 'public' | 'private' | 'client'
export type SkillLevel = 'core' | 'working' | 'familiar'
export type SemanticAccent = 'violet' | 'cyan'

export type Metric = { label: string; value: string; placeholder?: boolean }

export type Domain = {
  id: string
  label: string
  blurb: string
  accent: SemanticAccent
}

export type Project = {
  slug: string
  name: string
  domain: string
  role: string
  period: { from: string; to?: string }
  summary: string
  stack: string[]
  visibility: Visibility
  featured: boolean
  order: number
  outcome?: Metric[]
  links?: { label: string; url: string }[]
  placeholder?: boolean
}

export type Experience = {
  org: string
  title: string
  period: { from: string; to?: string }
  location?: string
  highlights: string[]
  placeholder?: boolean
}

export type SkillGroup = {
  id: string
  label: string
  items: { name: string; level: SkillLevel }[]
}

export type Writing = {
  title: string
  url: string
  date: string
  source: 'medium' | 'other'
  excerpt: string
  placeholder?: boolean
}

/**
 * `group` splits the single `kpis` array into the hero trio and the proof-strip tiles.
 *
 * Spec section 5.5 defines two distinct KPI sets and the design renders them as two different
 * components (KpiTile's `hero` and `proof` variants). The shared schema currently has one flat
 * array with no discriminator — requested as OD-7. Until it lands, the field is present in the
 * JSON and read here; it survives because this loader reads the raw JSON rather than parsing
 * through Zod, which would strip unknown keys.
 *
 * Deliberately NOT positional (`kpis[0..2]`): a positional split breaks silently the first time
 * anyone reorders the array, and content is edited by hand.
 */
export type KpiGroupName = 'hero' | 'proof'

export type Kpi = {
  label: string
  value: string
  group: KpiGroupName
  derived?: 'domainsShipped'
  placeholder?: boolean
}

export type Profile = {
  name: string
  headline: string
  sub: string
  location: string
  email: string
  emailPlaceholder?: boolean
  availability: string
  roles: { org: string; title: string; url?: string }[]
  links: { label: string; url: string; kind: 'primary' | 'secondary' | 'elsewhere' }[]
  kpis: Kpi[]
}

const profile = profileJson as Profile
const domains = domainsJson as Domain[]
const projects = projectsJson as Project[]
const experience = experienceJson as Experience[]
const skills = skillsJson as SkillGroup[]
const writing = writingJson as Writing[]

export function getProfile(): Profile {
  return profile
}

export function getDomains(): Domain[] {
  return domains
}

export function getExperience(): Experience[] {
  return experience
}

export function getSkills(): SkillGroup[] {
  return skills
}

export function getWriting(): Writing[] {
  return writing
}

/** All projects, in authored order. */
export function getProjects(): Project[] {
  return [...projects].sort((a, b) => a.order - b.order)
}

/** The roster the spec marks as featured (six). Used for anything except the bento. */
export function getFeaturedProjects(): Project[] {
  return getProjects().filter((p) => p.featured)
}

/**
 * The seven cards the bento renders, in the design's exact sequence.
 *
 * This is deliberately NOT `getFeaturedProjects()`. The spec's featured six and the design's
 * bento seven are different sets — the design adds `we-assist-you`. Reconciliation section 0
 * governs: the roster is content (spec wins), the sequence and slot count are layout (export
 * wins). Taking the first seven by `order` satisfies both, and `order` is authored to produce
 * the design's sequence with its 3,3,4,2,2,3,3 spans.
 */
export const BENTO_SLOTS = 7

export function getBentoProjects(): Project[] {
  return getProjects().slice(0, BENTO_SLOTS)
}

/**
 * Distinct domains across NON-placeholder projects.
 *
 * Placeholder work is excluded on purpose, so the figure reads 7 until the AR case study is
 * real rather than claiming 8. Spec section 5.5 requires the number be derived rather than
 * written down, so it can never drift from the content.
 */
export function countDomainsShipped(): number {
  return new Set(projects.filter((p) => !p.placeholder).map((p) => p.domain)).size
}

function resolveKpi(kpi: Kpi): Kpi {
  return kpi.derived === 'domainsShipped' ? { ...kpi, value: String(countDomainsShipped()) } : kpi
}

export function getKpis(group: KpiGroupName): Kpi[] {
  return profile.kpis.filter((k) => k.group === group).map(resolveKpi)
}

/** Convenience: the domain record for a project, or undefined if the id does not resolve. */
export function getDomain(id: string): Domain | undefined {
  return domains.find((d) => d.id === id)
}

/** Every placeholder-flagged item, for the content linter and dev-only affordances. */
export function listPlaceholders(): { kind: string; label: string }[] {
  return [
    ...profile.kpis.filter((k) => k.placeholder).map((k) => ({ kind: 'kpi', label: k.label })),
    ...projects.filter((p) => p.placeholder).map((p) => ({ kind: 'project', label: p.name })),
    ...experience.filter((e) => e.placeholder).map((e) => ({ kind: 'experience', label: e.org })),
    ...writing.filter((w) => w.placeholder).map((w) => ({ kind: 'writing', label: w.title })),
  ]
}
