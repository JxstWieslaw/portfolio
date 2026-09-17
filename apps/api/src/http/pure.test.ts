import { BadRequestException, NotFoundException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { problemDetailsSchema } from '@repo/contracts'
import { isAllowedOrigin } from './cors'
import { cloudTraceFields, pinoHttpOptions } from './logging'
import { toProblem } from './problem-details'
import { ValidationFailedError } from './validation'
import { testEnv } from '../../test/support/env'

const CONTEXT = { instance: '/v1/projects', requestId: '01J8Z3K4M5N6P7Q8R9S0T1V2W3' }
const BASE = 'https://api.example.dev'

describe('toProblem', () => {
  it('maps a validation failure to 422 with its issues', () => {
    const problem = toProblem(
      new ValidationFailedError([{ path: ['limit'], message: 'Number must be less than or equal to 50' }]),
      CONTEXT,
      BASE,
    )
    expect(problemDetailsSchema.parse(problem)).toEqual({
      type: 'https://api.example.dev/problems/validation-failed',
      title: 'Validation failed',
      status: 422,
      detail: 'limit: Number must be less than or equal to 50',
      instance: '/v1/projects',
      requestId: CONTEXT.requestId,
      errors: [{ path: ['limit'], message: 'Number must be less than or equal to 50' }],
    })
  })

  it('maps an HttpException to its status, a slug and the HTTP reason phrase', () => {
    const problem = toProblem(new NotFoundException('No project named nope'), CONTEXT, BASE)
    expect(problem).toMatchObject({
      type: 'https://api.example.dev/problems/not-found',
      title: 'Not Found',
      status: 404,
      detail: 'No project named nope',
    })
    expect(toProblem(new BadRequestException(), CONTEXT, BASE).type).toBe(
      'https://api.example.dev/problems/bad-request',
    )
  })

  it('never leaks an unknown error — no message, no stack', () => {
    const problem = toProblem(new Error('password=hunter2'), CONTEXT, BASE)
    expect(problem).toEqual({
      type: 'https://api.example.dev/problems/internal-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected error occurred.',
      instance: '/v1/projects',
      requestId: CONTEXT.requestId,
    })
    expect(JSON.stringify(problem)).not.toContain('hunter2')
  })
})

describe('isAllowedOrigin', () => {
  const allowlist = ['https://wieslaw.dev']
  const preview = /^https:\/\/portfolio-[a-z0-9-]+\.vercel\.app$/

  it('allows listed origins and preview deploys, and nothing else', () => {
    expect(isAllowedOrigin('https://wieslaw.dev', allowlist, preview)).toBe(true)
    expect(isAllowedOrigin('https://portfolio-git-feat-x.vercel.app', allowlist, preview)).toBe(true)
    expect(isAllowedOrigin('https://evil.example', allowlist, preview)).toBe(false)
    expect(isAllowedOrigin('https://portfolio-x.vercel.app.evil.example', allowlist, preview)).toBe(false)
    expect(isAllowedOrigin('https://portfolio-x.vercel.app', allowlist)).toBe(false)
  })
})

describe('cloudTraceFields', () => {
  it('builds the Cloud Logging trace field from X-Cloud-Trace-Context', () => {
    expect(cloudTraceFields('4bf92f3577b34da6a3ce929d0e0e4736/123;o=1', 'my-project')).toEqual({
      'logging.googleapis.com/trace': 'projects/my-project/traces/4bf92f3577b34da6a3ce929d0e0e4736',
    })
  })

  it('adds nothing without a project, a header, or a well-formed trace id', () => {
    expect(cloudTraceFields('4bf92f3577b34da6a3ce929d0e0e4736/1', undefined)).toEqual({})
    expect(cloudTraceFields(undefined, 'my-project')).toEqual({})
    expect(cloudTraceFields('not-a-trace', 'my-project')).toEqual({})
  })
})

describe('pinoHttpOptions', () => {
  it('writes Cloud Logging severities under a message key', () => {
    const options = pinoHttpOptions(testEnv())
    expect(options.messageKey).toBe('message')
    const level = options.formatters?.level
    expect(level?.('warn', 40)).toEqual({ severity: 'WARNING' })
    expect(level?.('fatal', 60)).toEqual({ severity: 'CRITICAL' })
    expect(level?.('info', 30)).toEqual({ severity: 'INFO' })
  })
})
