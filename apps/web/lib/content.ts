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
  domainSchema,
  experienceSchema,
  profileSchema,
  projectSchema,
  skillGroupSchema,
  writingSchema,
} from '@repo/contracts'
import type { Domain, Experience, Project, SkillGroup, Writing } from '@repo/contracts'
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
const kpiGroupSchema = z.enum(['hero', 'proof'])
export type KpiGroupName = z.infer<typeof kpiGroupSchema>

/**
 * The contract's profile plus the two fields it does not yet declare (OD-7, OD-5).
 *
 * Extending the schema keeps them validated instead of merely asserted: a KPI missing its
 * `group` fails the build rather than silently vanishing from both the hero and the proof strip.
 */
const localProfileSchema = profileSchema.extend({
  emailPlaceholder: z.boolean().optional(),
  kpis: z.array(profileSchema.shape.kpis.element.extend({ group: kpiGroupSchema })).min(1),
})

export type Kpi = z.infer<typeof localProfileSchema>['kpis'][number]

/**
 * The contract's `Profile`, plus the two fields it does not yet declare.
 *
 * `group` is requested as OD-7 — spec section 5.5 defines two distinct KPI sets and the design
 * renders them through two different components, so the flat array needs a discriminator.
 * `emailPlaceholder` marks an address as provisional. Currently unset — the contact address
 * is confirmed — but kept as the mechanism for any future unverified address.
 *
 * They are declared by extending the contract's own schema rather than bolted on afterwards,
 * so they are validated too. When the contract absorbs them, delete the extension — nothing
 * else changes.
 */
export type Profile = z.infer<typeof localProfileSchema>

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
const profile = localProfileSchema.parse(profileJson)
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
    // The site's primary contact address, flagged provisional in profile.json and rendered
    // with the dotted provisional treatment by CopyEmailButton (Contact.tsx -> ContactForm.tsx).
    // It is the highest-stakes placeholder on the site, so it belongs in the same report as
    // the other four sources.
    ...(profile.emailPlaceholder === true ? [{ kind: 'profile', label: 'email' }] : []),
  ]
}
