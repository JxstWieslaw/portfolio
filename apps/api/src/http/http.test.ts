import { Controller, Get, Module, Query, UseInterceptors } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { problemDetailsSchema } from '@repo/contracts'
import { testEnv } from '../../test/support/env'
import { createApp } from '../app'
import { AppModule } from '../app.module'
import { PUBLIC_CACHE_CONTROL, PublicCacheInterceptor } from './cache'
import { ULID_PATTERN } from './request-id'
import { ZodValidationPipe } from './validation'

const querySchema = z.object({ limit: z.coerce.number().int().max(5).default(1) }).strict()

@Controller('fixture')
class FixtureController {
  @Get('items')
  @UseInterceptors(PublicCacheInterceptor)
  items(@Query(new ZodValidationPipe(querySchema)) query: z.output<typeof querySchema>) {
    return { limit: query.limit }
  }

  @Get('boom')
  boom(): never {
    throw new Error('database password is hunter2')
  }
}

describe('HTTP behaviour shared by every route', () => {
  const env = testEnv({ CORS_PREVIEW_ORIGIN_PATTERN: '^https://portfolio-[a-z0-9-]+\\.vercel\\.app$' })
  let app: NestExpressApplication
  let http: ReturnType<typeof request>

  beforeAll(async () => {
    @Module({ imports: [AppModule.forRoot(env)], controllers: [FixtureController] })
    class FixtureModule {}
    app = await createApp(env, { module: FixtureModule })
    await app.init()
    http = request(app.getHttpServer())
  })

  afterAll(async () => {
    await app.close()
  })

  describe('request IDs', () => {
    it('issues a ULID and echoes it', async () => {
      const response = await http.get('/fixture/items').expect(200)
      expect(response.headers['x-request-id']).toMatch(ULID_PATTERN)
    })

    it('reuses an incoming ULID and replaces anything else', async () => {
      const id = '01J8Z3K4M5N6P7Q8R9S0T1V2W3'
      expect((await http.get('/fixture/items').set('X-Request-Id', id)).headers['x-request-id']).toBe(id)
      // A literal newline can't even be sent as an HTTP header value (Node's client rejects it
      // before the request goes out), so this checks the same replace-if-not-a-ULID behaviour
      // with an ordinary non-ULID string instead.
      const injected = await http.get('/fixture/items').set('X-Request-Id', 'forged-log-line')
      expect(injected.headers['x-request-id']).toMatch(ULID_PATTERN)
    })
  })

  describe('caching', () => {
    it('marks public reads cacheable and answers a matching If-None-Match with 304', async () => {
      const first = await http.get('/fixture/items').expect(200)
      expect(first.headers['cache-control']).toBe(PUBLIC_CACHE_CONTROL)
      const etag = first.headers['etag']
      expect(etag).toMatch(/^"/)
      await http.get('/fixture/items').set('If-None-Match', String(etag)).expect(304)
    })
  })

  describe('Problem Details', () => {
    it('returns 422 for an invalid query, with the issue path', async () => {
      const response = await http.get('/fixture/items?limit=9').expect(422)
      expect(response.headers['content-type']).toMatch(/^application\/problem\+json/)
      expect(response.headers['cache-control']).toBe('no-store')
      const problem = problemDetailsSchema.parse(JSON.parse(response.text))
      expect(problem).toMatchObject({
        type: 'http://api.test/problems/validation-failed',
        status: 422,
        instance: '/fixture/items',
        requestId: response.headers['x-request-id'],
      })
      expect(problem.errors?.[0]?.path).toEqual(['limit'])
    })

    it('rejects unknown query parameters', async () => {
      await http.get('/fixture/items?sort=name').expect(422)
    })

    it('returns 404 for an unknown route', async () => {
      const response = await http.get('/v1/nope').expect(404)
      expect(problemDetailsSchema.parse(JSON.parse(response.text)).type).toBe('http://api.test/problems/not-found')
    })

    it('returns a generic 500 that leaks neither the message nor a stack', async () => {
      const response = await http.get('/fixture/boom').expect(500)
      expect(response.text).not.toContain('hunter2')
      expect(response.text).not.toContain('at ')
      expect(JSON.parse(response.text).detail).toBe('An unexpected error occurred.')
    })
  })

  describe('CORS', () => {
    it('allows a listed origin and a preview deploy', async () => {
      const listed = await http.get('/fixture/items').set('Origin', 'https://allowed.test')
      expect(listed.headers['access-control-allow-origin']).toBe('https://allowed.test')
      const preview = await http.get('/fixture/items').set('Origin', 'https://portfolio-git-x.vercel.app')
      expect(preview.headers['access-control-allow-origin']).toBe('https://portfolio-git-x.vercel.app')
    })

    it('gives any other origin no CORS grant, including on preflight', async () => {
      const simple = await http.get('/fixture/items').set('Origin', 'https://evil.example')
      expect(simple.headers['access-control-allow-origin']).toBeUndefined()
      const preflight = await http
        .options('/fixture/items')
        .set('Origin', 'https://evil.example')
        .set('Access-Control-Request-Method', 'GET')
      expect(preflight.headers['access-control-allow-origin']).toBeUndefined()
    })

    it('never allows credentials', async () => {
      const response = await http.get('/fixture/items').set('Origin', 'https://allowed.test')
      expect(response.headers['access-control-allow-credentials']).toBeUndefined()
    })
  })

  describe('security headers', () => {
    it('sends helmet headers with a CSP, except under /docs', async () => {
      const api = await http.get('/fixture/items')
      expect(api.headers['strict-transport-security']).toBeDefined()
      expect(api.headers['x-content-type-options']).toBe('nosniff')
      expect(api.headers['content-security-policy']).toBeDefined()
      const docs = await http.get('/docs/anything')
      expect(docs.headers['content-security-policy']).toBeUndefined()
    })
  })
})
