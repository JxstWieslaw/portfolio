import type { NestExpressApplication } from '@nestjs/platform-express'
import type { Pool } from 'pg'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readinessSchema } from '@repo/contracts'
import { testEnv } from '../../test/support/env'
import { createApp } from '../app'
import { probePostgres } from './readiness'

describe('probePostgres', () => {
  it('reports false when the query exceeds the timeout', async () => {
    const hanging = { query: () => new Promise(() => undefined) } as unknown as Pool
    expect(await probePostgres(hanging, 20)).toBe(false)
  })

  it('reports false when the query fails', async () => {
    const failing = { query: () => Promise.reject(new Error('ECONNREFUSED')) } as unknown as Pool
    expect(await probePostgres(failing)).toBe(false)
  })
})

describe('GET /v1/ready without a database', () => {
  let app: NestExpressApplication

  beforeAll(async () => {
    app = await createApp(testEnv())
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('answers 503 so Cloud Run stops routing to the instance', async () => {
    const response = await request(app.getHttpServer()).get('/v1/ready').expect(503)
    expect(readinessSchema.parse(response.body)).toEqual({ status: 'unavailable', checks: { postgres: 'failed' } })
    expect(response.headers['cache-control']).toBe('no-store')
  })
})
