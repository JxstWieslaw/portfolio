import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadMigrations } from './load'

const API_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const DRIZZLE_DIR = join(API_ROOT, 'drizzle')
const MIGRATIONS_DIR = join(API_ROOT, 'migrations')

describe('migrations mirror Drizzle Kit', () => {
  it('has exactly one runnable migration per generated file, with identical up.sql', async () => {
    const generated = (await readdir(DRIZZLE_DIR)).filter((name) => name.endsWith('.sql')).sort()
    const migrations = await loadMigrations(MIGRATIONS_DIR)

    expect(migrations.map((m) => `${m.id}.sql`)).toEqual(generated)
    for (const migration of migrations) {
      const sql = (await readFile(join(DRIZZLE_DIR, `${migration.id}.sql`), 'utf8')).replace(/\r\n/g, '\n')
      expect(migration.up, `${migration.id}/up.sql must equal drizzle/${migration.id}.sql`).toBe(sql)
    }
  })
})
