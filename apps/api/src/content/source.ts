import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import {
  type Domain,
  domainSchema,
  type Experience,
  experienceSchema,
  type Profile,
  profileSchema,
  type Project,
  projectSchema,
  type SkillGroup,
  skillGroupSchema,
} from '@repo/contracts'
import { experienceId } from './rows'

export interface ContentBundle {
  profile: Profile
  domains: Domain[]
  projects: Project[]
  experience: Experience[]
  skills: SkillGroup[]
}

export class ContentIntegrityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ContentIntegrityError'
  }
}

async function parseFile<T extends z.ZodTypeAny>(dir: string, file: string, schema: T): Promise<z.output<T>> {
  const raw: unknown = JSON.parse(await readFile(join(dir, file), 'utf8'))
  const result = schema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    throw new ContentIntegrityError(`${file}: ${issues}`)
  }
  return result.data
}

function assertUnique(kind: string, keys: string[]): void {
  const seen = new Set<string>()
  for (const key of keys) {
    if (seen.has(key)) throw new ContentIntegrityError(`Duplicate ${kind}: ${key}`)
    seen.add(key)
  }
}

/**
 * Reads content/*.json through the shared contracts — the same parse apps/web does at build — and
 * adds the checks a database needs: unique keys and resolvable references. `writing.json` is not
 * seeded in M1; the writing cache arrives with the Medium feed in M3.
 */
export async function loadContentFromDir(dir: string): Promise<ContentBundle> {
  const bundle: ContentBundle = {
    profile: await parseFile(dir, 'profile.json', profileSchema),
    domains: await parseFile(dir, 'domains.json', z.array(domainSchema)),
    projects: await parseFile(dir, 'projects.json', z.array(projectSchema)),
    experience: await parseFile(dir, 'experience.json', z.array(experienceSchema)),
    skills: await parseFile(dir, 'skills.json', z.array(skillGroupSchema)),
  }

  assertUnique('domain id', bundle.domains.map((d) => d.id))
  assertUnique('project slug', bundle.projects.map((p) => p.slug))
  // The API pages projects by `order`, so it must be unique (the database enforces it too).
  assertUnique('project order', bundle.projects.map((p) => String(p.order)))
  assertUnique('experience', bundle.experience.map(experienceId))
  assertUnique('skill group id', bundle.skills.map((g) => g.id))

  const domainIds = new Set(bundle.domains.map((d) => d.id))
  for (const project of bundle.projects) {
    if (!domainIds.has(project.domain)) {
      throw new ContentIntegrityError(`Project ${project.slug} references unknown domain ${project.domain}`)
    }
  }
  return bundle
}
