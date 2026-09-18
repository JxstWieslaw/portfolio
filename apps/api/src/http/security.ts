import type { RequestHandler } from 'express'
import helmet from 'helmet'

/**
 * helmet everywhere (HSTS, nosniff, frame protections, CSP). Swagger UI at /docs ships inline
 * scripts and styles, so only that path runs without a Content-Security-Policy.
 */
export function securityHeaders(): RequestHandler {
  const strict = helmet()
  const docs = helmet({ contentSecurityPolicy: false })
  return (req, res, next) =>
    req.path === '/docs' || req.path.startsWith('/docs/') ? docs(req, res, next) : strict(req, res, next)
}
