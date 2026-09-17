import { is } from 'drizzle-orm'
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { loadMigrations } from '../../src/db/migrations/load'
import { applyPending, rollback } from '../../src/db/migrations/runner'
import { schema } from '../../src/db/schema'
import { createTestDatabase, type TestDatabase } from '../support/database'
import { MIGRATIONS_DIR } from '../support/migrate'

async function liveColumns(client: Client): Promise<Record<string, string[]>> {
  const result = await client.query<{ table_name: string; column_name: string }>(
    `select table_name, column_name from information_schema.columns
     where table_schema = 'public' and table_name <> 'schema_migrations'
     order by table_name, column_name`,
  )
  const tables: Record<string, string[]> = {}
  for (const row of result.rows) (tables[row.table_name] ??= []).push(row.column_name)
  // Sort in JS: Postgres collation orders `_` differently from Array.prototype.sort.
  for (const columns of Object.values(tables)) columns.sort()
  return tables
}

function drizzleColumns(): Record<string, string[]> {
  const tables: Record<string, string[]> = {}
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue
    const config = getTableConfig(value)
    tables[config.name] = config.columns.map((column) => column.name).sort()
  }
  return tables
}

describe('the shipped schema', () => {
  let database: TestDatabase
  let client: Client

  beforeAll(async () => {
    database = await createTestDatabase(inject('databaseUrl'))
    client = new Client({ connectionString: database.url })
    await client.connect()
  })

  afterAll(async () => {
    await client.end()
    await database.drop()
  })

  it('matches the Drizzle schema exactly after migrating', async () => {
    const migrations = await loadMigrations(MIGRATIONS_DIR)
    await applyPending(client, migrations)
    expect(await liveColumns(client)).toEqual(drizzleColumns())
  })

  it('rolls all the way back to an empty schema and forward again', async () => {
    const migrations = await loadMigrations(MIGRATIONS_DIR)
    await rollback(client, migrations, migrations.length)
    expect(await liveColumns(client)).toEqual({})

    await applyPending(client, migrations)
    expect(await liveColumns(client)).toEqual(drizzleColumns())
  })
})
