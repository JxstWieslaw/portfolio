import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeMigrations } from '../../../test/support/migrations'
import { checksumOf, loadMigrations, MigrationLayoutError } from './load'

describe('loadMigrations', () => {
  it('loads directories in id order with a checksum of up.sql', async () => {
    const dir = await writeMigrations({
      '0001_b': { up: 'create table b (id int);', down: 'drop table b;' },
      '0000_a': { up: 'create table a (id int);', down: 'drop table a;' },
    })
    const migrations = await loadMigrations(dir)
    expect(migrations.map((m) => m.id)).toEqual(['0000_a', '0001_b'])
    expect(migrations[0]?.checksum).toBe(checksumOf('create table a (id int);'))
  })

  it('treats CRLF and LF as the same file, so a Windows checkout never reads as drift', () => {
    expect(checksumOf('create table a (id int);\r\n')).toBe(checksumOf('create table a (id int);\n'))
  })

  it('fails when a migration has no down.sql', async () => {
    const dir = await writeMigrations({ '0000_a': { up: 'create table a (id int);' } })
    await expect(loadMigrations(dir)).rejects.toThrow(/0000_a has no down\.sql/)
  })

  it('fails when down.sql holds only comments', async () => {
    const dir = await writeMigrations({ '0000_a': { up: 'create table a (id int);', down: '-- TODO\n' } })
    await expect(loadMigrations(dir)).rejects.toThrow(MigrationLayoutError)
  })

  it('rejects badly named directories, duplicate prefixes and stray files', async () => {
    await expect(
      loadMigrations(await writeMigrations({ 'add-table': { up: 'select 1;', down: 'select 1;' } })),
    ).rejects.toThrow(/NNNN_snake_name/)
    await expect(
      loadMigrations(
        await writeMigrations({
          '0000_a': { up: 'select 1;', down: 'select 1;' },
          '0000_b': { up: 'select 1;', down: 'select 1;' },
        }),
      ),
    ).rejects.toThrow(/prefix 0000/)
    const stray = await writeMigrations({ '0000_a': { up: 'select 1;', down: 'select 1;' } })
    await writeFile(join(stray, '0001_loose.sql'), 'select 1;')
    await expect(loadMigrations(stray)).rejects.toThrow(/Unexpected file/)
  })
})
