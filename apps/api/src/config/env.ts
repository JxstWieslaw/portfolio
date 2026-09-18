import { z } from 'zod'

export const ENV = Symbol('ENV')

/** GitHub variables and `--set-env-vars` hand over unset values as empty strings. */
const blankAsUndefined = (value: unknown): unknown => (value === '' ? undefined : value)

const bareOrigin = z
  .string()
  .url()
  .refine((value) => new URL(value).origin === value, 'must be a bare origin such as https://example.com')

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection string'),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  PUBLIC_BASE_URL: z
    .string()
    .url()
    .default('http://localhost:8080')
    .transform((value) => value.replace(/\/+$/, '')),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) => value.split(',').map((entry) => entry.trim()).filter(Boolean))
    .pipe(z.array(bareOrigin)),
  CORS_PREVIEW_ORIGIN_PATTERN: z.preprocess(
    blankAsUndefined,
    z
      .string()
      .refine((pattern) => pattern.startsWith('^') && pattern.endsWith('$'), 'must be anchored with ^ and $')
      .refine((pattern) => {
        try {
          new RegExp(pattern)
          return true
        } catch {
          return false
        }
      }, 'must be a valid regular expression')
      .transform((pattern) => new RegExp(pattern))
      .optional(),
  ),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  GOOGLE_CLOUD_PROJECT: z.preprocess(blankAsUndefined, z.string().min(1).optional()),
})

export type Env = z.output<typeof envSchema>

export class InvalidEnvError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid environment — refusing to start:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`)
    this.name = 'InvalidEnvError'
  }
}

/** Validates the environment once, at boot. Bad config stops the process before it listens. */
export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    throw new InvalidEnvError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    )
  }
  return result.data
}
