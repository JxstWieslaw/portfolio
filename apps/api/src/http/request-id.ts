import type { NextFunction, Request, Response } from 'express'
import { ulid } from 'ulid'

export const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/

export interface RequestWithId extends Request {
  id: string
}

/**
 * One ULID per request, echoed as X-Request-Id, logged on every line and carried in every error
 * body. An incoming ID is reused only when it is itself a ULID, so a caller cannot inject
 * arbitrary text into logs.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id')
  const id = incoming !== undefined && ULID_PATTERN.test(incoming) ? incoming : ulid()
  ;(req as RequestWithId).id = id
  res.setHeader('X-Request-Id', id)
  next()
}
