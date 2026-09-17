import { count, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { detectDrift, runSeed } from '../../src/content/seed'
import { type ContentBundle, loadContentFromDir } from '../../src/content/source'
import { createPool } from '../../src/db/connection'
import type { Database } from '../../src/db/db.module'
import { projectOutcomes, projects, schema, seedRuns, skills } from '../../src/db/schema'
import { REPO_CONTENT_DIR } from '../support/content'
import { createTestDatabase, type TestDatabase } from '../support/database'
import { migrateToLatest } from '../support/migrate'

describe('content seed', () => {
  let database: TestDatabase
  let pool: Pool
  let db: Database
  let bundle: ContentBundle

  beforeAll(async () => {
    database = await createTestDatabase(inject('databaseUrl'))
    await migrateToLatest(database.url)
    pool = createPool(database.url, 2)
    db = drizzle(pool, { schema })
    bundle = await loadContentFromDir(REPO_CONTENT_DIR)
  })

  afterAll(async () => {
    await pool.end()
    await database.drop()
  })

  const rowCount = async (table: PgTable) =>
    (await db.select({ n: count() }).from(table))[0]?.n ?? 0

  it('--dry-run plans every insert, writes no content, and records the run', async () => {
    const outcome = await runSeed(db, bundle, { gitSha: 'dry', dryRun: true })
    expect(outcome.plan.projects.inserted).toHaveLength(bundle.projects.length)
    expect(outcome.plan.profile.inserted).toEqual(['1'])
    expect(await rowCount(projects)).toBe(0)
    expect(await rowCount(seedRuns)).toBe(1)
  })

  it('applies all content, then is a no-op when nothing changed', async () => {
    const first = await runSeed(db, bundle, { gitSha: 'a1', dryRun: false })
    expect(first.plan.domains.inserted).toHaveLength(bundle.domains.length)
    expect(await rowCount(projects)).toBe(bundle.projects.length)
    expect(await rowCount(skills)).toBe(bundle.skills.flatMap((g) => g.items).length)

    const [before] = await db.select({ at: projects.seededAt }).from(projects).limit(1)
    const second = await runSeed(db, bundle, { gitSha: 'a2', dryRun: false })
    for (const table of Object.values(second.plan)) {
      expect(table).toMatchObject({ inserted: [], updated: [], deleted: [] })
    }
    const [after] = await db.select({ at: projects.seededAt }).from(projects).limit(1)
    expect(after?.at).toEqual(before?.at)
    expect(await detectDrift(db, bundle)).toBe(false)
  })

  it('updates only the edited row', async () => {
    const [target, ...rest] = bundle.projects
    if (target === undefined) throw new Error('content has no projects')
    const edited = { ...bundle, projects: [{ ...target, summary: `${target.summary} Edited.` }, ...rest] }

    expect(await detectDrift(db, edited)).toBe(true)
    const outcome = await runSeed(db, edited, { gitSha: 'b1', dryRun: false })
    expect(outcome.plan.projects.updated).toEqual([target.slug])
    expect(outcome.plan.projects.unchanged).toBe(rest.length)
    const [row] = await db.select({ summary: projects.summary }).from(projects).where(eq(projects.slug, target.slug))
    expect(row?.summary).toMatch(/Edited\.$/)
  })

  it('deletes content removed from git, children included', async () => {
    const [target, ...rest] = bundle.projects
    if (target === undefined) throw new Error('content has no projects')
    // Give the target an outcome first, so the cascade to project_outcomes is really exercised.
    const withOutcome = { ...target, outcome: [{ label: 'Latency', value: '-40%', placeholder: false }] }
    await runSeed(db, { ...bundle, projects: [withOutcome, ...rest] }, { gitSha: 'c0', dryRun: false })
    const outcomesFor = () => db.select().from(projectOutcomes).where(eq(projectOutcomes.projectSlug, target.slug))
    expect(await outcomesFor()).toHaveLength(1)

    const outcome = await runSeed(db, { ...bundle, projects: rest }, { gitSha: 'c1', dryRun: false })
    expect(outcome.plan.projects.deleted).toEqual([target.slug])
    expect(await db.select().from(projects).where(eq(projects.slug, target.slug))).toEqual([])
    expect(await outcomesFor()).toEqual([])
  })

  it('records every run with its git sha, content hash and plan', async () => {
    const runs = await db.select().from(seedRuns).orderBy(seedRuns.id)
    expect(runs.map((run) => run.gitSha)).toEqual(['dry', 'a1', 'a2', 'b1', 'c0', 'c1'])
    expect(runs[0]?.dryRun).toBe(true)
    expect(runs[1]?.contentHash).toMatch(/^[0-9a-f]{64}$/)
  })
})
