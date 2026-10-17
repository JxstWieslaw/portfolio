/**
 * What the deep routes publish, derived from `content/*.json`.
 *
 * One rule runs through this file: anything flagged `placeholder` in the content is an owner
 * input that has not arrived yet, and it is never published as if it were real. Routes, the
 * sitemap, `/about` and `/resume` all read through here, so the rule lives in one place.
 */

import { existsSync } from 'node:fs'
import path from 'node:path'

import { getExperience, getProjects } from './content'
import type { Experience, Project } from './content'

/** Projects that get a case-study page: everything not flagged `placeholder`, in authored order. */
export function getCaseStudies(): Project[] {
  return getProjects().filter((project) => !project.placeholder)
}

export function getCaseStudy(slug: string): Project | undefined {
  return getCaseStudies().find((project) => project.slug === slug)
}

/** The params `generateStaticParams` returns for `/work/[slug]`. */
export function caseStudyParams(): { slug: string }[] {
  return getCaseStudies().map((project) => ({ slug: project.slug }))
}

/** Private and client work: the code and detail are not public, so the page offers a walkthrough. */
export function isConfidential(project: Project): boolean {
  return project.visibility !== 'public'
}

/** Experience rows safe to publish: the "Earlier engineering roles" aggregate is a placeholder. */
export function getPublishedExperience(): Experience[] {
  return getExperience().filter((entry) => !entry.placeholder)
}

/** What the owner has flagged and these routes therefore leave out. For the PR body and the tests. */
export function getExcludedPlaceholders(): { kind: 'project' | 'experience'; label: string }[] {
  return [
    ...getProjects().filter((p) => p.placeholder).map((p) => ({ kind: 'project' as const, label: p.name })),
    ...getExperience().filter((e) => e.placeholder).map((e) => ({ kind: 'experience' as const, label: e.org })),
  ]
}

/**
 * The résumé PDF, if one has been added to `public/`.
 *
 * The CV PDF was removed from git on purpose, so the download is offered only when the file is
 * actually there; otherwise the page says to print it from the browser instead.
 */
export function resumePdfHref(publicDir = path.join(process.cwd(), 'public')): string | undefined {
  return existsSync(path.join(publicDir, 'resume.pdf')) ? '/resume.pdf' : undefined
}

export type SiteRoute = {
  readonly path: string
  readonly changeFrequency: 'weekly' | 'monthly' | 'yearly'
  readonly priority: number
}

/**
 * Every indexable route. `/admin` and `/lab` are deliberately absent: `/admin` is excluded for
 * good (spec section 3) and `/lab` does not exist yet.
 */
export function getSiteRoutes(): SiteRoute[] {
  return [
    { path: '/', changeFrequency: 'monthly', priority: 1 },
    { path: '/work', changeFrequency: 'monthly', priority: 0.8 },
    ...getCaseStudies().map((project) => ({
      path: `/work/${project.slug}`,
      changeFrequency: 'yearly' as const,
      priority: 0.6,
    })),
    { path: '/about', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/resume', changeFrequency: 'monthly', priority: 0.7 },
  ]
}
