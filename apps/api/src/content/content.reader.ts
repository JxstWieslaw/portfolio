import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, gt, inArray, type SQL } from 'drizzle-orm'
import {
  type Domain,
  domainSchema,
  type Experience,
  experienceSchema,
  type Page,
  type Profile,
  profileSchema,
  type Project,
  type ProjectListQuery,
  projectSchema,
  resolveDerivedKpis,
  type SkillGroup,
  skillGroupSchema,
} from '@repo/contracts'
import { type Database, DB } from '../db/db.module'
import { domains, experiences, profile, projectOutcomes, projects, skillGroups, skills } from '../db/schema'
import { ValidationFailedError } from '../http/validation'
import { decodeCursor, encodeCursor } from './cursor'

export const CONTENT_READER = Symbol('CONTENT_READER')

export interface ContentReader {
  getProfile(): Promise<Profile | null>
  listDomains(): Promise<Domain[]>
  listProjects(query: ProjectListQuery): Promise<Page<Project>>
  getProject(slug: string): Promise<Project | null>
  listExperience(): Promise<Experience[]>
  listSkillGroups(): Promise<SkillGroup[]>
}

type ProjectRow = typeof projects.$inferSelect

/**
 * Rows → contract types. Every value is parsed through the shared schema on the way out, so a
 * database that drifted from the contract fails loudly here instead of reaching a client.
 */
@Injectable()
export class PostgresContentReader implements ContentReader {
  constructor(@Inject(DB) private readonly db: Database) {}

  async getProfile(): Promise<Profile | null> {
    const [row] = await this.db.select().from(profile).where(eq(profile.id, 1))
    if (row === undefined) return null
    const shipped = await this.db
      .select({ domain: projects.domainId, placeholder: projects.placeholder })
      .from(projects)
    const parsed = profileSchema.parse({
      name: row.name,
      headline: row.headline,
      sub: row.sub,
      location: row.location,
      email: row.email,
      ...(row.emailPlaceholder ? { emailPlaceholder: true } : {}),
      availability: row.availability,
      roles: row.roles,
      links: row.links,
      kpis: row.kpis,
    })
    return resolveDerivedKpis(parsed, shipped)
  }

  async listDomains(): Promise<Domain[]> {
    const rows = await this.db.select().from(domains).orderBy(asc(domains.position))
    return rows.map((row) => domainSchema.parse({ id: row.id, label: row.label, blurb: row.blurb, accent: row.accent }))
  }

  async listProjects(query: ProjectListQuery): Promise<Page<Project>> {
    const conditions: (SQL | undefined)[] = []
    if (query.domain !== undefined) conditions.push(eq(projects.domainId, query.domain))
    if (query.featured !== undefined) conditions.push(eq(projects.featured, query.featured))
    if (query.cursor !== undefined) {
      const cursor = decodeCursor(query.cursor)
      if (cursor === null) throw new ValidationFailedError([{ path: ['cursor'], message: 'Invalid cursor' }])
      conditions.push(gt(projects.sortOrder, cursor.order))
    }

    const rows = await this.db
      .select()
      .from(projects)
      .where(and(...conditions))
      .orderBy(asc(projects.sortOrder))
      .limit(query.limit + 1)

    const page = rows.slice(0, query.limit)
    const last = page.at(-1)
    return {
      data: await this.withOutcomes(page),
      nextCursor:
        rows.length > query.limit && last !== undefined
          ? encodeCursor({ order: last.sortOrder })
          : null,
    }
  }

  async getProject(slug: string): Promise<Project | null> {
    const rows = await this.db.select().from(projects).where(eq(projects.slug, slug))
    const [project] = await this.withOutcomes(rows)
    return project ?? null
  }

  async listExperience(): Promise<Experience[]> {
    const rows = await this.db.select().from(experiences).orderBy(asc(experiences.position))
    return rows.map((row) =>
      experienceSchema.parse({
        org: row.org,
        title: row.title,
        period: row.periodTo === null ? { from: row.periodFrom } : { from: row.periodFrom, to: row.periodTo },
        ...(row.location === null ? {} : { location: row.location }),
        highlights: row.highlights,
        placeholder: row.placeholder,
      }),
    )
  }

  async listSkillGroups(): Promise<SkillGroup[]> {
    const [groups, items] = await Promise.all([
      this.db.select().from(skillGroups).orderBy(asc(skillGroups.position)),
      this.db.select().from(skills).orderBy(asc(skills.groupId), asc(skills.position)),
    ])
    return groups.map((group) =>
      skillGroupSchema.parse({
        id: group.id,
        label: group.label,
        items: items
          .filter((item) => item.groupId === group.id)
          .map((item) => ({ name: item.name, level: item.level })),
      }),
    )
  }

  private async withOutcomes(rows: ProjectRow[]): Promise<Project[]> {
    if (rows.length === 0) return []
    const outcomes = await this.db
      .select()
      .from(projectOutcomes)
      .where(inArray(projectOutcomes.projectSlug, rows.map((row) => row.slug)))
      .orderBy(asc(projectOutcomes.projectSlug), asc(projectOutcomes.position))

    return rows.map((row) =>
      projectSchema.parse({
        slug: row.slug,
        name: row.name,
        domain: row.domainId,
        role: row.role,
        period: row.periodTo === null ? { from: row.periodFrom } : { from: row.periodFrom, to: row.periodTo },
        summary: row.summary,
        stack: row.stack,
        visibility: row.visibility,
        featured: row.featured,
        order: row.sortOrder,
        outcome: outcomes
          .filter((outcome) => outcome.projectSlug === row.slug)
          .map((outcome) => ({ label: outcome.label, value: outcome.value, placeholder: outcome.placeholder })),
        links: row.links,
        formation: row.formation,
        placeholder: row.placeholder,
      }),
    )
  }
}
