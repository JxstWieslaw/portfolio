import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testEnv } from '../../test/support/env'
import { createApp } from '../app'
import { buildOpenApiDocument } from './openapi'

describe('OpenAPI', () => {
  // A fixed base URL keeps the snapshot independent of whoever runs the test.
  const env = testEnv({ PUBLIC_BASE_URL: 'https://api.example.dev' })
  let app: NestExpressApplication

  beforeAll(async () => {
    app = await createApp(env)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('matches the committed contract snapshot', async () => {
    const document = buildOpenApiDocument(app, env)
    // To accept an intended change: pnpm --filter @repo/api exec vitest run --project unit -u
    await expect(`${JSON.stringify(document, null, 2)}\n`).toMatchFileSnapshot('../../openapi.snapshot.json')
  })

  it('documents every public read with a JSON schema for its 200 response', () => {
    const document = buildOpenApiDocument(app, env)
    const paths = [
      '/v1/health',
      '/v1/ready',
      '/v1/profile',
      '/v1/domains',
      '/v1/experience',
      '/v1/skills',
      '/v1/projects',
      '/v1/projects/{slug}',
    ]
    for (const path of paths) {
      const schema = document.paths[path]?.get?.responses['200']
      expect(schema, `${path} documents a 200`).toBeDefined()
      expect(JSON.stringify(schema), `${path} carries a schema`).toContain('"schema"')
    }
  })

  it('documents errors as Problem Details', () => {
    const document = buildOpenApiDocument(app, env)
    const responses = document.paths['/v1/projects']?.get?.responses ?? {}
    expect(Object.keys(responses)).toContain('422')
    expect(JSON.stringify(responses['422'])).toContain('application/problem+json')
    const parameters = (document.paths['/v1/projects']?.get?.parameters ?? []) as { name: string }[]
    expect(parameters.map((parameter) => parameter.name).sort()).toEqual(['cursor', 'domain', 'featured', 'limit'])
  })

  it('serves the JSON document and the Swagger UI', async () => {
    const json = await request(app.getHttpServer()).get('/v1/openapi.json').expect(200)
    expect(json.body.openapi).toMatch(/^3\./)
    expect(json.body.info.title).toBe('Portfolio API')
    const ui = await request(app.getHttpServer()).get('/docs').redirects(1).expect(200)
    expect(ui.text).toContain('swagger-ui')
  })
})
