import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { type Page, problemDetailsSchema, type Project, resolveDerivedKpis } from '@repo/contracts'
import { createApp } from '../../src/app'
import type { ContentBundle } from '../../src/content/source'
import { PUBLIC_CACHE_CONTROL } from '../../src/http/cache'
import { createTestDatabase, type TestDatabase } from '../support/database'
import { testEnv } from '../support/env'
import { migrateToLatest } from '../support/migrate'
import { seededDatabase } from '../support/seeded'

const byOrder = (a: Project, b: Project) => a.order - b.order

describe('public content API', () => {
  let database: TestDatabase
  let bundle: ContentBundle
  let app: NestExpressApplication
  let http: ReturnType<typeof request>

  beforeAll(async () => {
    ;({ database, bundle } = await seededDatabase())
    app = await createApp(testEnv({ DATABASE_URL: database.url }))
    await app.init()
    http = request(app.getHttpServer())
  })

  afterAll(async () => {
    await app.close()
    await database.drop()
  })

  describe('round trip: every read equals what git says', () => {
    it('GET /v1/profile', async () => {
      const response = await http.get('/v1/profile').expect(200)
      expect(response.body).toEqual(resolveDerivedKpis(bundle.profile, bundle.projects))
    })

    it('GET /v1/domains, /v1/experience, /v1/skills', async () => {
      expect((await http.get('/v1/domains').expect(200)).body).toEqual(bundle.domains)
      expect((await http.get('/v1/experience').expect(200)).body).toEqual(bundle.experience)
      expect((await http.get('/v1/skills').expect(200)).body).toEqual(bundle.skills)
    })

    it('GET /v1/projects returns every project on one default page', async () => {
      const page = (await http.get('/v1/projects').expect(200)).body as Page<Project>
      expect(page.data).toEqual([...bundle.projects].sort(byOrder))
      expect(page.nextCursor).toBeNull()
    })

    it('GET /v1/projects/:slug', async () => {
      const project = bundle.projects[0]
      expect((await http.get(`/v1/projects/${project?.slug}`).expect(200)).body).toEqual(project)
    })
  })

  describe('projects query', () => {
    it('follows cursors to the end', async () => {
      const slugs: string[] = []
      let path = '/v1/projects?limit=3'
      for (let guard = 0; guard < 20; guard++) {
        const page = (await http.get(path).expect(200)).body as Page<Project>
        slugs.push(...page.data.map((p) => p.slug))
        if (page.nextCursor === null) break
        path = `/v1/projects?limit=3&cursor=${page.nextCursor}`
      }
      expect(slugs).toEqual([...bundle.projects].sort(byOrder).map((p) => p.slug))
    })

    it('filters by featured and by domain', async () => {
      const featured = (await http.get('/v1/projects?featured=true').expect(200)).body as Page<Project>
      expect(featured.data.map((p) => p.slug)).toEqual(
        bundle.projects.filter((p) => p.featured).sort(byOrder).map((p) => p.slug),
      )
      const domain = bundle.projects[0]?.domain ?? ''
      const inDomain = (await http.get(`/v1/projects?domain=${domain}`).expect(200)).body as Page<Project>
      expect(inDomain.data.every((p) => p.domain === domain)).toBe(true)
    })

    it.each([
      ['limit=0', 'limit'],
      ['limit=51', 'limit'],
      ['featured=yes', 'featured'],
      ['cursor=nope', 'cursor'],
    ])('answers ?%s with 422 naming %s', async (query, field) => {
      const response = await http.get(`/v1/projects?${query}`).expect(422)
      const problem = problemDetailsSchema.parse(JSON.parse(response.text))
      expect(problem.errors?.map((error) => error.path[0])).toContain(field)
    })

    it('rejects unknown parameters with 422', async () => {
      await http.get('/v1/projects?sort=name').expect(422)
    })
  })

  describe('single project errors', () => {
    it('404s an unknown slug as Problem Details', async () => {
      const response = await http.get('/v1/projects/does-not-exist').expect(404)
      expect(response.headers['content-type']).toMatch(/^application\/problem\+json/)
      expect(problemDetailsSchema.parse(JSON.parse(response.text)).instance).toBe('/v1/projects/does-not-exist')
    })

    it('422s a slug that could never exist', async () => {
      await http.get('/v1/projects/Not%20Kebab').expect(422)
    })
  })

  describe('HTTP caching', () => {
    it('sends public cache headers and honours If-None-Match', async () => {
      const first = await http.get('/v1/projects').expect(200)
      expect(first.headers['cache-control']).toBe(PUBLIC_CACHE_CONTROL)
      await http.get('/v1/projects').set('If-None-Match', String(first.headers['etag'])).expect(304)
    })

    it('answers HEAD without a body', async () => {
      const response = await http.head('/v1/profile').expect(200)
      expect(response.text ?? '').toBe('')
    })
  })
})

describe('public content API before the first seed', () => {
  it('404s the profile instead of inventing one', async () => {
    const database = await createTestDatabase(inject('databaseUrl'))
    await migrateToLatest(database.url)
    const app = await createApp(testEnv({ DATABASE_URL: database.url }))
    await app.init()
    try {
      await request(app.getHttpServer()).get('/v1/profile').expect(404)
      expect((await request(app.getHttpServer()).get('/v1/projects').expect(200)).body).toEqual({
        data: [],
        nextCursor: null,
      })
    } finally {
      await app.close()
      await database.drop()
    }
  })
})
