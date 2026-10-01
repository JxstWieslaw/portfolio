import { describe, expect, it } from 'vitest'
import { writeMigrations } from '../../../test/support/migrations'
import { type CliIo, runMigrateCli } from './cli'

function capture(): CliIo & { stdout: string[]; stderr: string[] } {
  const stdout: string[] = []
  const stderr: string[] = []
  return { stdout, stderr, out: (line) => stdout.push(line), err: (line) => stderr.push(line) }
}

describe('db:migrate CLI — paths that need no database', () => {
  it('--verify passes when every migration is reversible', async () => {
    const dir = await writeMigrations({ '0000_a': { up: 'create table a (id int);', down: 'drop table a;' } })
    const io = capture()
    expect(await runMigrateCli(['--verify', '--dir', dir], io, {})).toBe(0)
    expect(io.stdout.join('\n')).toMatch(/1 migration/)
  })

  it('--verify fails, naming the migration, when a down.sql is missing', async () => {
    const dir = await writeMigrations({ '0000_a': { up: 'create table a (id int);' } })
    const io = capture()
    expect(await runMigrateCli(['--verify', '--dir', dir], io, {})).toBe(1)
    expect(io.stderr.join('\n')).toMatch(/0000_a has no down\.sql/)
  })

  it('requires exactly one mode', async () => {
    expect(await runMigrateCli([], capture(), {})).toBe(2)
    expect(await runMigrateCli(['--apply', '--status'], capture(), {})).toBe(2)
  })

  it('refuses a rollback without --yes', async () => {
    const dir = await writeMigrations({ '0000_a': { up: 'create table a (id int);', down: 'drop table a;' } })
    const io = capture()
    expect(await runMigrateCli(['--rollback', '1', '--dir', dir], io, { DATABASE_URL: 'postgres://x@127.0.0.1:1/x' })).toBe(2)
    expect(io.stderr.join('\n')).toMatch(/--yes/)
  })

  it('requires a postgres DATABASE_URL for database modes', async () => {
    const dir = await writeMigrations({ '0000_a': { up: 'create table a (id int);', down: 'drop table a;' } })
    const io = capture()
    expect(await runMigrateCli(['--status', '--dir', dir], io, {})).toBe(2)
    expect(io.stderr.join('\n')).toMatch(/DATABASE_URL/)
  })
})
