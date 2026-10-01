import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import { loadMigrations } from '../../src/db/migrations/load'
import { applyPending } from '../../src/db/migrations/runner'

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url))

/** Brings a test database to the schema that ships, through the same runner production uses. */
export async function migrateToLatest(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    await applyPending(client, await loadMigrations(MIGRATIONS_DIR))
  } finally {
    await client.end()
  }
}
