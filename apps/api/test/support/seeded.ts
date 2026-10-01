import { drizzle } from 'drizzle-orm/node-postgres'
import { inject } from 'vitest'
import { runSeed } from '../../src/content/seed'
import { type ContentBundle, loadContentFromDir } from '../../src/content/source'
import { createPool } from '../../src/db/connection'
import { schema } from '../../src/db/schema'
import { REPO_CONTENT_DIR } from './content'
import { createTestDatabase, type TestDatabase } from './database'
import { migrateToLatest } from './migrate'

/** A fresh database at the shipped schema, seeded with the repository's real content. */
export async function seededDatabase(): Promise<{ database: TestDatabase; bundle: ContentBundle }> {
  const database = await createTestDatabase(inject('databaseUrl'))
  await migrateToLatest(database.url)
  const bundle = await loadContentFromDir(REPO_CONTENT_DIR)
  const pool = createPool(database.url, 1)
  try {
    await runSeed(drizzle(pool, { schema }), bundle, { gitSha: 'test', dryRun: false })
  } finally {
    await pool.end()
  }
  return { database, bundle }
}
