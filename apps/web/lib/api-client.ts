/**
 * Client for the portfolio API (apps/api, Cloud Run).
 *
 * The API is never on the render path: pages are built from git content (see `content.ts`) and a
 * cold visitor's render must not wait on Cloud Run. Import this only from code that runs after
 * hydration, such as a form submit or a beacon, never from a server component that renders a page.
 *
 * `NEXT_PUBLIC_API_URL` is the only setting. When it is unset or malformed the client reports
 * "unconfigured" and callers fall back (the contact form keeps its mailto path), so the site
 * works with the API absent.
 */

import { healthSchema, problemDetailsSchema, readinessSchema, type ProblemDetails, type Readiness } from '@repo/contracts'
import type { z } from 'zod'

const DEFAULT_TIMEOUT_MS = 5000

/** The API origin without a trailing slash, or null when it is unset or not an http(s) URL. */
export function apiBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.origin + url.pathname.replace(/\/+$/, '')
  } catch {
    return null
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: 'unconfigured' | 'network' | 'timeout' | 'http' | 'invalid-response',
    readonly status?: number,
    readonly problem?: ProblemDetails,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface ApiRequest {
  method?: 'GET' | 'POST'
  body?: unknown
  timeoutMs?: number
  signal?: AbortSignal
}

/**
 * Calls `path` (for example `/v1/ready`) and parses the JSON body with `schema`.
 * Rejects with an `ApiError`; it never returns unvalidated data.
 */
export async function apiRequest<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS, signal }: ApiRequest = {},
): Promise<z.output<S>> {
  const base = apiBaseUrl()
  if (!base) throw new ApiError('NEXT_PUBLIC_API_URL is not set to an http(s) URL', 'unconfigured')

  const timeout = AbortSignal.timeout(timeoutMs)
  let response: Response
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
  } catch (error) {
    if (timeout.aborted) throw new ApiError(`API did not answer within ${timeoutMs} ms`, 'timeout')
    throw new ApiError(error instanceof Error ? error.message : 'Network error', 'network')
  }

  const payload: unknown = await response.json().catch(() => undefined)

  if (!response.ok) {
    const problem = problemDetailsSchema.safeParse(payload)
    throw new ApiError(
      problem.success ? problem.data.title : `API answered ${response.status}`,
      'http',
      response.status,
      problem.success ? problem.data : undefined,
    )
  }

  const parsed = schema.safeParse(payload)
  if (!parsed.success) throw new ApiError('API response did not match its contract', 'invalid-response', response.status)
  return parsed.data
}

export type ApiHealth =
  | { state: 'unconfigured' }
  | { state: 'up'; readiness: Readiness }
  | { state: 'down'; reason: ApiError['kind'] }

/**
 * Liveness plus readiness in one call, for a status indicator or a post-hydration probe.
 * Never throws: an unreachable API is a normal state for this site, not an error.
 */
export async function checkApiHealth(options: Pick<ApiRequest, 'timeoutMs' | 'signal'> = {}): Promise<ApiHealth> {
  if (!apiBaseUrl()) return { state: 'unconfigured' }
  try {
    await apiRequest('/v1/health', healthSchema, options)
    const readiness = await apiRequest('/v1/ready', readinessSchema, options)
    return { state: 'up', readiness }
  } catch (error) {
    return { state: 'down', reason: error instanceof ApiError ? error.kind : 'network' }
  }
}
