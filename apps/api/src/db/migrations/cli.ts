import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { Client } from 'pg'
import { loadMigrations, type Migration, MigrationLayoutError } from './load'
import { accessExclusiveStatements } from './locks'
import { applyPending, MigrationStateError, readStatus, rollback } from './runner'

export interface CliIo {
  out(line: string): void
  err(line: string): void
}

const USAGE = [
  'Usage: pnpm --filter @repo/api db:migrate <mode> [--dir <path>]',
  '  --verify            every migration has up.sql and down.sql (no database)',
  '  --status            applied vs pending; exits 1 on drift',
  '  --dry-run           print pending SQL and ACCESS EXCLUSIVE warnings; writes nothing',
  '  --apply             apply pending migrations in one transaction',
  '  --rollback <n> --yes   run down.sql for the last n migrations',
].join('\n')

function printPlan(io: CliIo, pending: Migration[]): void {
  if (pending.length === 0) {
    io.out('Nothing to apply.')
    return
  }
  for (const migration of pending) {
    io.out(`-- ${migration.id}`)
    io.out(migration.up.trim())
    for (const statement of accessExclusiveStatements(migration.up)) {
      io.out(`-- WARNING ACCESS EXCLUSIVE: ${statement}`)
    }
  }
}

function parse(argv: string[]): {
  verify?: boolean
  status?: boolean
  'dry-run'?: boolean
  apply?: boolean
  rollback?: string
  yes?: boolean
  dir?: string
} {
  return parseArgs({
    args: argv,
    strict: true,
    options: {
      verify: { type: 'boolean' },
      status: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      apply: { type: 'boolean' },
      rollback: { type: 'string' },
      yes: { type: 'boolean' },
      dir: { type: 'string' },
    },
  }).values
}

/** Exit codes: 0 ok · 1 drift, layout or state failure · 2 usage error. */
export async function runMigrateCli(argv: string[], io: CliIo, env: NodeJS.ProcessEnv): Promise<number> {
  let values: ReturnType<typeof parse>
  try {
    values = parse(argv)
  } catch (error) {
    io.err(`${(error as Error).message}\n${USAGE}`)
    return 2
  }

  const modes = [values.verify, values.status, values['dry-run'], values.apply, values.rollback !== undefined]
  if (modes.filter(Boolean).length !== 1) {
    io.err(USAGE)
    return 2
  }
  if (values.rollback !== undefined && values.yes !== true) {
    io.err(`Refusing to roll back without --yes: this runs down.sql for the last ${values.rollback} migration(s).`)
    return 2
  }

  // Scripts run with the package as cwd, so the default resolves to apps/api/migrations.
  const dir = resolve(values.dir ?? 'migrations')
  let migrations: Migration[]
  try {
    migrations = await loadMigrations(dir)
  } catch (error) {
    if (error instanceof MigrationLayoutError) {
      io.err(error.message)
      return 1
    }
    throw error
  }

  if (values.verify) {
    io.out(`${migrations.length} migration(s), each with up.sql and down.sql.`)
    return 0
  }

  const url = env['DATABASE_URL']
  if (url === undefined || !/^postgres(ql)?:\/\//.test(url)) {
    io.err('DATABASE_URL must be a postgres:// connection string')
    return 2
  }

  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    if (values.status || values['dry-run']) {
      const status = await readStatus(client, migrations)
      if (values.status) {
        for (const entry of status.entries) io.out(`${entry.state.padEnd(8)} ${entry.id}`)
        for (const id of status.orphaned) io.out(`orphaned ${id}`)
      }
      if (status.drifted.length > 0 || status.orphaned.length > 0) {
        io.err('Migration drift detected.')
        return 1
      }
      if (values['dry-run']) printPlan(io, status.pending)
      return 0
    }

    if (values.apply) {
      const applied = await applyPending(client, migrations)
      io.out(applied.length > 0 ? `Applied: ${applied.join(', ')}` : 'Nothing to apply.')
      return 0
    }

    const rolledBack = await rollback(client, migrations, Number(values.rollback))
    io.out(`Rolled back: ${rolledBack.join(', ')}`)
    return 0
  } catch (error) {
    if (error instanceof MigrationStateError) {
      io.err(error.message)
      return 1
    }
    throw error
  } finally {
    await client.end()
  }
}
