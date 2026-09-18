import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface'
import type { Env } from '../config/env'

export function isAllowedOrigin(origin: string, allowlist: readonly string[], previewPattern?: RegExp): boolean {
  return allowlist.includes(origin) || (previewPattern?.test(origin) ?? false)
}

/**
 * Strict allowlist, credentials off. A disallowed origin still gets its response — browsers
 * enforce CORS — it simply receives no Access-Control-Allow-Origin header.
 */
export function corsOptions(env: Env): CorsOptions {
  return {
    origin: (origin, callback) => {
      callback(
        null,
        origin !== undefined && isAllowedOrigin(origin, env.CORS_ORIGINS, env.CORS_PREVIEW_ORIGIN_PATTERN),
      )
    },
    methods: ['GET', 'HEAD', 'OPTIONS'],
    credentials: false,
    exposedHeaders: ['ETag', 'X-Request-Id'],
    maxAge: 600,
  }
}
