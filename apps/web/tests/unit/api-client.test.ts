import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { ApiError, apiBaseUrl, apiRequest, checkApiHealth } from '@/lib/api-client'

const READY = { status: 'ready', checks: { postgres: 'ok' } }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test/')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('apiBaseUrl', () => {
  it('strips the trailing slash', () => {
    expect(apiBaseUrl()).toBe('https://api.example.test')
  })

  it.each(['', '   ', 'not a url', 'ftp://api.example.test'])('is null for %j', (value) => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', value)
    expect(apiBaseUrl()).toBeNull()
  })

  it('is null when unset', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', undefined)
    expect(apiBaseUrl()).toBeNull()
  })
})

describe('apiRequest', () => {
  it('rejects as unconfigured without calling fetch', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(apiRequest('/v1/ready', z.unknown())).rejects.toMatchObject({ kind: 'unconfigured' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('calls the configured origin and returns the parsed body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(READY))
    vi.stubGlobal('fetch', fetchMock)
    const { readinessSchema } = await import('@repo/contracts')
    await expect(apiRequest('/v1/ready', readinessSchema)).resolves.toEqual(READY)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example.test/v1/ready')
  })

  it('sends a JSON body with a content type for POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    await apiRequest('/v1/echo', z.object({ ok: z.boolean() }), { method: 'POST', body: { a: 1 } })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"a":1}')
    expect(init.headers).toMatchObject({ 'content-type': 'application/json' })
  })

  it('turns an RFC 9457 error into an ApiError carrying the problem', async () => {
    const problem = {
      type: 'https://api.example.test/problems/validation',
      title: 'Validation failed',
      status: 422,
      instance: '/v1/contact',
      requestId: 'req-1',
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(problem, 422)))
    const error = await apiRequest('/v1/contact', z.unknown()).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ kind: 'http', status: 422, message: 'Validation failed', problem })
  })

  it('reports a non-contract success body as invalid-response, never as data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ status: 'maybe' })))
    const { readinessSchema } = await import('@repo/contracts')
    await expect(apiRequest('/v1/ready', readinessSchema)).rejects.toMatchObject({ kind: 'invalid-response' })
  })

  it('reports a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(apiRequest('/v1/ready', z.unknown())).rejects.toMatchObject({ kind: 'network' })
  })

  it('reports a timeout when the request is aborted by its deadline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'TimeoutError')))
          }),
      ),
    )
    await expect(apiRequest('/v1/ready', z.unknown(), { timeoutMs: 20 })).rejects.toMatchObject({ kind: 'timeout' })
  })
})

describe('checkApiHealth', () => {
  it('is unconfigured, and silent, when there is no API URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(checkApiHealth()).resolves.toEqual({ state: 'unconfigured' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is up with the readiness body when both endpoints answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ status: 'ok' })).mockResolvedValueOnce(json(READY)))
    await expect(checkApiHealth()).resolves.toEqual({ state: 'up', readiness: READY })
  })

  it('is down, not thrown, when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(checkApiHealth()).resolves.toEqual({ state: 'down', reason: 'network' })
  })
})
