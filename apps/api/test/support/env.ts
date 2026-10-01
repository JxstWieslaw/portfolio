import { type Env, loadEnv } from '../../src/config/env'

/**
 * A valid test environment. The default DATABASE_URL points at a closed port: `pg` pools connect
 * lazily, so an app that never queries boots fine, and one that does fails loudly.
 */
export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://test:test@127.0.0.1:1/test',
    PUBLIC_BASE_URL: 'http://api.test',
    CORS_ORIGINS: 'https://allowed.test',
    LOG_LEVEL: 'silent',
    ...overrides,
  })
}
