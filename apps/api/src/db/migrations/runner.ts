import type { ClientBase } from 'pg'
import type { Migration } from './load'

/** Arbitrary but fixed: every runner in every process contends for the same lock. */
const ADVISORY_LOCK_KEY = 72_610_001

export class MigrationStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationStateError'
  }
}

export interface MigrationStatus {
  entries: { id: string; state: 'applied' | 'pending' | 'drifted' }[]
  pending: Migration[]
  /** Applied, but up.sql on disk no longer matches the recorded checksum. */
  drifted: string[]
  /** Recorded as applied, but no longer on disk. */
  orphaned: string[]
}

async function ensureLedger(client: ClientBase): Promise<void> {
  await client.query(
    `create table if not exists schema_migrations (
       id text primary key,
       checksum text not null,
       applied_at timestamptz not null default now()
     )`,
  )
}

async function appliedChecksums(client: ClientBase): Promise<Map<string, string>> {
  const exists = await client.query<{ t: string | null }>(`select to_regclass('public.schema_migrations') as t`)
  if (exists.rows[0]?.t === null) return new Map()
  const result = await client.query<{ id: string; checksum: string }>('select id, checksum from schema_migrations')
  return new Map(result.rows.map((row) => [row.id, row.checksum]))
}

/** Read-only: never creates the ledger, so --status and --dry-run write nothing. */
export async function readStatus(client: ClientBase, migrations: Migration[]): Promise<MigrationStatus> {
  const applied = await appliedChecksums(client)
  const onDisk = new Set(migrations.map((m) => m.id))
  const status: MigrationStatus = { entries: [], pending: [], drifted: [], orphaned: [] }

  for (const migration of migrations) {
    const checksum = applied.get(migration.id)
    if (checksum === undefined) {
      status.entries.push({ id: migration.id, state: 'pending' })
      status.pending.push(migration)
    } else if (checksum !== migration.checksum) {
      status.entries.push({ id: migration.id, state: 'drifted' })
      status.drifted.push(migration.id)
    } else {
      status.entries.push({ id: migration.id, state: 'applied' })
    }
  }
  status.orphaned = [...applied.keys()].filter((id) => !onDisk.has(id)).sort()
  return status
}

function assertNoDrift(status: MigrationStatus): void {
  if (status.drifted.length > 0 || status.orphaned.length > 0) {
    throw new MigrationStateError(
      `Migration drift — refusing to continue. Edited after apply: [${status.drifted.join(', ')}]; ` +
        `applied but missing on disk: [${status.orphaned.join(', ')}].`,
    )
  }
}

async function withLock<T>(client: ClientBase, work: () => Promise<T>): Promise<T> {
  await client.query('select pg_advisory_lock($1)', [ADVISORY_LOCK_KEY])
  try {
    return await work()
  } finally {
    await client.query('select pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY])
  }
}

async function inTransaction(client: ClientBase, work: () => Promise<void>): Promise<void> {
  await client.query('begin')
  try {
    await work()
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  }
}

/**
 * Applies every pending migration in one transaction, so a deploy lands all of them or none.
 * (Consequence: statements that cannot run in a transaction, such as CREATE INDEX CONCURRENTLY,
 * are not supported by this runner.)
 */
export async function applyPending(client: ClientBase, migrations: Migration[]): Promise<string[]> {
  return withLock(client, async () => {
    await ensureLedger(client)
    const status = await readStatus(client, migrations)
    assertNoDrift(status)
    await inTransaction(client, async () => {
      for (const migration of status.pending) {
        await client.query(migration.up)
        await client.query('insert into schema_migrations (id, checksum) values ($1, $2)', [
          migration.id,
          migration.checksum,
        ])
      }
    })
    return status.pending.map((migration) => migration.id)
  })
}

/** Runs down.sql for the last `count` applied migrations, newest first, in one transaction. */
export async function rollback(client: ClientBase, migrations: Migration[], count: number): Promise<string[]> {
  if (!Number.isInteger(count) || count < 1) {
    throw new MigrationStateError('Rollback count must be a positive integer')
  }
  return withLock(client, async () => {
    await ensureLedger(client)
    assertNoDrift(await readStatus(client, migrations))

    const applied = await client.query<{ id: string }>(
      'select id from schema_migrations order by applied_at desc, id desc',
    )
    if (count > applied.rows.length) {
      throw new MigrationStateError(`Cannot roll back ${count}: only ${applied.rows.length} applied`)
    }

    const byId = new Map(migrations.map((migration) => [migration.id, migration]))
    const targets = applied.rows.slice(0, count).map((row) => {
      const migration = byId.get(row.id)
      // Unreachable after assertNoDrift, which rejects orphaned rows; kept as a type guard.
      if (migration === undefined) throw new MigrationStateError(`${row.id} is not on disk`)
      return migration
    })

    await inTransaction(client, async () => {
      for (const migration of targets) {
        await client.query(migration.down)
        await client.query('delete from schema_migrations where id = $1', [migration.id])
      }
    })
    return targets.map((migration) => migration.id)
  })
}
