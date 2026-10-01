/**
 * Typed access to `content/*.json`.
 *
 * Shapes come from `@repo/contracts` — the same Zod schemas the API derives its DTOs and
 * OpenAPI document from. That is the point of the shared package: a breaking contract change
 * fails this app's typecheck in CI rather than at runtime in production.
 *
 * Sections never import this module. They take their data as props, so they stay pure and
 * testable and this stays the single place that knows where content comes from.
 */

import {
  countDomainsShipped as countDomainsShippedIn,
  domainSchema,
  experienceSchema,
  profileSchema,
  projectSchema,
  resolveDerivedKpis,
  skillGroupSchema,
  writingSchema,
} from '@repo/contracts'
import type { Domain, Experience, KpiGroup, Profile, Project, SkillGroup, Writing } from '@repo/contracts'
import { z } from 'zod'

import domainsJson from '../../../content/domains.json'
import experienceJson from '../../../content/experience.json'
import profileJson from '../../../content/profile.json'
import projectsJson from '../../../content/projects.json'
import skillsJson from '../../../content/skills.json'
import writingJson from '../../../content/writing.json'

export type { Domain, Experience, Project, SkillGroup, Writing }
export type { SkillLevel, Visibility } from '@repo/contracts'

/** The accent pair the contract carries. Brand tints live in `lib/accent.ts` — see OD-2. */
export type SemanticAccent = Domain['accent']

export type { Profile }

/** The hero trio or the proof strip — the contract's `KpiGroup`, under this module's old name. */
export type KpiGroupName = KpiGroup

export type Kpi = Profile['kpis'][number]

/**
 * Content is PARSED, not cast.
 *
 * A cast would only assert the shape; parsing enforces it. Every constraint the API will apply
 * — `YYYY-MM` periods, a 280-character summary cap, real URLs and emails, kebab-case slugs,
 * non-empty arrays — is checked here at build time. Malformed content therefore fails the
 * build with a field path, instead of rendering `undefined` into the page or throwing in a
 * visitor's browser.
 *
 * It also means the defaults in the schema (`placeholder: false`, `outcome: []`) are applied
 * rather than assumed, which is why the raw JSON can omit them.
 */
const profile = profileSchema.parse(profileJson)
const domains = z.array(domainSchema).parse(domainsJson)
const projects = z.array(projectSchema).parse(projectsJson)
const experience = z.array(experienceSchema).parse(experienceJson)
const skills = z.array(skillGroupSchema).parse(skillsJson)
const writing = z.array(writingSchema).parse(writingJson)

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
  return countDomainsShippedIn(projects)
}

export function getKpis(group: KpiGroupName): Kpi[] {
  return resolveDerivedKpis(profile, projects).kpis.filter((k) => k.group === group)
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
    // The site's primary contact address, flagged provisional in profile.json and rendered
    // with the dotted provisional treatment by CopyEmailButton (Contact.tsx -> ContactForm.tsx).
    // It is the highest-stakes placeholder on the site, so it belongs in the same report as
    // the other four sources.
    ...(profile.emailPlaceholder === true ? [{ kind: 'profile', label: 'email' }] : []),
  ]
}
