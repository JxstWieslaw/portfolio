import { drizzle } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { type Project, resolveDerivedKpis } from '@repo/contracts'
import { PostgresContentReader } from '../../src/content/content.reader'
import type { ContentBundle } from '../../src/content/source'
import { createPool } from '../../src/db/connection'
import { schema } from '../../src/db/schema'
import { ValidationFailedError } from '../../src/http/validation'
import { createTestDatabase, type TestDatabase } from '../support/database'
import { migrateToLatest } from '../support/migrate'
import { seededDatabase } from '../support/seeded'

const byOrder = (a: Project, b: Project) => a.order - b.order

describe('PostgresContentReader — round trip from git', () => {
  let database: TestDatabase
  let bundle: ContentBundle
  let pool: Pool
  let reader: PostgresContentReader

  beforeAll(async () => {
    ;({ database, bundle } = await seededDatabase())
    pool = createPool(database.url, 2)
    reader = new PostgresContentReader(drizzle(pool, { schema }))
  })

  afterAll(async () => {
    await pool.end()
    await database.drop()
  })

  it('returns the profile with derived KPIs resolved', async () => {
    expect(await reader.getProfile()).toEqual(resolveDerivedKpis(bundle.profile, bundle.projects))
  })

  it('returns domains, experience and skills exactly as authored, in order', async () => {
    expect(await reader.listDomains()).toEqual(bundle.domains)
    expect(await reader.listExperience()).toEqual(bundle.experience)
    expect(await reader.listSkillGroups()).toEqual(bundle.skills)
  })

  it('pages through every project in order', async () => {
    const collected: Project[] = []
    let cursor: string | undefined
    for (let guard = 0; guard < 50; guard++) {
      const page = await reader.listProjects({ limit: 2, ...(cursor === undefined ? {} : { cursor }) })
      expect(page.data.length).toBeLessThanOrEqual(2)
      collected.push(...page.data)
      if (page.nextCursor === null) break
      cursor = page.nextCursor
    }
    expect(collected).toEqual([...bundle.projects].sort(byOrder))
  })

  it('filters by domain and by featured', async () => {
    const domain = bundle.projects[0]?.domain ?? ''
    const inDomain = await reader.listProjects({ limit: 50, domain })
    expect(inDomain.data.map((p) => p.slug)).toEqual(
      bundle.projects.filter((p) => p.domain === domain).sort(byOrder).map((p) => p.slug),
    )
    const featured = await reader.listProjects({ limit: 50, featured: true })
    expect(featured.data.every((p) => p.featured)).toBe(true)
    expect(featured.data).toHaveLength(bundle.projects.filter((p) => p.featured).length)
  })

  it('rejects a malformed cursor as a validation failure', async () => {
    await expect(reader.listProjects({ limit: 5, cursor: 'nope' })).rejects.toBeInstanceOf(ValidationFailedError)
  })

  it('reads one project with its outcomes, or null', async () => {
    const withOutcomes = bundle.projects.find((p) => p.outcome.length > 0) ?? bundle.projects[0]
    expect(await reader.getProject(withOutcomes?.slug ?? '')).toEqual(withOutcomes)
    expect(await reader.getProject('does-not-exist')).toBeNull()
  })
})

describe('PostgresContentReader — before any seed', () => {
  it('returns null for the profile rather than inventing one', async () => {
    const database = await createTestDatabase(inject('databaseUrl'))
    await migrateToLatest(database.url)
    const pool = createPool(database.url, 1)
    try {
      expect(await new PostgresContentReader(drizzle(pool, { schema })).getProfile()).toBeNull()
    } finally {
      await pool.end()
      await database.drop()
    }
  })
})
