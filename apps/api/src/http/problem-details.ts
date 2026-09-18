import { STATUS_CODES } from 'node:http'
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common'
import type { Response } from 'express'
import type { ProblemDetails } from '@repo/contracts'
import type { RequestWithId } from './request-id'
import { ValidationFailedError } from './validation'

const SLUGS: Record<number, string> = {
  400: 'bad-request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not-found',
  405: 'method-not-allowed',
  406: 'not-acceptable',
  409: 'conflict',
  413: 'payload-too-large',
  415: 'unsupported-media-type',
  422: 'validation-failed',
  429: 'too-many-requests',
  500: 'internal-error',
  503: 'service-unavailable',
}

function detailOf(exception: HttpException): string | undefined {
  const response = exception.getResponse()
  if (typeof response === 'string') return response
  if (typeof response === 'object' && response !== null && 'message' in response) {
    const message: unknown = response.message
    if (typeof message === 'string') return message
    if (Array.isArray(message)) return message.map(String).join('; ')
  }
  return undefined
}

/** RFC 9457. Pure, so the mapping is tested without HTTP. */
export function toProblem(
  exception: unknown,
  context: { instance: string; requestId: string },
  baseUrl: string,
): ProblemDetails {
  const base = { instance: context.instance, requestId: context.requestId }

  if (exception instanceof ValidationFailedError) {
    return {
      type: `${baseUrl}/problems/validation-failed`,
      title: 'Validation failed',
      status: 422,
      detail: exception.message,
      ...base,
      errors: exception.issues,
    }
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus()
    const detail = detailOf(exception)
    return {
      type: `${baseUrl}/problems/${SLUGS[status] ?? `http-${status}`}`,
      title: STATUS_CODES[status] ?? 'Error',
      status,
      ...(detail === undefined ? {} : { detail }),
      ...base,
    }
  }

  // Anything else is a bug. Its message may hold secrets, so none of it crosses the boundary.
  return {
    type: `${baseUrl}/problems/internal-error`,
    title: 'Internal Server Error',
    status: 500,
    detail: 'An unexpected error occurred.',
    ...base,
  }
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ProblemDetails')

  constructor(private readonly baseUrl: string) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp()
    const req = http.getRequest<RequestWithId>()
    const res = http.getResponse<Response>()
    const problem = toProblem(
      exception,
      { instance: req.originalUrl.split('?')[0] ?? '/', requestId: req.id },
      this.baseUrl,
    )

    if (problem.status >= 500) {
      this.logger.error({ err: exception, requestId: problem.requestId }, 'Unhandled error')
    }
    if (res.headersSent) return

    res.status(problem.status)
    res.setHeader('Cache-Control', 'no-store')
    res.type('application/problem+json').send(JSON.stringify(problem))
  }
}
