import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module'
import type { Env } from './config/env'

/**
 * Builds the fully configured application without listening. Every global — logging, headers,
 * CORS, errors, OpenAPI — is applied here and only here, so tests exercise exactly what ships.
 */
export async function createApp(env: Env): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env), {
    logger: env.NODE_ENV === 'test' ? false : ['log', 'warn', 'error'],
  })

  // Strong ETags; Express answers a matching If-None-Match with 304 on its own.
  app.set('etag', 'strong')
  app.disable('x-powered-by')
  // SIGTERM → stop accepting, drain, run onApplicationShutdown hooks (Cloud Run allows 10 s).
  app.enableShutdownHooks()

  return app
}
