import type { Options } from 'pino-http'
import type { Env } from '../config/env'
import type { RequestWithId } from './request-id'

/** pino level → Cloud Logging severity, so logs are filterable without a log shipper. */
const SEVERITY: Record<string, string> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
}

const TRACE_ID = /^[0-9a-f]{32}$/

/** Correlates a log line with its Cloud Trace span via Cloud Run's X-Cloud-Trace-Context. */
export function cloudTraceFields(
  header: string | string[] | undefined,
  project: string | undefined,
): Record<string, string> {
  const value = Array.isArray(header) ? header[0] : header
  const traceId = value?.split('/')[0]
  if (project === undefined || traceId === undefined || !TRACE_ID.test(traceId)) return {}
  return { 'logging.googleapis.com/trace': `projects/${project}/traces/${traceId}` }
}

export function pinoHttpOptions(env: Env): Options {
  return {
    level: env.LOG_LEVEL,
    messageKey: 'message',
    formatters: { level: (label) => ({ severity: SEVERITY[label] ?? 'DEFAULT' }) },
    genReqId: (req) => (req as RequestWithId).id,
    customProps: (req) => cloudTraceFields(req.headers['x-cloud-trace-context'], env.GOOGLE_CLOUD_PROJECT),
    redact: ['req.headers.authorization', 'req.headers.cookie'],
    autoLogging: { ignore: (req) => req.url === '/v1/health' },
  }
}
