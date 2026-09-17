import { STATUS_CODES } from 'node:http'
import { applyDecorators } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { ApiResponse, DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger'
import type { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { problemDetailsSchema } from '@repo/contracts'
import type { Env } from '../config/env'

export const OPENAPI_JSON_PATH = 'v1/openapi.json'

type SchemaObject = Record<string, unknown>

/** One schema, three uses: request validation, this document, and the web app's types. */
export function zodToOpenApi(schema: z.ZodTypeAny): SchemaObject {
  return zodToJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' }) as SchemaObject
}

/** Documents RFC 9457 error responses for the given statuses. */
export function ApiProblem(...statuses: number[]): ReturnType<typeof applyDecorators> {
  const schema = zodToOpenApi(problemDetailsSchema)
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: STATUS_CODES[status] ?? 'Error',
        content: { 'application/problem+json': { schema } },
      }),
    ),
  )
}

export function buildOpenApiDocument(app: NestExpressApplication, env: Env): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Portfolio API')
    .setDescription(
      "Public read API behind Wieslaw Samushonga's portfolio. Content is seeded from the site's git " +
        'repository and served with strong ETags and CDN cache headers. Every error is RFC 9457 ' +
        'Problem Details (`application/problem+json`) carrying the request ID from `X-Request-Id`.',
    )
    .setVersion('1.0.0')
    .addServer(env.PUBLIC_BASE_URL)
    .build()
  return SwaggerModule.createDocument(app, config)
}

export function setupOpenApi(app: NestExpressApplication, env: Env): void {
  SwaggerModule.setup('docs', app, buildOpenApiDocument(app, env), {
    jsonDocumentUrl: OPENAPI_JSON_PATH,
    raw: ['json'],
    customSiteTitle: 'Portfolio API',
  })
}
