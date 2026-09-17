import { describe, expect, it } from 'vitest'
import { InvalidEnvError, loadEnv } from './env'

const MINIMAL = { DATABASE_URL: 'postgres://u:p@localhost:5432/db' }

describe('loadEnv', () => {
  it('applies defaults to a minimal environment', () => {
    const env = loadEnv(MINIMAL)
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 8080,
      DB_POOL_MAX: 5,
      PUBLIC_BASE_URL: 'http://localhost:8080',
      CORS_ORIGINS: [],
      LOG_LEVEL: 'info',
    })
    expect(env.CORS_PREVIEW_ORIGIN_PATTERN).toBeUndefined()
    expect(env.GOOGLE_CLOUD_PROJECT).toBeUndefined()
  })

  it('refuses to start without a postgres connection string', () => {
    expect(() => loadEnv({})).toThrow(InvalidEnvError)
    expect(() => loadEnv({ DATABASE_URL: 'mysql://u:p@h/db' })).toThrow(/DATABASE_URL/)
  })

  it('reports every problem at once, not just the first', () => {
    try {
      loadEnv({ PORT: 'eighty', LOG_LEVEL: 'loud' })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidEnvError)
      const issues = (error as InvalidEnvError).issues.join('\n')
      expect(issues).toMatch(/DATABASE_URL/)
      expect(issues).toMatch(/PORT/)
      expect(issues).toMatch(/LOG_LEVEL/)
    }
  })

  it('parses the CORS allowlist and strips a trailing slash from the base URL', () => {
    const env = loadEnv({
      ...MINIMAL,
      CORS_ORIGINS: 'https://wieslaw.dev, http://localhost:3000',
      PUBLIC_BASE_URL: 'https://api.wieslaw.dev/',
    })
    expect(env.CORS_ORIGINS).toEqual(['https://wieslaw.dev', 'http://localhost:3000'])
    expect(env.PUBLIC_BASE_URL).toBe('https://api.wieslaw.dev')
  })

  it('rejects an allowlist entry that is not a bare origin', () => {
    expect(() => loadEnv({ ...MINIMAL, CORS_ORIGINS: 'https://wieslaw.dev/path' })).toThrow(/CORS_ORIGINS/)
  })

  it('compiles an anchored preview-origin pattern and treats an empty value as unset', () => {
    const env = loadEnv({ ...MINIMAL, CORS_PREVIEW_ORIGIN_PATTERN: '^https://portfolio-[a-z0-9-]+\\.vercel\\.app$' })
    expect(env.CORS_PREVIEW_ORIGIN_PATTERN?.test('https://portfolio-git-x.vercel.app')).toBe(true)
    expect(loadEnv({ ...MINIMAL, CORS_PREVIEW_ORIGIN_PATTERN: '' }).CORS_PREVIEW_ORIGIN_PATTERN).toBeUndefined()
  })

  it('rejects an unanchored preview pattern, which would match any origin containing it', () => {
    expect(() => loadEnv({ ...MINIMAL, CORS_PREVIEW_ORIGIN_PATTERN: 'vercel\\.app' })).toThrow(/anchored/)
  })
})
