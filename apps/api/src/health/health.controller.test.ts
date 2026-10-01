import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { healthSchema } from '@repo/contracts'
import { testEnv } from '../../test/support/env'
import { createApp } from '../app'

describe('GET /v1/health', () => {
  let app: NestExpressApplication

  beforeAll(async () => {
    app = await createApp(testEnv())
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('answers without touching any dependency', async () => {
    const response = await request(app.getHttpServer()).get('/v1/health').expect(200)
    expect(healthSchema.parse(response.body)).toEqual({ status: 'ok' })
  })

  it('is never cached', async () => {
    const response = await request(app.getHttpServer()).get('/v1/health')
    expect(response.headers['cache-control']).toBe('no-store')
  })

  it('does not advertise the framework', async () => {
    const response = await request(app.getHttpServer()).get('/v1/health')
    expect(response.headers['x-powered-by']).toBeUndefined()
  })
})
