import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface Migration {
  /** Directory name, e.g. `0000_content_tables`. Sorting ids sorts migrations. */
  id: string
  up: string
  down: string
  /** sha256 of `up.sql` and `down.sql` with LF line endings. A changed applied migration is drift. */
  checksum: string
}

export class MigrationLayoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationLayoutError'
  }
}

const ID_PATTERN = /^(\d{4})_[a-z0-9_]+$/
const ALLOWED_FILES = new Set(['README.md'])

function normalize(sql: string): string {
  return sql.replace(/\r\n/g, '\n')
}

function hasStatements(sql: string): boolean {
  // Strip block comments (/* ... */, including multi-line) then line comments (--)
  const noBlockComments = sql.replace(/\/\*[\s\S]*?\*\//g, '')
  return noBlockComments.split('\n').some((line) => line.replace(/--.*$/, '').trim() !== '')
}

export function checksumOf(sql: string): string {
  return createHash('sha256').update(normalize(sql)).digest('hex')
}

async function readRequired(path: string, missingMessage: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new MigrationLayoutError(missingMessage)
    throw error
  }
}

/**
 * Reads `<dir>/NNNN_name/{up,down}.sql`. Enforces the reversibility policy (spec §6): a missing
 * or empty down.sql is a layout error, which fails `db:migrate --verify` and therefore CI.
 */
export async function loadMigrations(dir: string): Promise<Migration[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const migrations: Migration[] = []
  const prefixes = new Set<string>()

  for (const entry of entries) {
    if (entry.isFile()) {
      if (ALLOWED_FILES.has(entry.name)) continue
      throw new MigrationLayoutError(`Unexpected file ${entry.name} in ${dir}: migrations are directories`)
    }
    if (!entry.isDirectory()) continue

    const match = ID_PATTERN.exec(entry.name)
    if (match === null) {
      throw new MigrationLayoutError(`${entry.name}: migration directories must match NNNN_snake_name`)
    }
    const prefix = match[1] ?? ''
    if (prefixes.has(prefix)) throw new MigrationLayoutError(`Two migrations share the prefix ${prefix}`)
    prefixes.add(prefix)

    const up = await readRequired(join(dir, entry.name, 'up.sql'), `${entry.name} has no up.sql`)
    const down = await readRequired(
      join(dir, entry.name, 'down.sql'),
      `${entry.name} has no down.sql — every migration must be reversible`,
    )
    if (!hasStatements(up)) throw new MigrationLayoutError(`${entry.name}/up.sql has no statements`)
    if (!hasStatements(down)) {
      throw new MigrationLayoutError(`${entry.name}/down.sql has no statements — write the SQL that undoes up.sql`)
    }

    migrations.push({ id: entry.name, up: normalize(up), down: normalize(down), checksum: checksumOf(normalize(up) + '\n' + normalize(down)) })
  }

  return migrations.sort((a, b) => a.id.localeCompare(b.id))
}
