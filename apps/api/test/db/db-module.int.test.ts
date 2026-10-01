import type { NestExpressApplication } from '@nestjs/platform-express'
import type { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createApp } from '../../src/app'
import { PG_POOL } from '../../src/db/db.module'
import { createTestDatabase, type TestDatabase } from '../support/database'
import { testEnv } from '../support/env'

describe('DbModule', () => {
  let database: TestDatabase
  let app: NestExpressApplication

  beforeAll(async () => {
    database = await createTestDatabase(inject('databaseUrl'))
    app = await createApp(testEnv({ DATABASE_URL: database.url }))
    await app.init()
  })

  afterAll(async () => {
    await database.drop()
  })

  it('reaches Postgres through the pooled connection', async () => {
    const pool = app.get<Pool>(PG_POOL)
    const result = await pool.query<{ one: number }>('select 1 as one')
    expect(result.rows[0]?.one).toBe(1)
  })

  it('ends the pool when the application shuts down', async () => {
    const pool = app.get<Pool>(PG_POOL)
    await app.close()
    expect(pool.ended).toBe(true)
  })
})
