import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { drizzle } from 'drizzle-orm/node-postgres'
import { createPool } from '../db/connection'
import type { CliIo } from '../db/migrations/cli'
import { schema } from '../db/schema'
import { detectDrift, runSeed, type SeedPlan } from './seed'
import { type ContentBundle, ContentIntegrityError, loadContentFromDir } from './source'

const USAGE = [
  'Usage: pnpm --filter @repo/api db:seed <mode> [--content-dir <path>] [--git-sha <sha>]',
  '  --dry-run   plan against the database; write only the seed_runs record',
  '  --apply     apply the plan in one transaction',
  '  --check     exit 1 if the database differs from git',
].join('\n')

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    strict: true,
    options: {
      'dry-run': { type: 'boolean' },
      apply: { type: 'boolean' },
      check: { type: 'boolean' },
      'content-dir': { type: 'string' },
      'git-sha': { type: 'string' },
    },
  }).values
}

function printPlan(io: CliIo, plan: SeedPlan): void {
  for (const [table, p] of Object.entries(plan)) {
    io.out(
      `${table.padEnd(12)} +${p.inserted.length} ~${p.updated.length} -${p.deleted.length} =${p.unchanged}` +
        (p.deleted.length > 0 ? `  deleting: ${p.deleted.join(', ')}` : ''),
    )
  }
}

/** Exit codes: 0 ok · 1 drift (--check) or invalid content · 2 usage error. */
export async function runSeedCli(argv: string[], io: CliIo, env: NodeJS.ProcessEnv): Promise<number> {
  let values: ReturnType<typeof parse>
  try {
    values = parse(argv)
  } catch (error) {
    io.err(`${(error as Error).message}\n${USAGE}`)
    return 2
  }
  if ([values['dry-run'], values.apply, values.check].filter(Boolean).length !== 1) {
    io.err(USAGE)
    return 2
  }
  const url = env['DATABASE_URL']
  if (url === undefined || !/^postgres(ql)?:\/\//.test(url)) {
    io.err('DATABASE_URL must be a postgres:// connection string')
    return 2
  }

  // Scripts run with apps/api as cwd; the repository's content/ is two levels up.
  const contentDir = resolve(values['content-dir'] ?? '../../content')
  let bundle: ContentBundle
  try {
    bundle = await loadContentFromDir(contentDir)
  } catch (error) {
    if (error instanceof ContentIntegrityError) {
      io.err(error.message)
      return 1
    }
    throw error
  }

  const pool = createPool(url, 1)
  const db = drizzle(pool, { schema })
  try {
    if (values.check) {
      const drifted = await detectDrift(db, bundle)
      io.out(drifted ? 'Database content differs from git.' : 'Database content matches git.')
      return drifted ? 1 : 0
    }
    const outcome = await runSeed(db, bundle, {
      gitSha: values['git-sha'] ?? env['GITHUB_SHA'] ?? 'local',
      dryRun: values['dry-run'] === true,
    })
    printPlan(io, outcome.plan)
    io.out(`${outcome.dryRun ? 'Dry run' : 'Applied'} · content ${outcome.contentHash.slice(0, 12)} · seed_runs #${outcome.seedRunId}`)
    return 0
  } finally {
    await pool.end()
  }
}
