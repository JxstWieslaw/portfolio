import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { type CliIo, runMigrateCli } from '../../src/db/migrations/cli'
import { loadMigrations } from '../../src/db/migrations/load'
import { applyPending, MigrationStateError, readStatus, rollback } from '../../src/db/migrations/runner'
import { createTestDatabase, type TestDatabase } from '../support/database'
import { writeMigrations } from '../support/migrations'

const FIXTURES = {
  '0000_widgets': { up: 'create table widgets (id int primary key);', down: 'drop table widgets;' },
  '0001_widget_name': {
    up: 'alter table widgets add column name text;',
    down: 'alter table widgets drop column name;',
  },
}

async function columns(client: Client, table: string): Promise<string[]> {
  const result = await client.query<{ column_name: string }>(
    `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position`,
    [table],
  )
  return result.rows.map((row) => row.column_name)
}

async function ledger(client: Client): Promise<string[]> {
  const exists = await client.query<{ t: string | null }>(`select to_regclass('public.schema_migrations') as t`)
  if (exists.rows[0]?.t === null) return []
  const result = await client.query<{ id: string }>('select id from schema_migrations order by id')
  return result.rows.map((row) => row.id)
}

describe('migration runner', () => {
  let database: TestDatabase
  let client: Client
  let dir: string

  beforeAll(async () => {
    database = await createTestDatabase(inject('databaseUrl'))
  })

  afterAll(async () => {
    await database.drop()
  })

  beforeEach(async () => {
    client = new Client({ connectionString: database.url })
    await client.connect()
    await client.query('drop schema public cascade; create schema public;')
    dir = await writeMigrations(FIXTURES)
  })

  afterEach(async () => {
    await client.end()
  })

  it('reports everything pending on an empty database, without creating the ledger', async () => {
    const status = await readStatus(client, await loadMigrations(dir))
    expect(status.entries).toEqual([
      { id: '0000_widgets', state: 'pending' },
      { id: '0001_widget_name', state: 'pending' },
    ])
    expect(await ledger(client)).toEqual([])
  })

  it('applies pending migrations in order, once', async () => {
    const migrations = await loadMigrations(dir)
    expect(await applyPending(client, migrations)).toEqual(['0000_widgets', '0001_widget_name'])
    expect(await columns(client, 'widgets')).toEqual(['id', 'name'])
    expect(await ledger(client)).toEqual(['0000_widgets', '0001_widget_name'])
    expect(await applyPending(client, migrations)).toEqual([])
  })

  it('applies a batch atomically — one failure leaves no partial schema behind', async () => {
    const broken = await writeMigrations({
      ...FIXTURES,
      '0002_broken': { up: 'create table half (id int); select * from missing_table;', down: 'drop table half;' },
    })
    await expect(applyPending(client, await loadMigrations(broken))).rejects.toThrow(/missing_table/)
    expect(await ledger(client)).toEqual([])
    expect(await columns(client, 'widgets')).toEqual([])
    expect(await columns(client, 'half')).toEqual([])
  })

  it('rolls back the last n migrations with their down.sql', async () => {
    const migrations = await loadMigrations(dir)
    await applyPending(client, migrations)

    expect(await rollback(client, migrations, 1)).toEqual(['0001_widget_name'])
    expect(await columns(client, 'widgets')).toEqual(['id'])
    expect(await ledger(client)).toEqual(['0000_widgets'])

    expect(await rollback(client, migrations, 1)).toEqual(['0000_widgets'])
    expect(await columns(client, 'widgets')).toEqual([])

    await expect(rollback(client, migrations, 1)).rejects.toThrow(MigrationStateError)
  })

  it('detects an edited applied migration and refuses to apply or roll back past it', async () => {
    await applyPending(client, await loadMigrations(dir))
    await writeFile(join(dir, '0000_widgets', 'up.sql'), 'create table widgets (id bigint primary key);')
    const edited = await loadMigrations(dir)

    const status = await readStatus(client, edited)
    expect(status.drifted).toEqual(['0000_widgets'])
    await expect(applyPending(client, edited)).rejects.toThrow(/drift/i)
    await expect(rollback(client, edited, 1)).rejects.toThrow(/drift/i)
  })

  it('serialises concurrent runs with an advisory lock', async () => {
    const other = new Client({ connectionString: database.url })
    await other.connect()
    try {
      const migrations = await loadMigrations(dir)
      const [a, b] = await Promise.all([applyPending(client, migrations), applyPending(other, migrations)])
      expect([...a, ...b].sort()).toEqual(['0000_widgets', '0001_widget_name'])
      expect(await ledger(client)).toEqual(['0000_widgets', '0001_widget_name'])
    } finally {
      await other.end()
    }
  })

  it('--dry-run prints the SQL and the lock warnings, and writes nothing', async () => {
    const stdout: string[] = []
    const io: CliIo = { out: (line) => stdout.push(line), err: (line) => stdout.push(line) }
    expect(await runMigrateCli(['--dry-run', '--dir', dir], io, { DATABASE_URL: database.url })).toBe(0)
    const output = stdout.join('\n')
    expect(output).toContain('-- 0000_widgets')
    expect(output).toContain('create table widgets (id int primary key);')
    expect(output).toMatch(/ACCESS EXCLUSIVE: alter table widgets add column name text/)
    expect(await ledger(client)).toEqual([])
    expect(await columns(client, 'widgets')).toEqual([])
  })

  it('--status exits 1 when an applied migration is missing from disk', async () => {
    await applyPending(client, await loadMigrations(dir))
    const fewer = await writeMigrations({ '0000_widgets': FIXTURES['0000_widgets'] })
    const lines: string[] = []
    const io: CliIo = { out: (line) => lines.push(line), err: (line) => lines.push(line) }
    expect(await runMigrateCli(['--status', '--dir', fewer], io, { DATABASE_URL: database.url })).toBe(1)
    expect(lines.join('\n')).toMatch(/orphaned\s+0001_widget_name/)
  })
})
