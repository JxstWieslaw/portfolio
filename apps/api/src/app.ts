import 'reflect-metadata'
import type { DynamicModule } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module'
import type { Env } from './config/env'
import { corsOptions } from './http/cors'
import { ProblemDetailsFilter } from './http/problem-details'
import { requestId } from './http/request-id'
import { securityHeaders } from './http/security'
import { setupOpenApi } from './openapi/openapi'

/**
 * Builds the fully configured application without listening. Every global — logging, headers,
 * CORS, errors, OpenAPI — is applied here and only here, so tests exercise exactly what ships.
 * `root` exists for tests, which wrap `AppModule.forRoot(env)` with fixture controllers.
 */
export async function createApp(
  env: Env,
  root: DynamicModule = AppModule.forRoot(env),
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(root, { bufferLogs: true })
  app.useLogger(app.get(Logger))

  // Strong ETags; Express answers a matching If-None-Match with 304 on its own.
  app.set('etag', 'strong')
  app.disable('x-powered-by')
  // Cloud Run terminates TLS in front of the container.
  app.set('trust proxy', true)

  // Order matters: the request ID must exist before the logger and the filter read it.
  app.use(requestId)
  app.use(securityHeaders())
  app.enableCors(corsOptions(env))
  app.useGlobalFilters(new ProblemDetailsFilter(env.PUBLIC_BASE_URL))

  setupOpenApi(app, env)

  // SIGTERM → stop accepting, drain, run onApplicationShutdown hooks (Cloud Run allows 10 s).
  app.enableShutdownHooks()

  return app
}
