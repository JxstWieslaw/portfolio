import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createApp } from '../../src/app'
import { createTestDatabase, type TestDatabase } from '../support/database'
import { testEnv } from '../support/env'

describe('GET /v1/ready with a database', () => {
  let database: TestDatabase
  let app: NestExpressApplication

  beforeAll(async () => {
    database = await createTestDatabase(inject('databaseUrl'))
    app = await createApp(testEnv({ DATABASE_URL: database.url }))
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await database.drop()
  })

  it('answers 200 ready', async () => {
    const response = await request(app.getHttpServer()).get('/v1/ready').expect(200)
    expect(response.body).toEqual({ status: 'ready', checks: { postgres: 'ok' } })
  })
})
