// @vitest-environment node
import { describe, expect, it, vi, afterEach } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

async function seamFlag(env: Record<string, string | undefined>): Promise<string | undefined> {
  vi.resetModules()
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string)
  const config = (await import('../../next.config')).default
  return (config.env as Record<string, string>).NEXT_PUBLIC_MODEL_TEST
}

describe('NEXT_PUBLIC_MODEL_TEST in next.config', () => {
  it('is on only when asked and not on Vercel', async () => {
    expect(await seamFlag({ NEXT_PUBLIC_MODEL_TEST: '1', VERCEL: '' })).toBe('1')
    expect(await seamFlag({ NEXT_PUBLIC_MODEL_TEST: '1', VERCEL: '1' })).toBe('0')
    expect(await seamFlag({ NEXT_PUBLIC_MODEL_TEST: '0', VERCEL: '' })).toBe('0')
    expect(await seamFlag({ NEXT_PUBLIC_MODEL_TEST: '', VERCEL: '' })).toBe('0')
  })
})
