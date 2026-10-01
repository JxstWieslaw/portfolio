# M1 API Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `apps/api` — a NestJS service with a reversible migration toolkit, an idempotent content seed from git, documented public read endpoints and a keyless Cloud Run deploy — while `apps/web` stays exactly as static as it is today.

**Architecture:** `apps/api` is a NestJS 11 app bundled by `tsup` (SWC, so decorator metadata survives) into one CommonJS file that inlines `@repo/contracts` and the pure-JS libraries, leaving only framework packages in the production `node_modules`. Postgres is reached through `pg` + Drizzle. Migrations are hand-paired `up.sql`/`down.sql` directories whose `up.sql` must mirror Drizzle Kit's generated SQL; a small runner applies, rolls back and reports drift. A CLI seed parses `content/*.json` through the shared Zod contracts and upserts by content hash. Response shapes *are* the contract types, and the OpenAPI document is generated from the same Zod schemas and snapshot-committed.

**Tech Stack:** NestJS 11.2 · `@nestjs/swagger` 11.4 · `nestjs-pino` 4.6 / `pino` 9 · Drizzle ORM 0.45 + Drizzle Kit 0.31 · `pg` 8 · Zod 3.25 (v3 API) + `zod-to-json-schema` 3.25 · `tsup` 8.5 + `@swc/core` · Vitest 4 + `unplugin-swc` · Supertest 7 · Testcontainers 12 (`postgres:17-alpine`) · Docker (distroless `nodejs22-debian12`) · GitHub Actions · Google Cloud Run · Artifact Registry · Secret Manager · Workload Identity Federation · Neon

**Spec:** [`docs/superpowers/specs/2026-08-15-api-service-design.md`](../specs/2026-08-15-api-service-design.md) — M1 row of [main spec §8](../specs/2026-08-15-portfolio-website-design.md): *NestJS scaffold, Neon, Drizzle + reversible migration CLI (dry-run/apply/rollback), content seed from git, public read endpoints, OpenAPI + Swagger published, Cloud Run deploy via Workload Identity Federation, health/readiness.*

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Node** ≥ 22.12 · **pnpm** 9.15 (from `packageManager`). All commands run from the repo root unless a step says otherwise.
- **Platform:** development is on Windows. No `&` backgrounding and no inline `VAR=x cmd` in npm scripts (use `cross-env`). Shell snippets in steps are Git Bash.
- **TypeScript strict** (`@repo/config/tsconfig.base.json`): `strict`, `noUncheckedIndexedAccess`. No `any`; no non-null `!` outside tests (ESLint enforces `no-non-null-assertion`).
- **Style:** single quotes, no semicolons, 2-space indent, trailing commas — match `apps/web`. Relative imports inside `@repo/contracts` carry `.js` extensions (`./content.js`).
- **The web app is untouched in behaviour.** `apps/web` never calls the API in M1 (spec §1: "a cold visitor's page render never touches this API"). The only web change is Task 1's loader simplification, and its test suite must stay green.
- **Versioned routes:** everything public lives under `/v1`, except Swagger UI at `/docs`.
- **Reads** send `ETag` (strong) and `Cache-Control: public, s-maxage=300, stale-while-revalidate=86400`, and answer `If-None-Match` with `304`. `/v1/health` and `/v1/ready` send `Cache-Control: no-store`.
- **Errors** are RFC 9457 `application/problem+json` with `type`, `title`, `status`, `detail`, `instance`, `requestId` (and `errors` for validation). No stack trace ever leaves the process.
- **Request ID:** a ULID per request, echoed in `X-Request-Id`, on every log line and in every error body. An incoming `X-Request-Id` is reused only if it is itself a valid ULID.
- **Config** is Zod-validated at boot; the process exits non-zero on bad config before listening.
- **Migrations:** every migration directory has `up.sql` **and** a non-empty `down.sql`, or `db:migrate --verify` fails (and so does CI). Destructive changes follow expand/contract across releases.
- **No service-account JSON anywhere.** CI authenticates to GCP only through Workload Identity Federation.
- **Budgets (spec §11):** container image ≤ 200 MB · cold start ≤ 2 s · p95 cached GET ≤ 80 ms.
- **Commit after every task** with conventional commits; never `--no-verify`. End every commit message with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

### Deliberate refinements of the spec (agreed, with rationale)

1. **NestJS 11, not 12.** 12.0.0 shipped on 2026-08-27 as ESM-only, and parts of the ecosystem (e.g. `nestjs-zod`) do not support it yet. 11.2 is mature and fully compatible; the move to 12 is a later, isolated upgrade, like `apps/web` staying on Next 15.
2. **No `nestjs-zod`.** Its current release needs Zod ≥ 3.25 *v4-core* APIs and Nest ≤ 11 at the same time. A 25-line `ZodValidationPipe` plus `zod-to-json-schema` keeps the spec's actual requirement — **one** Zod definition drives runtime validation, the OpenAPI schema and the frontend's types — without the coupling.
3. **The content seed is a CLI run by CI, not `POST /internal/content/seed`.** An internal route needs OIDC caller verification before anything calls it. The CLI has identical semantics (dry-run/apply, content hashes, a `seed_runs` row) and runs in the deploy job, which already holds database credentials. The internal route arrives with the first Cloud Scheduler job (M3).
4. **Tables are scoped to content that exists.** `profile`, `domains`, `projects` (+ `project_outcomes`), `experiences`, `skill_groups` (+ `skills`) and `seed_runs`. `project_decisions`, `project_media`, `project_skills` and `lab_experiments` arrive with the M3 content that fills them; owned tables (`leads`, `events`, …) arrive with the features that write them (M3/M4).
5. **`/v1/ready` checks Postgres only.** GCS joins the check in M4, when the service first uses it.
6. **M1 read endpoints:** `/v1/profile`, `/v1/domains`, `/v1/projects`, `/v1/projects/:slug`, `/v1/experience`, `/v1/skills`. `/v1/writing` (Medium cache), `/v1/lab`, `/v1/projects/:slug/stats` and `/v1/assets/manifest` depend on M3/M4 systems and ship with them.
7. **Integration tests run against a Postgres service container in CI**; the Neon branch-per-PR job is included but gated on the Neon project existing (`vars.NEON_PROJECT_ID`). Locally, Testcontainers starts Postgres — Docker Desktop must be running.
8. **Tracing (OpenTelemetry → Cloud Trace, Sentry) is not in M1.** Logs already carry the Cloud Trace correlation field. Full tracing lands in M3, when the first cross-service call (web → API) exists to trace.

### Owner inputs (spec §10) — what blocks what

| Input | Blocks | Until then |
|---|---|---|
| GCP project + billing | Task 13's live deploy only | The deploy workflow is committed but skips itself (`vars.GCP_PROJECT_ID` unset) |
| Neon project | Production database; Task 12's Neon PR branch job | Local/CI Postgres containers |
| API domain (`api.<domain>`) | The public `PUBLIC_BASE_URL` | The Cloud Run `*.run.app` URL |

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/contracts/src/content.ts` | + KPI `group`, `emailPlaceholder`, exported `slugSchema`, `countDomainsShipped`, `resolveDerivedKpis` |
| `packages/contracts/src/api.ts` | Wire-level schemas: `pageSchema`, `projectListQuerySchema`, `problemDetailsSchema`, `healthSchema`, `readinessSchema` |
| `apps/web/lib/content.ts` | Drops its local profile extension; uses the contract's derived-KPI helpers |
| `apps/api/package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `eslint.config.mjs`, `drizzle.config.ts`, `.env.example` | Package, build, test, lint, Drizzle Kit config |
| `apps/api/src/main.ts` | Process entry: load env → create app → listen |
| `apps/api/src/app.ts` | `createApp(env)` — every global (logger, ETag, helmet, CORS, filter, OpenAPI, shutdown hooks) in one place, so tests boot the real app |
| `apps/api/src/app.module.ts` | Root module: `AppModule.forRoot(env)` |
| `apps/api/src/config/env.ts` | Zod env schema, `loadEnv`, `InvalidEnvError`, `ENV` token |
| `apps/api/src/http/request-id.ts` | ULID request-ID middleware |
| `apps/api/src/http/problem-details.ts` | `toProblem` + `ProblemDetailsFilter` |
| `apps/api/src/http/validation.ts` | `ValidationFailedError`, `ZodValidationPipe` |
| `apps/api/src/http/cors.ts` | `isAllowedOrigin`, `corsOptions` |
| `apps/api/src/http/security.ts` | helmet with a CSP exemption for `/docs` |
| `apps/api/src/http/cache.ts` | `PUBLIC_CACHE_CONTROL`, `PublicCacheInterceptor` |
| `apps/api/src/http/logging.ts` | pino options for Cloud Logging (`severity`, trace correlation) |
| `apps/api/src/health/health.controller.ts` | `/v1/health`, `/v1/ready` |
| `apps/api/src/db/schema/*.ts` | Drizzle tables |
| `apps/api/src/db/db.module.ts` | `PG_POOL`, `DB` providers; pool closed on shutdown |
| `apps/api/src/db/migrations/{load,locks,runner}.ts` | Reversible migration toolkit |
| `apps/api/src/db/cli/migrate.ts` | `db:migrate` CLI |
| `apps/api/drizzle/` | Drizzle Kit generator state (SQL + snapshots) — committed |
| `apps/api/migrations/NNNN_name/{up,down}.sql` | The runnable migrations |
| `apps/api/src/content/{source,hash,rows,seed}.ts` | Load git content, hash, map to rows, plan/apply the seed |
| `apps/api/src/db/cli/seed.ts` | `db:seed` CLI |
| `apps/api/src/content/content.reader.ts` | `ContentReader` interface + `PostgresContentReader` |
| `apps/api/src/content/cursor.ts` | Opaque project-list cursor |
| `apps/api/src/content/content.controller.ts`, `projects.controller.ts`, `content.module.ts` | Public reads |
| `apps/api/src/openapi/openapi.ts` | `zodToOpenApi`, `ApiProblem`, document build + Swagger setup |
| `apps/api/openapi.snapshot.json` | Committed contract snapshot |
| `apps/api/test/**` | Integration + e2e (real Postgres) |
| `apps/api/Dockerfile`, `.dockerignore` | Distroless production image |
| `docker-compose.dev.yml` | Local Postgres 17 on port 5433 |
| `.github/workflows/ci.yml` | + `api-integration`, `api-image`, `api-neon-branch` jobs |
| `.github/workflows/deploy-api.yml`, `.github/workflows/neon-branch-cleanup.yml` | Keyless deploy; PR branch cleanup |
| `docs/api-gcp-setup.md` | One-time GCP/WIF/Secret Manager runbook |
| `docs/m1-status.md` | Close-out record |

---

## Task 1: Contracts absorb the profile extension and gain the wire schemas

The web loader extends `profileSchema` locally with `kpis[].group` (OD-7) and `emailPlaceholder`. Parsed through the contract as-is, the API would silently strip both. This task moves them into the contract, moves the derived-KPI rule (spec §5.5: "Domains shipped" is derived, never written down) next to the schemas so both apps compute it identically, and adds the schemas the API speaks on the wire.

**Files:**
- Modify: `packages/contracts/src/content.ts`
- Create: `packages/contracts/src/api.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/content.test.ts`
- Create: `packages/contracts/src/api.test.ts`
- Modify: `apps/web/lib/content.ts`

**Interfaces:**
- Consumes: existing `profileSchema`, `projectSchema` in `packages/contracts/src/content.ts`
- Produces:
  - `slugSchema: z.ZodString` (kebab-case)
  - `kpiGroupSchema = z.enum(['hero', 'proof'])`, `type KpiGroup`
  - `Profile` now has `emailPlaceholder?: boolean` and `kpis[].group: KpiGroup`
  - `countDomainsShipped(projects: readonly Pick<Project, 'domain' | 'placeholder'>[]): number`
  - `resolveDerivedKpis(profile: Profile, projects: readonly Pick<Project, 'domain' | 'placeholder'>[]): Profile`
  - `pageSchema<T extends z.ZodTypeAny>(item: T)` → `z.object({ data: z.array(item), nextCursor: z.string().nullable() })`; `interface Page<T> { data: T[]; nextCursor: string | null }`
  - `projectListQuerySchema` (strict): `domain?: string`, `featured?: boolean` (from `'true' | 'false'`), `limit: number` (1–50, default 20), `cursor?: string` (1–200 chars); `type ProjectListQuery = z.output<typeof projectListQuerySchema>`
  - `problemDetailsSchema`, `type ProblemDetails`; `healthSchema`; `readinessSchema`, `type Readiness`

- [ ] **Step 1: Write the failing contract tests**

In `packages/contracts/src/content.test.ts`, add `group` to the existing `validProfile` KPI so the fixture stays valid once `group` is required:

```ts
  kpis: [{ label: 'Domains shipped', value: '4', group: 'hero' }],
```

Update the import line at the top of the file:

```ts
import {
  countDomainsShipped,
  profileSchema,
  projectSchema,
  resolveDerivedKpis,
  skillGroupSchema,
} from './content.js'
```

Then append:

```ts
describe('profileSchema — KPI groups and provisional email', () => {
  it('requires every KPI to name its group', () => {
    expect(() =>
      profileSchema.parse({ ...validProfile, kpis: [{ label: 'Years', value: '5+' }] }),
    ).toThrow()
  })

  it('keeps group and emailPlaceholder instead of stripping them', () => {
    const parsed = profileSchema.parse({ ...validProfile, emailPlaceholder: true })
    expect(parsed.kpis[0]?.group).toBe('hero')
    expect(parsed.emailPlaceholder).toBe(true)
  })
})

describe('derived KPIs', () => {
  const projects = [
    { domain: 'healthcare', placeholder: false },
    { domain: 'healthcare', placeholder: false },
    { domain: 'education', placeholder: false },
    { domain: 'interactive-3d', placeholder: true },
  ]

  it('counts distinct domains across non-placeholder projects only', () => {
    expect(countDomainsShipped(projects)).toBe(2)
  })

  it('replaces a derived KPI value and leaves authored ones alone', () => {
    const profile = profileSchema.parse({
      ...validProfile,
      kpis: [
        { label: 'Domains shipped', value: '99', derived: 'domainsShipped', group: 'hero' },
        { label: 'Years shipping', value: '5+', group: 'hero' },
      ],
    })
    const resolved = resolveDerivedKpis(profile, projects)
    expect(resolved.kpis.map((k) => k.value)).toEqual(['2', '5+'])
    // Pure: the input is not mutated.
    expect(profile.kpis[0]?.value).toBe('99')
  })
})
```

Create `packages/contracts/src/api.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { pageSchema, problemDetailsSchema, projectListQuerySchema } from './api.js'

describe('projectListQuerySchema', () => {
  it('defaults limit to 20 and leaves filters unset', () => {
    expect(projectListQuerySchema.parse({})).toEqual({ limit: 20 })
  })

  it('coerces query-string values', () => {
    expect(projectListQuerySchema.parse({ featured: 'true', limit: '5', domain: 'healthcare' })).toEqual({
      featured: true,
      limit: 5,
      domain: 'healthcare',
    })
    expect(projectListQuerySchema.parse({ featured: 'false' }).featured).toBe(false)
  })

  it.each([
    ['limit above 50', { limit: '51' }],
    ['limit below 1', { limit: '0' }],
    ['a non-boolean featured', { featured: 'yes' }],
    ['a domain that is not kebab-case', { domain: 'Health Care' }],
    ['an unknown parameter', { sort: 'name' }],
  ])('rejects %s', (_label, query) => {
    expect(projectListQuerySchema.safeParse(query).success).toBe(false)
  })
})

describe('pageSchema', () => {
  it('wraps items with a nullable cursor', () => {
    const page = pageSchema(z.string())
    expect(page.parse({ data: ['a'], nextCursor: null })).toEqual({ data: ['a'], nextCursor: null })
    expect(page.safeParse({ data: ['a'] }).success).toBe(false)
  })
})

describe('problemDetailsSchema', () => {
  it('accepts the RFC 9457 shape the API emits', () => {
    const problem = {
      type: 'https://api.example.dev/problems/validation-failed',
      title: 'Validation failed',
      status: 422,
      detail: 'limit: Number must be less than or equal to 50',
      instance: '/v1/projects',
      requestId: '01J8Z3K4M5N6P7Q8R9S0T1V2W3',
      errors: [{ path: ['limit'], message: 'Number must be less than or equal to 50' }],
    }
    expect(problemDetailsSchema.parse(problem)).toEqual(problem)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @repo/contracts test`
Expected: FAIL — `countDomainsShipped`/`resolveDerivedKpis` are not exported, and `./api.js` does not resolve.

- [ ] **Step 3: Implement the contract changes**

In `packages/contracts/src/content.ts`, replace the private `slug` constant with an exported schema, keeping the local name as an alias so the rest of the file is unchanged:

```ts
export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be kebab-case')
const slug = slugSchema
```

Replace the whole `profileSchema` block (from `export const profileSchema` through `export type Profile`) with:

```ts
/**
 * Which KPI set a tile belongs to. Spec §5.5 defines two — the hero trio and the proof strip —
 * rendered by different components, so the flat array needs a discriminator (was OD-7).
 */
export const kpiGroupSchema = z.enum(['hero', 'proof'])
export type KpiGroup = z.infer<typeof kpiGroupSchema>

export const profileSchema = z.object({
  name: z.string().min(1),
  headline: z.string().min(1),
  sub: z.string().min(1),
  location: z.string().min(1),
  email: z.string().email(),
  /** Marks the address as provisional; it then renders with the placeholder treatment. */
  emailPlaceholder: z.boolean().optional(),
  availability: z.string().min(1),
  roles: z.array(z.object({
    org: z.string().min(1),
    title: z.string().min(1),
    url: z.string().url().optional(),
  })).min(1),
  links: z.array(z.object({
    label: z.string().min(1),
    url: z.string().url(),
    kind: z.enum(['primary', 'secondary', 'elsewhere']),
  })).min(1),
  kpis: z.array(z.object({
    label: z.string().min(1),
    value: z.string().min(1),
    derived: z.enum(['domainsShipped']).optional(),
    placeholder: z.boolean().default(false),
    group: kpiGroupSchema,
  })).min(1),
})
export type Profile = z.infer<typeof profileSchema>

/**
 * Distinct domains across NON-placeholder projects. Placeholder work is excluded so the figure
 * never claims a domain that is not yet real (spec §5.5: derived, never written down).
 */
export function countDomainsShipped(
  projects: readonly Pick<Project, 'domain' | 'placeholder'>[],
): number {
  return new Set(projects.filter((p) => !p.placeholder).map((p) => p.domain)).size
}

/** Returns a copy of `profile` with every derived KPI's value computed from `projects`. */
export function resolveDerivedKpis(
  profile: Profile,
  projects: readonly Pick<Project, 'domain' | 'placeholder'>[],
): Profile {
  return {
    ...profile,
    kpis: profile.kpis.map((kpi) =>
      kpi.derived === 'domainsShipped' ? { ...kpi, value: String(countDomainsShipped(projects)) } : kpi,
    ),
  }
}
```

Create `packages/contracts/src/api.ts`:

```ts
import { z } from 'zod'
import { slugSchema } from './content.js'

/**
 * Wire-level shapes of the public API. Response bodies are the content types themselves
 * (`Project`, `Profile`, …); this module holds only what exists because of HTTP.
 */

/** A page of results. `nextCursor` is opaque and `null` on the last page. */
export function pageSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({ data: z.array(item), nextCursor: z.string().nullable() })
}
export interface Page<T> {
  data: T[]
  nextCursor: string | null
}

/** `GET /v1/projects` query. Strict: an unknown parameter is a 422, not silently ignored. */
export const projectListQuerySchema = z
  .object({
    domain: slugSchema.optional(),
    featured: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(200).optional(),
  })
  .strict()
export type ProjectListQuery = z.output<typeof projectListQuerySchema>

/** RFC 9457 Problem Details, as emitted by the API's global exception filter. */
export const problemDetailsSchema = z.object({
  type: z.string().url(),
  title: z.string().min(1),
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().min(1),
  requestId: z.string().min(1),
  errors: z
    .array(z.object({ path: z.array(z.union([z.string(), z.number()])), message: z.string() }))
    .optional(),
})
export type ProblemDetails = z.infer<typeof problemDetailsSchema>

export const healthSchema = z.object({ status: z.literal('ok') })

export const readinessSchema = z.object({
  status: z.enum(['ready', 'unavailable']),
  checks: z.object({ postgres: z.enum(['ok', 'failed']) }),
})
export type Readiness = z.infer<typeof readinessSchema>
```

Replace `packages/contracts/src/index.ts` with:

```ts
export * from './content.js'
export * from './api.js'
```

- [ ] **Step 4: Run the contract tests to verify they pass**

Run: `pnpm --filter @repo/contracts test && pnpm --filter @repo/contracts typecheck && pnpm --filter @repo/contracts lint`
Expected: PASS, no type or lint errors.

- [ ] **Step 5: Point the web loader at the contract**

In `apps/web/lib/content.ts`:

1. Replace the two `@repo/contracts` import statements with:

```ts
import {
  countDomainsShipped as countDomainsShippedIn,
  domainSchema,
  experienceSchema,
  profileSchema,
  projectSchema,
  resolveDerivedKpis,
  skillGroupSchema,
  writingSchema,
} from '@repo/contracts'
import type { Domain, Experience, KpiGroup, Profile, Project, SkillGroup, Writing } from '@repo/contracts'
```

2. Delete everything from the doc comment above `const kpiGroupSchema = z.enum(['hero', 'proof'])` through the line `export type Profile = z.infer<typeof localProfileSchema>` (the local `kpiGroupSchema`, `KpiGroupName`, `localProfileSchema`, `Kpi` and `Profile` declarations and their comments), and put in their place:

```ts
export type { Profile }

/** The hero trio or the proof strip — the contract's `KpiGroup`, under this module's old name. */
export type KpiGroupName = KpiGroup

export type Kpi = Profile['kpis'][number]
```

3. Replace `const profile = localProfileSchema.parse(profileJson)` with `const profile = profileSchema.parse(profileJson)`.

4. Replace the `countDomainsShipped`, `resolveKpi` and `getKpis` functions with the two below, keeping the existing doc comment above `countDomainsShipped`:

```ts
export function countDomainsShipped(): number {
  return countDomainsShippedIn(projects)
}

export function getKpis(group: KpiGroupName): Kpi[] {
  return resolveDerivedKpis(profile, projects).kpis.filter((k) => k.group === group)
}
```

`import { z } from 'zod'` stays — the `z.array(...)` parses still use it.

- [ ] **Step 6: Run the web suite to verify nothing moved**

Run: `pnpm --filter @repo/web typecheck && pnpm --filter @repo/web test && pnpm --filter @repo/web lint`
Expected: PASS with the same test count as before this task.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts apps/web/lib/content.ts
git commit -m "feat(contracts): absorb KPI groups and provisional email; add API wire schemas

The profile contract now declares kpis[].group (OD-7) and emailPlaceholder,
so the API cannot strip them. Derived KPIs move beside the schemas so web and
API compute 'Domains shipped' identically.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `apps/api` scaffold — build, config that refuses bad env, `/v1/health`

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/tsup.config.ts`, `apps/api/vitest.config.ts`, `apps/api/eslint.config.mjs`, `apps/api/.env.example`
- Create: `apps/api/src/main.ts`, `apps/api/src/app.ts`, `apps/api/src/app.module.ts`
- Create: `apps/api/src/config/env.ts`, `apps/api/src/config/config.module.ts`
- Create: `apps/api/src/health/health.controller.ts`
- Create: `apps/api/test/support/env.ts`
- Test: `apps/api/src/config/env.test.ts`, `apps/api/src/health/health.controller.test.ts`
- Modify: `turbo.json`, `package.json` (root)

**Interfaces:**
- Consumes: `healthSchema` from `@repo/contracts` (Task 1)
- Produces:
  - `envSchema`, `type Env`, `loadEnv(source: Record<string, string | undefined>): Env`, `class InvalidEnvError extends Error { issues: string[] }`, `ENV: unique symbol`
  - `Env` fields: `NODE_ENV: 'development' | 'test' | 'production'`, `PORT: number`, `DATABASE_URL: string`, `DB_POOL_MAX: number`, `PUBLIC_BASE_URL: string` (no trailing slash), `CORS_ORIGINS: string[]`, `CORS_PREVIEW_ORIGIN_PATTERN: RegExp | undefined`, `LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'`, `GOOGLE_CLOUD_PROJECT: string | undefined`
  - `ConfigModule.forRoot(env: Env): DynamicModule` (global; exports `ENV`)
  - `AppModule.forRoot(env: Env): DynamicModule`
  - `createApp(env: Env): Promise<NestExpressApplication>` — later tasks add globals **inside this function only**
  - `testEnv(overrides?: Record<string, string>): Env` in `test/support/env.ts`
- Rule for every later task: **constructor injection always uses an explicit token** — `@Inject(ENV)`, `@Inject(DB)`, … — never a bare class type. The build keeps decorator metadata, but explicit tokens make DI independent of it and immune to ESLint's `consistent-type-imports` autofix turning a runtime import into `import type`.

- [ ] **Step 1: Create the package**

`apps/api/package.json`:

```json
{
  "name": "@repo/api",
  "version": "0.0.0",
  "private": true,
  "type": "commonjs",
  "files": ["dist"],
  "scripts": {
    "dev": "tsup --watch --onSuccess \"node --env-file-if-exists=.env --enable-source-maps dist/main.js\"",
    "build": "tsup",
    "start": "node --env-file-if-exists=.env --enable-source-maps dist/main.js",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx --env-file-if-exists=.env src/db/cli/migrate.ts",
    "db:seed": "tsx --env-file-if-exists=.env src/db/cli/seed.ts"
  },
  "dependencies": {
    "@nestjs/common": "^11.2.5",
    "@nestjs/core": "^11.2.5",
    "@nestjs/platform-express": "^11.2.5",
    "@nestjs/swagger": "^11.4.7",
    "helmet": "^8.3.0",
    "nestjs-pino": "^4.6.1",
    "pg": "^8.23.0",
    "pino": "^9.14.0",
    "pino-http": "^10.5.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.2"
  },
  "devDependencies": {
    "@nestjs/testing": "^11.2.5",
    "@repo/config": "workspace:*",
    "@repo/contracts": "workspace:*",
    "@swc/core": "^1.16.2",
    "@testcontainers/postgresql": "^12.1.0",
    "@types/express": "^5.0.0",
    "@types/node": "^22.20.0",
    "@types/pg": "^8.23.1",
    "@types/supertest": "^7.2.1",
    "drizzle-kit": "^0.31.10",
    "drizzle-orm": "^0.45.2",
    "eslint": "^9.17.0",
    "supertest": "^7.2.2",
    "tsup": "^8.5.1",
    "tsx": "^4.23.13",
    "typescript": "^5.7.2",
    "ulid": "^3.0.2",
    "unplugin-swc": "^1.6.0",
    "vitest": "^4.1.10",
    "zod": "^3.25.76",
    "zod-to-json-schema": "^3.25.2"
  }
}
```

`@repo/contracts`, `drizzle-orm`, `zod`, `zod-to-json-schema` and `ulid` are **devDependencies on purpose**: `tsup` inlines them into `dist/main.js`, so the production install (`pnpm deploy --prod`, Task 11) leaves them out. That is how the image stays under 200 MB. Do not move them to `dependencies`.

`apps/api/tsconfig.json`:

```json
{
  "extends": "@repo/config/tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "lib": ["ES2023"],
    "types": ["node"],
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src", "test", "*.config.ts"]
}
```

`apps/api/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['cjs'],
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  // `emitDecoratorMetadata` in tsconfig.json makes tsup compile with SWC, which keeps
  // decorator metadata. Inlined: the workspace contracts (TypeScript source, not loadable by
  // Node at runtime) and pure-JS libraries, so the production node_modules holds only
  // framework packages.
  noExternal: [/^@repo\//, 'drizzle-orm', 'zod', 'zod-to-json-schema', 'ulid'],
})
```

`apps/api/vitest.config.ts`:

```ts
import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // esbuild drops decorator metadata; SWC keeps it, as the tsup build does.
  plugins: [swc.vite()],
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.test.ts'], environment: 'node' },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/**/*.int.test.ts', 'test/**/*.e2e.test.ts'],
          environment: 'node',
          globalSetup: ['test/global-setup.ts'],
          fileParallelism: false,
          hookTimeout: 120_000,
          testTimeout: 30_000,
        },
      },
    ],
  },
})
```

`apps/api/eslint.config.mjs`:

```js
export { default } from '@repo/config/eslint'
```

`apps/api/.env.example`:

```bash
# Copy to apps/api/.env for local development. Never commit .env.
NODE_ENV=development
PORT=8080
# docker compose -f docker-compose.dev.yml up -d
DATABASE_URL=postgres://portfolio:portfolio@localhost:5433/portfolio
PUBLIC_BASE_URL=http://localhost:8080
CORS_ORIGINS=http://localhost:3000
CORS_PREVIEW_ORIGIN_PATTERN=
LOG_LEVEL=info
```

In the root `turbo.json`, add inside `tasks`:

```json
    "test:integration": { "dependsOn": ["^build"], "cache": false },
```

In the root `package.json` `scripts`, add:

```json
    "test:integration": "turbo run test:integration",
```

Run: `pnpm install`
Expected: lockfile updated, no peer-dependency errors.

- [ ] **Step 2: Write the failing env tests**

`apps/api/src/config/env.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @repo/api test`
Expected: FAIL — `./env` does not exist.

- [ ] **Step 4: Implement the config**

`apps/api/src/config/env.ts`:

```ts
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
```

`apps/api/src/config/config.module.ts`:

```ts
import { type DynamicModule, Global, Module } from '@nestjs/common'
import { ENV, type Env } from './env'

@Global()
@Module({})
export class ConfigModule {
  static forRoot(env: Env): DynamicModule {
    return { module: ConfigModule, providers: [{ provide: ENV, useValue: env }], exports: [ENV] }
  }
}
```

- [ ] **Step 5: Run the env tests to verify they pass**

Run: `pnpm --filter @repo/api test`
Expected: PASS (7 tests).

- [ ] **Step 6: Write the failing health test**

`apps/api/test/support/env.ts`:

```ts
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
```

`apps/api/src/health/health.controller.test.ts`:

```ts
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { healthSchema } from '@repo/contracts'
import { testEnv } from '../../test/support/env'
import { createApp } from '../app'

describe('GET /v1/health', () => {
  let app: NestExpressApplication

  beforeAll(async () => {
    app = await createApp(testEnv())
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('answers without touching any dependency', async () => {
    const response = await request(app.getHttpServer()).get('/v1/health').expect(200)
    expect(healthSchema.parse(response.body)).toEqual({ status: 'ok' })
  })

  it('is never cached', async () => {
    const response = await request(app.getHttpServer()).get('/v1/health')
    expect(response.headers['cache-control']).toBe('no-store')
  })

  it('does not advertise the framework', async () => {
    const response = await request(app.getHttpServer()).get('/v1/health')
    expect(response.headers['x-powered-by']).toBeUndefined()
  })
})
```

- [ ] **Step 7: Run it to verify it fails**

Run: `pnpm --filter @repo/api test`
Expected: FAIL — `../app` does not exist.

- [ ] **Step 8: Implement the app, module, controller and entry point**

`apps/api/src/health/health.controller.ts`:

```ts
import { Controller, Get, Header } from '@nestjs/common'
import type { z } from 'zod'
import type { healthSchema } from '@repo/contracts'

@Controller('v1')
export class HealthController {
  /** Liveness. Touches nothing, so a slow database never gets a healthy instance restarted. */
  @Get('health')
  @Header('Cache-Control', 'no-store')
  health(): z.infer<typeof healthSchema> {
    return { status: 'ok' }
  }
}
```

`apps/api/src/app.module.ts`:

```ts
import { type DynamicModule, Module } from '@nestjs/common'
import { ConfigModule } from './config/config.module'
import type { Env } from './config/env'
import { HealthController } from './health/health.controller'

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [ConfigModule.forRoot(env)],
      controllers: [HealthController],
    }
  }
}
```

`apps/api/src/app.ts`:

```ts
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module'
import type { Env } from './config/env'

/**
 * Builds the fully configured application without listening. Every global — logging, headers,
 * CORS, errors, OpenAPI — is applied here and only here, so tests exercise exactly what ships.
 */
export async function createApp(env: Env): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env), {
    logger: env.NODE_ENV === 'test' ? false : ['log', 'warn', 'error'],
  })

  // Strong ETags; Express answers a matching If-None-Match with 304 on its own.
  app.set('etag', 'strong')
  app.disable('x-powered-by')
  // SIGTERM → stop accepting, drain, run onApplicationShutdown hooks (Cloud Run allows 10 s).
  app.enableShutdownHooks()

  return app
}
```

`apps/api/src/main.ts`:

```ts
import 'reflect-metadata'
import { createApp } from './app'
import { InvalidEnvError, loadEnv } from './config/env'

async function main(): Promise<void> {
  const env = loadEnv(process.env)
  const app = await createApp(env)
  await app.listen(env.PORT, '0.0.0.0')
}

main().catch((error: unknown) => {
  // No logger exists yet on this path. Exit non-zero so Cloud Run marks the revision failed.
  console.error(error instanceof InvalidEnvError ? error.message : error)
  process.exit(1)
})
```

- [ ] **Step 9: Run the unit suite, typecheck and lint**

Run: `pnpm --filter @repo/api test && pnpm --filter @repo/api typecheck && pnpm --filter @repo/api lint`
Expected: PASS (10 tests), no type or lint errors.

- [ ] **Step 10: Verify the bundle boots, and refuses bad config**

```bash
pnpm --filter @repo/api build
cd apps/api
node dist/main.js; echo "exit=$?"
```

Expected: stderr `Invalid environment — refusing to start:` listing `DATABASE_URL`, then `exit=1`.

```bash
DATABASE_URL=postgres://u:p@127.0.0.1:1/db PORT=8090 node dist/main.js &
sleep 3
curl -s -i http://localhost:8090/v1/health
kill %1
cd ../..
```

Expected: `HTTP/1.1 200 OK`, `Cache-Control: no-store`, body `{"status":"ok"}`. (This proves the SWC bundle kept decorator metadata and inlined `@repo/contracts`; a broken bundle fails at boot.)

- [ ] **Step 11: Commit**

```bash
git add apps/api turbo.json package.json pnpm-lock.yaml
git commit -m "feat(api): scaffold the NestJS service with validated config and /v1/health

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: HTTP cross-cutting — request IDs, Problem Details, validation, CORS, headers, caching, logging

Everything here is global behaviour, so it is tested through a real app booted with a small fixture controller (no database needed), plus direct tests of the pure functions.

**Files:**
- Create: `apps/api/src/http/request-id.ts`, `problem-details.ts`, `validation.ts`, `cors.ts`, `security.ts`, `cache.ts`, `logging.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/src/app.module.ts`
- Test: `apps/api/src/http/http.test.ts`, `apps/api/src/http/pure.test.ts`

**Interfaces:**
- Consumes: `Env`, `ENV`, `createApp` (Task 2); `ProblemDetails`, `problemDetailsSchema` (Task 1)
- Produces:
  - `interface RequestWithId extends Request { id: string }`; `requestId(req, res, next): void`; `ULID_PATTERN: RegExp`
  - `class ValidationFailedError extends Error { issues: ValidationIssue[] }`, `interface ValidationIssue { path: (string | number)[]; message: string }`
  - `class ZodValidationPipe<T extends z.ZodTypeAny> implements PipeTransform` — `new ZodValidationPipe(schema)`, returns `z.output<T>`, throws `ValidationFailedError`
  - `toProblem(exception: unknown, context: { instance: string; requestId: string }, baseUrl: string): ProblemDetails`; `class ProblemDetailsFilter` (`new ProblemDetailsFilter(baseUrl)`)
  - `isAllowedOrigin(origin: string, allowlist: readonly string[], previewPattern?: RegExp): boolean`; `corsOptions(env: Env): CorsOptions`
  - `securityHeaders(): RequestHandler`
  - `PUBLIC_CACHE_CONTROL: string`; `PublicCacheInterceptor` (use with `@UseInterceptors(PublicCacheInterceptor)`)
  - `cloudTraceFields(header: string | string[] | undefined, project: string | undefined): Record<string, string>`; `pinoHttpOptions(env: Env): Options`
  - `createApp(env: Env, root?: DynamicModule): Promise<NestExpressApplication>` — `root` defaults to `AppModule.forRoot(env)`; tests pass a fixture module that imports `AppModule.forRoot(env)`

- [ ] **Step 1: Write the failing pure-function tests**

`apps/api/src/http/pure.test.ts`:

```ts
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @repo/api test`
Expected: FAIL — `./cors`, `./logging`, `./problem-details`, `./validation` do not exist.

- [ ] **Step 3: Implement the HTTP modules**

`apps/api/src/http/request-id.ts`:

```ts
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
```

`apps/api/src/http/validation.ts`:

```ts
import type { PipeTransform } from '@nestjs/common'
import type { z } from 'zod'

export interface ValidationIssue {
  path: (string | number)[]
  message: string
}

export class ValidationFailedError extends Error {
  constructor(readonly issues: ValidationIssue[]) {
    super(
      issues
        .map((issue) => (issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
        .join('; '),
    )
    this.name = 'ValidationFailedError'
  }
}

/**
 * Validates a param, query or body against a `@repo/contracts` schema — the same definition the
 * OpenAPI document and the web app use. Replaces `nestjs-zod` (see plan refinement 2).
 */
export class ZodValidationPipe<T extends z.ZodTypeAny> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value)
    if (result.success) return result.data
    throw new ValidationFailedError(
      result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    )
  }
}
```

`apps/api/src/http/problem-details.ts`:

```ts
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
```

`apps/api/src/http/cors.ts`:

```ts
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface'
import type { Env } from '../config/env'

export function isAllowedOrigin(origin: string, allowlist: readonly string[], previewPattern?: RegExp): boolean {
  return allowlist.includes(origin) || (previewPattern?.test(origin) ?? false)
}

/**
 * Strict allowlist, credentials off. A disallowed origin still gets its response — browsers
 * enforce CORS — it simply receives no Access-Control-Allow-Origin header.
 */
export function corsOptions(env: Env): CorsOptions {
  return {
    origin: (origin, callback) => {
      callback(
        null,
        origin !== undefined && isAllowedOrigin(origin, env.CORS_ORIGINS, env.CORS_PREVIEW_ORIGIN_PATTERN),
      )
    },
    methods: ['GET', 'HEAD', 'OPTIONS'],
    credentials: false,
    exposedHeaders: ['ETag', 'X-Request-Id'],
    maxAge: 600,
  }
}
```

`apps/api/src/http/security.ts`:

```ts
import type { RequestHandler } from 'express'
import helmet from 'helmet'

/**
 * helmet everywhere (HSTS, nosniff, frame protections, CSP). Swagger UI at /docs ships inline
 * scripts and styles, so only that path runs without a Content-Security-Policy.
 */
export function securityHeaders(): RequestHandler {
  const strict = helmet()
  const docs = helmet({ contentSecurityPolicy: false })
  return (req, res, next) =>
    req.path === '/docs' || req.path.startsWith('/docs/') ? docs(req, res, next) : strict(req, res, next)
}
```

`apps/api/src/http/cache.ts`:

```ts
import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common'
import type { Response } from 'express'
import { type Observable, tap } from 'rxjs'

/** Spec §3.1. The CDN caches for 5 minutes and may serve stale for a day while revalidating. */
export const PUBLIC_CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=86400'

/** For public reads only. Errors never reach `tap`, so they keep the filter's `no-store`. */
@Injectable()
export class PublicCacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      tap(() => {
        context.switchToHttp().getResponse<Response>().setHeader('Cache-Control', PUBLIC_CACHE_CONTROL)
      }),
    )
  }
}
```

`apps/api/src/http/logging.ts`:

```ts
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
```

- [ ] **Step 4: Run the pure tests to verify they pass**

Run: `pnpm --filter @repo/api test`
Expected: PASS.

- [ ] **Step 5: Write the failing app-level test**

`apps/api/src/http/http.test.ts`:

```ts
import { Controller, Get, Module, Query, UseInterceptors } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { problemDetailsSchema } from '@repo/contracts'
import { testEnv } from '../../test/support/env'
import { createApp } from '../app'
import { AppModule } from '../app.module'
import { PUBLIC_CACHE_CONTROL, PublicCacheInterceptor } from './cache'
import { ULID_PATTERN } from './request-id'
import { ZodValidationPipe } from './validation'

const querySchema = z.object({ limit: z.coerce.number().int().max(5).default(1) }).strict()

@Controller('fixture')
class FixtureController {
  @Get('items')
  @UseInterceptors(PublicCacheInterceptor)
  items(@Query(new ZodValidationPipe(querySchema)) query: z.output<typeof querySchema>) {
    return { limit: query.limit }
  }

  @Get('boom')
  boom(): never {
    throw new Error('database password is hunter2')
  }
}

describe('HTTP behaviour shared by every route', () => {
  const env = testEnv({ CORS_PREVIEW_ORIGIN_PATTERN: '^https://portfolio-[a-z0-9-]+\\.vercel\\.app$' })
  let app: NestExpressApplication
  let http: ReturnType<typeof request>

  beforeAll(async () => {
    @Module({ imports: [AppModule.forRoot(env)], controllers: [FixtureController] })
    class FixtureModule {}
    app = await createApp(env, { module: FixtureModule })
    await app.init()
    http = request(app.getHttpServer())
  })

  afterAll(async () => {
    await app.close()
  })

  describe('request IDs', () => {
    it('issues a ULID and echoes it', async () => {
      const response = await http.get('/fixture/items').expect(200)
      expect(response.headers['x-request-id']).toMatch(ULID_PATTERN)
    })

    it('reuses an incoming ULID and replaces anything else', async () => {
      const id = '01J8Z3K4M5N6P7Q8R9S0T1V2W3'
      expect((await http.get('/fixture/items').set('X-Request-Id', id)).headers['x-request-id']).toBe(id)
      const injected = await http.get('/fixture/items').set('X-Request-Id', 'x\nforged log line')
      expect(injected.headers['x-request-id']).toMatch(ULID_PATTERN)
    })
  })

  describe('caching', () => {
    it('marks public reads cacheable and answers a matching If-None-Match with 304', async () => {
      const first = await http.get('/fixture/items').expect(200)
      expect(first.headers['cache-control']).toBe(PUBLIC_CACHE_CONTROL)
      const etag = first.headers['etag']
      expect(etag).toMatch(/^"/)
      await http.get('/fixture/items').set('If-None-Match', String(etag)).expect(304)
    })
  })

  describe('Problem Details', () => {
    it('returns 422 for an invalid query, with the issue path', async () => {
      const response = await http.get('/fixture/items?limit=9').expect(422)
      expect(response.headers['content-type']).toMatch(/^application\/problem\+json/)
      expect(response.headers['cache-control']).toBe('no-store')
      const problem = problemDetailsSchema.parse(JSON.parse(response.text))
      expect(problem).toMatchObject({
        type: 'http://api.test/problems/validation-failed',
        status: 422,
        instance: '/fixture/items',
        requestId: response.headers['x-request-id'],
      })
      expect(problem.errors?.[0]?.path).toEqual(['limit'])
    })

    it('rejects unknown query parameters', async () => {
      await http.get('/fixture/items?sort=name').expect(422)
    })

    it('returns 404 for an unknown route', async () => {
      const response = await http.get('/v1/nope').expect(404)
      expect(problemDetailsSchema.parse(JSON.parse(response.text)).type).toBe('http://api.test/problems/not-found')
    })

    it('returns a generic 500 that leaks neither the message nor a stack', async () => {
      const response = await http.get('/fixture/boom').expect(500)
      expect(response.text).not.toContain('hunter2')
      expect(response.text).not.toContain('at ')
      expect(JSON.parse(response.text).detail).toBe('An unexpected error occurred.')
    })
  })

  describe('CORS', () => {
    it('allows a listed origin and a preview deploy', async () => {
      const listed = await http.get('/fixture/items').set('Origin', 'https://allowed.test')
      expect(listed.headers['access-control-allow-origin']).toBe('https://allowed.test')
      const preview = await http.get('/fixture/items').set('Origin', 'https://portfolio-git-x.vercel.app')
      expect(preview.headers['access-control-allow-origin']).toBe('https://portfolio-git-x.vercel.app')
    })

    it('gives any other origin no CORS grant, including on preflight', async () => {
      const simple = await http.get('/fixture/items').set('Origin', 'https://evil.example')
      expect(simple.headers['access-control-allow-origin']).toBeUndefined()
      const preflight = await http
        .options('/fixture/items')
        .set('Origin', 'https://evil.example')
        .set('Access-Control-Request-Method', 'GET')
      expect(preflight.headers['access-control-allow-origin']).toBeUndefined()
    })

    it('never allows credentials', async () => {
      const response = await http.get('/fixture/items').set('Origin', 'https://allowed.test')
      expect(response.headers['access-control-allow-credentials']).toBeUndefined()
    })
  })

  describe('security headers', () => {
    it('sends helmet headers with a CSP, except under /docs', async () => {
      const api = await http.get('/fixture/items')
      expect(api.headers['strict-transport-security']).toBeDefined()
      expect(api.headers['x-content-type-options']).toBe('nosniff')
      expect(api.headers['content-security-policy']).toBeDefined()
      const docs = await http.get('/docs/anything')
      expect(docs.headers['content-security-policy']).toBeUndefined()
    })
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @repo/api test`
Expected: FAIL — `createApp` does not accept a root module; no request IDs, CORS or Problem Details yet.

- [ ] **Step 7: Wire the globals into `createApp` and the logger into `AppModule`**

Replace `apps/api/src/app.ts` with:

```ts
import 'reflect-metadata'
import type { DynamicModule } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module'
import type { Env } from './config/env'
import { corsOptions } from './http/cors'
import { ProblemDetailsFilter } from './http/problem-details'
import { requestId } from './http/request-id'
import { securityHeaders } from './http/security'

/**
 * Builds the fully configured application without listening. Every global — logging, headers,
 * CORS, errors, OpenAPI — is applied here and only here, so tests exercise exactly what ships.
 * `root` exists for tests, which wrap `AppModule.forRoot(env)` with fixture controllers.
 */
export async function createApp(
  env: Env,
  root: DynamicModule = AppModule.forRoot(env),
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(root, { bufferLogs: true })
  app.useLogger(app.get(Logger))

  // Strong ETags; Express answers a matching If-None-Match with 304 on its own.
  app.set('etag', 'strong')
  app.disable('x-powered-by')
  // Cloud Run terminates TLS in front of the container.
  app.set('trust proxy', true)

  // Order matters: the request ID must exist before the logger and the filter read it.
  app.use(requestId)
  app.use(securityHeaders())
  app.enableCors(corsOptions(env))
  app.useGlobalFilters(new ProblemDetailsFilter(env.PUBLIC_BASE_URL))

  // SIGTERM → stop accepting, drain, run onApplicationShutdown hooks (Cloud Run allows 10 s).
  app.enableShutdownHooks()

  return app
}
```

Replace `apps/api/src/app.module.ts` with:

```ts
import { type DynamicModule, Module } from '@nestjs/common'
import { LoggerModule } from 'nestjs-pino'
import { ConfigModule } from './config/config.module'
import { ENV, type Env } from './config/env'
import { HealthController } from './health/health.controller'
import { pinoHttpOptions } from './http/logging'

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        LoggerModule.forRootAsync({
          inject: [ENV],
          useFactory: (config: Env) => ({ pinoHttp: pinoHttpOptions(config) }),
        }),
      ],
      controllers: [HealthController],
    }
  }
}
```

- [ ] **Step 8: Run the whole unit suite, typecheck and lint**

Run: `pnpm --filter @repo/api test && pnpm --filter @repo/api typecheck && pnpm --filter @repo/api lint`
Expected: PASS — including Task 2's health tests, now running through the full global stack.

- [ ] **Step 9: Commit**

```bash
git add apps/api
git commit -m "feat(api): request IDs, RFC 9457 errors, Zod validation, CORS allowlist, helmet, cache headers, Cloud Logging

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Postgres — local database, Drizzle schema, `DbModule`, integration-test harness

**Prerequisite:** Docker Desktop running (`docker info` succeeds). Integration tests start `postgres:17-alpine` through Testcontainers unless `TEST_DATABASE_URL` points at an existing server.

**Files:**
- Create: `docker-compose.dev.yml` (repo root)
- Create: `apps/api/drizzle.config.ts`
- Create: `apps/api/src/db/schema/content.ts`, `apps/api/src/db/schema/seed-runs.ts`, `apps/api/src/db/schema/index.ts`
- Create: `apps/api/src/db/connection.ts`, `apps/api/src/db/db.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/test/global-setup.ts`, `apps/api/test/support/database.ts`
- Test: `apps/api/test/db/db-module.int.test.ts`

**Interfaces:**
- Consumes: `Env`, `ENV`, `createApp`, `AppModule`, `testEnv` (Tasks 2–3); `Profile` (Task 1)
- Produces:
  - Drizzle tables: `profile`, `domains`, `projects`, `projectOutcomes`, `experiences`, `skillGroups`, `skills`, `seedRuns` (exported from `src/db/schema/index.ts` as `schema` members and named exports)
  - `createPool(connectionString: string, max?: number): Pool` (attaches an `error` listener)
  - `PG_POOL`, `DB` tokens; `type Database = NodePgDatabase<typeof schema>`; `DbModule` (global)
  - `createTestDatabase(baseUrl: string): Promise<TestDatabase>` with `TestDatabase { url: string; drop(): Promise<void> }` — one throwaway database per test file
  - Vitest provided context `databaseUrl: string` (read with `inject('databaseUrl')`)

- [ ] **Step 1: Add the local database**

`docker-compose.dev.yml`:

```yaml
# Local Postgres for apps/api. Port 5433 avoids clashing with a system Postgres on 5432.
#   docker compose -f docker-compose.dev.yml up -d
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: portfolio
      POSTGRES_PASSWORD: portfolio
      POSTGRES_DB: portfolio
    ports:
      - '5433:5432'
    volumes:
      - portfolio-pg:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U portfolio']
      interval: 2s
      timeout: 3s
      retries: 20

volumes:
  portfolio-pg: {}
```

Run: `docker compose -f docker-compose.dev.yml up -d && cp apps/api/.env.example apps/api/.env`
Expected: container `healthy` within ~10 s (`docker compose -f docker-compose.dev.yml ps`).

- [ ] **Step 2: Define the schema**

`apps/api/src/db/schema/content.ts`:

```ts
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import type { Profile, Project } from '@repo/contracts'

/**
 * Content tables — seeded from git, never written at runtime (spec §4). Every parent row carries
 * `content_hash`, so a seed run is idempotent and drift between git and the database is
 * detectable. Child rows (outcomes, skills) are covered by their parent's hash.
 */
const seeded = {
  contentHash: text('content_hash').notNull(),
  seededAt: timestamp('seeded_at', { withTimezone: true }).notNull().defaultNow(),
}

export const profile = pgTable(
  'profile',
  {
    id: smallint('id').primaryKey().default(1),
    name: text('name').notNull(),
    headline: text('headline').notNull(),
    sub: text('sub').notNull(),
    location: text('location').notNull(),
    email: text('email').notNull(),
    emailPlaceholder: boolean('email_placeholder').notNull().default(false),
    availability: text('availability').notNull(),
    roles: jsonb('roles').$type<Profile['roles']>().notNull(),
    links: jsonb('links').$type<Profile['links']>().notNull(),
    kpis: jsonb('kpis').$type<Profile['kpis']>().notNull(),
    ...seeded,
  },
  (t) => [check('profile_singleton', sql`${t.id} = 1`)],
)

export const domains = pgTable(
  'domains',
  {
    id: text('id').primaryKey(),
    label: text('label').notNull(),
    blurb: text('blurb').notNull(),
    accent: text('accent').notNull(),
    position: integer('position').notNull(),
    ...seeded,
  },
  (t) => [check('domains_accent', sql`${t.accent} in ('violet', 'cyan')`)],
)

export const projects = pgTable(
  'projects',
  {
    slug: text('slug').primaryKey(),
    name: text('name').notNull(),
    domainId: text('domain_id')
      .notNull()
      .references(() => domains.id),
    role: text('role').notNull(),
    periodFrom: text('period_from').notNull(),
    periodTo: text('period_to'),
    summary: text('summary').notNull(),
    stack: text('stack').array().notNull(),
    visibility: text('visibility').notNull(),
    featured: boolean('featured').notNull(),
    sortOrder: integer('sort_order').notNull(),
    links: jsonb('links').$type<Project['links']>().notNull(),
    formation: text('formation').notNull(),
    placeholder: boolean('placeholder').notNull(),
    ...seeded,
  },
  (t) => [
    // `order` is unique in content (enforced by the seed), so it alone is the pagination key.
    uniqueIndex('projects_sort_order_key').on(t.sortOrder),
    index('projects_domain_idx').on(t.domainId),
    check('projects_visibility', sql`${t.visibility} in ('public', 'private', 'client')`),
  ],
)

export const projectOutcomes = pgTable(
  'project_outcomes',
  {
    projectSlug: text('project_slug')
      .notNull()
      .references(() => projects.slug, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    label: text('label').notNull(),
    value: text('value').notNull(),
    placeholder: boolean('placeholder').notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectSlug, t.position] })],
)

export const experiences = pgTable('experiences', {
  id: text('id').primaryKey(),
  org: text('org').notNull(),
  title: text('title').notNull(),
  periodFrom: text('period_from').notNull(),
  periodTo: text('period_to'),
  location: text('location'),
  highlights: text('highlights').array().notNull(),
  placeholder: boolean('placeholder').notNull(),
  position: integer('position').notNull(),
  ...seeded,
})

export const skillGroups = pgTable('skill_groups', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  position: integer('position').notNull(),
  ...seeded,
})

export const skills = pgTable(
  'skills',
  {
    groupId: text('group_id')
      .notNull()
      .references(() => skillGroups.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    name: text('name').notNull(),
    level: text('level').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.position] }),
    check('skills_level', sql`${t.level} in ('core', 'working', 'familiar')`),
  ],
)
```

`apps/api/src/db/schema/seed-runs.ts`:

```ts
import { boolean, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/** Content deploy history (spec §4). One row per seed run, dry runs included. */
export const seedRuns = pgTable('seed_runs', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  gitSha: text('git_sha').notNull(),
  contentHash: text('content_hash').notNull(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
  dryRun: boolean('dry_run').notNull(),
  result: jsonb('result').notNull(),
})
```

`apps/api/src/db/schema/index.ts`:

```ts
import * as content from './content'
import * as seedRunsModule from './seed-runs'

export * from './content'
export * from './seed-runs'

/** Every table, for `drizzle(pool, { schema })`. */
export const schema = { ...content, ...seedRunsModule }
```

`apps/api/drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit'

/**
 * Drizzle Kit only *generates* SQL into ./drizzle (committed as generator state). The runnable
 * migrations live in ./migrations with hand-written down.sql files — see migrations/README.md.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
})
```

- [ ] **Step 3: Write the connection and module**

`apps/api/src/db/connection.ts`:

```ts
import { Logger } from '@nestjs/common'
import { Pool } from 'pg'

const logger = new Logger('Postgres')

/**
 * One pool per process. Neon closes idle connections server-side; without an `error` listener,
 * that surfaces as an unhandled 'error' event and kills the process.
 */
export function createPool(connectionString: string, max = 5): Pool {
  const pool = new Pool({
    connectionString,
    max,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
  })
  pool.on('error', (error) => {
    logger.warn(`Idle Postgres client error: ${error.message}`)
  })
  return pool
}
```

`apps/api/src/db/db.module.ts`:

```ts
import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'
import { ENV, type Env } from '../config/env'
import { createPool } from './connection'
import { schema } from './schema'

export const PG_POOL = Symbol('PG_POOL')
export const DB = Symbol('DB')

export type Database = NodePgDatabase<typeof schema>

/** Closes the pool on SIGTERM so in-flight queries finish and Neon sees clean disconnects. */
@Injectable()
class PoolCloser implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end()
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ENV],
      useFactory: (env: Env): Pool => createPool(env.DATABASE_URL, env.DB_POOL_MAX),
    },
    {
      provide: DB,
      inject: [PG_POOL],
      useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
    },
    PoolCloser,
  ],
  exports: [PG_POOL, DB],
})
export class DbModule {}
```

In `apps/api/src/app.module.ts`, add `import { DbModule } from './db/db.module'` and add `DbModule` to the `imports` array after the `LoggerModule` entry.

Run: `pnpm --filter @repo/api test && pnpm --filter @repo/api typecheck`
Expected: PASS — the pool is lazy, so the unit tests (which never query) are unaffected.

- [ ] **Step 4: Write the integration harness**

`apps/api/test/global-setup.ts`:

```ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { TestProject } from 'vitest/node'

let container: StartedPostgreSqlContainer | undefined

/**
 * One Postgres for the whole integration run. CI sets TEST_DATABASE_URL to its service
 * container; locally Testcontainers starts the same major version Neon runs.
 */
export async function setup(project: TestProject): Promise<void> {
  let url = process.env['TEST_DATABASE_URL']
  if (url === undefined || url === '') {
    container = await new PostgreSqlContainer('postgres:17-alpine').start()
    url = container.getConnectionUri()
  }
  project.provide('databaseUrl', url)
}

export async function teardown(): Promise<void> {
  await container?.stop()
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string
  }
}
```

`apps/api/test/support/database.ts`:

```ts
import { randomBytes } from 'node:crypto'
import { Client } from 'pg'

export interface TestDatabase {
  url: string
  drop(): Promise<void>
}

async function onServer(baseUrl: string, statement: string): Promise<void> {
  const client = new Client({ connectionString: baseUrl })
  await client.connect()
  try {
    await client.query(statement)
  } finally {
    await client.end()
  }
}

/** A fresh, empty database per test file, so files never see each other's rows or schema. */
export async function createTestDatabase(baseUrl: string): Promise<TestDatabase> {
  // Generated from hex only, so it is safe to interpolate into DDL.
  const name = `test_${randomBytes(6).toString('hex')}`
  await onServer(baseUrl, `create database ${name}`)
  const url = new URL(baseUrl)
  url.pathname = `/${name}`
  return {
    url: url.toString(),
    drop: () => onServer(baseUrl, `drop database if exists ${name} with (force)`),
  }
}
```

- [ ] **Step 5: Write the integration test**

`apps/api/test/db/db-module.int.test.ts`:

```ts
import type { NestExpressApplication } from '@nestjs/platform-express'
import type { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createApp } from '../../src/app'
import { PG_POOL } from '../../src/db/db.module'
import { createTestDatabase, type TestDatabase } from '../support/database'
import { testEnv } from '../support/env'

describe('DbModule', () => {
  let database: TestDatabase
  let app: NestExpressApplication

  beforeAll(async () => {
    database = await createTestDatabase(inject('databaseUrl'))
    app = await createApp(testEnv({ DATABASE_URL: database.url }))
    await app.init()
  })

  afterAll(async () => {
    await database.drop()
  })

  it('reaches Postgres through the pooled connection', async () => {
    const pool = app.get<Pool>(PG_POOL)
    const result = await pool.query<{ one: number }>('select 1 as one')
    expect(result.rows[0]?.one).toBe(1)
  })

  it('ends the pool when the application shuts down', async () => {
    const pool = app.get<Pool>(PG_POOL)
    await app.close()
    expect(pool.ended).toBe(true)
  })
})
```

- [ ] **Step 6: Run the integration suite**

Run: `pnpm --filter @repo/api test:integration`
Expected: PASS (2 tests). The first run pulls `postgres:17-alpine`, which can take a minute.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.dev.yml apps/api
git commit -m "feat(api): Drizzle content schema, pooled DbModule and a real-Postgres test harness

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Reversible migration toolkit — loader, lock analyser, runner, `db:migrate` CLI

Spec §6 is the contract: `--dry-run` prints the exact SQL and flags `ACCESS EXCLUSIVE` statements; `--apply` runs in a transaction and records a checksum; `--rollback <n>` runs the paired `down.sql`; `--status` shows applied vs pending with drift detection; a missing `down.sql` fails the build. This task builds and proves the machinery against fixture migrations; Task 6 writes the first real one.

**Files:**
- Create: `apps/api/src/db/migrations/load.ts`, `locks.ts`, `runner.ts`, `cli.ts`
- Create: `apps/api/src/db/cli/migrate.ts`
- Create: `apps/api/test/support/migrations.ts`
- Test: `apps/api/src/db/migrations/load.test.ts`, `locks.test.ts`, `cli.test.ts`
- Test: `apps/api/test/db/migrations-runner.int.test.ts`

**Interfaces:**
- Consumes: `createTestDatabase`, `inject('databaseUrl')` (Task 4)
- Produces:
  - `interface Migration { id: string; up: string; down: string; checksum: string }`
  - `loadMigrations(dir: string): Promise<Migration[]>` (sorted by id); `class MigrationLayoutError extends Error`; `checksumOf(sql: string): string`
  - `splitStatements(sql: string): string[]`; `accessExclusiveStatements(sql: string): string[]`
  - `readStatus(client: ClientBase, migrations: Migration[]): Promise<MigrationStatus>` — read-only; `MigrationStatus { entries: { id: string; state: 'applied' | 'pending' | 'drifted' }[]; pending: Migration[]; drifted: string[]; orphaned: string[] }`
  - `applyPending(client: ClientBase, migrations: Migration[]): Promise<string[]>`; `rollback(client: ClientBase, migrations: Migration[], count: number): Promise<string[]>`; `class MigrationStateError extends Error`
  - `runMigrateCli(argv: string[], io: CliIo, env: NodeJS.ProcessEnv): Promise<number>`; `interface CliIo { out(line: string): void; err(line: string): void }` — exit codes: `0` ok, `1` drift/layout/state failure, `2` usage error
  - `writeMigrations(files: Record<string, { up: string; down?: string }>): Promise<string>` (returns a temp directory) in `test/support/migrations.ts`

- [ ] **Step 1: Write the fixture helper and the failing unit tests**

`apps/api/test/support/migrations.ts`:

```ts
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Writes migration directories into a fresh temp dir. Omit `down` to test the reversibility rule. */
export async function writeMigrations(files: Record<string, { up: string; down?: string }>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'migrations-'))
  for (const [id, { up, down }] of Object.entries(files)) {
    await mkdir(join(root, id))
    await writeFile(join(root, id, 'up.sql'), up)
    if (down !== undefined) await writeFile(join(root, id, 'down.sql'), down)
  }
  return root
}
```

`apps/api/src/db/migrations/load.test.ts`:

```ts
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeMigrations } from '../../../test/support/migrations'
import { checksumOf, loadMigrations, MigrationLayoutError } from './load'

describe('loadMigrations', () => {
  it('loads directories in id order with a checksum of up.sql', async () => {
    const dir = await writeMigrations({
      '0001_b': { up: 'create table b (id int);', down: 'drop table b;' },
      '0000_a': { up: 'create table a (id int);', down: 'drop table a;' },
    })
    const migrations = await loadMigrations(dir)
    expect(migrations.map((m) => m.id)).toEqual(['0000_a', '0001_b'])
    expect(migrations[0]?.checksum).toBe(checksumOf('create table a (id int);'))
  })

  it('treats CRLF and LF as the same file, so a Windows checkout never reads as drift', () => {
    expect(checksumOf('create table a (id int);\r\n')).toBe(checksumOf('create table a (id int);\n'))
  })

  it('fails when a migration has no down.sql', async () => {
    const dir = await writeMigrations({ '0000_a': { up: 'create table a (id int);' } })
    await expect(loadMigrations(dir)).rejects.toThrow(/0000_a has no down\.sql/)
  })

  it('fails when down.sql holds only comments', async () => {
    const dir = await writeMigrations({ '0000_a': { up: 'create table a (id int);', down: '-- TODO\n' } })
    await expect(loadMigrations(dir)).rejects.toThrow(MigrationLayoutError)
  })

  it('rejects badly named directories, duplicate prefixes and stray files', async () => {
    await expect(
      loadMigrations(await writeMigrations({ 'add-table': { up: 'select 1;', down: 'select 1;' } })),
    ).rejects.toThrow(/NNNN_snake_name/)
    await expect(
      loadMigrations(
        await writeMigrations({
          '0000_a': { up: 'select 1;', down: 'select 1;' },
          '0000_b': { up: 'select 1;', down: 'select 1;' },
        }),
      ),
    ).rejects.toThrow(/prefix 0000/)
    const stray = await writeMigrations({ '0000_a': { up: 'select 1;', down: 'select 1;' } })
    await writeFile(join(stray, '0001_loose.sql'), 'select 1;')
    await expect(loadMigrations(stray)).rejects.toThrow(/Unexpected file/)
  })
})
```

`apps/api/src/db/migrations/locks.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { accessExclusiveStatements, splitStatements } from './locks'

describe('splitStatements', () => {
  it('splits on semicolons and ignores comments, including Drizzle breakpoints', () => {
    const sql = 'CREATE TABLE "a" (\n  "id" int\n);\n--> statement-breakpoint\n-- note; not a statement\nDROP TABLE "b";'
    expect(splitStatements(sql)).toEqual(['CREATE TABLE "a" ( "id" int )', 'DROP TABLE "b"'])
  })
})

describe('accessExclusiveStatements', () => {
  it.each([
    'ALTER TABLE "projects" ADD COLUMN "x" text',
    'DROP TABLE "projects"',
    'DROP INDEX "projects_sort_idx"',
    'TRUNCATE "events"',
    'LOCK TABLE "projects"',
    'VACUUM FULL "events"',
    'REINDEX TABLE "projects"',
    'CLUSTER "projects"',
    'REFRESH MATERIALIZED VIEW "rollup"',
  ])('flags %s', (statement) => {
    expect(accessExclusiveStatements(`${statement};`)).toEqual([statement])
  })

  it.each([
    'CREATE TABLE "a" ("id" int)',
    'CREATE INDEX CONCURRENTLY "i" ON "a" ("id")',
    'DROP INDEX CONCURRENTLY "i"',
    'REINDEX TABLE CONCURRENTLY "projects"',
    'REFRESH MATERIALIZED VIEW CONCURRENTLY "rollup"',
    'INSERT INTO "a" VALUES (1)',
  ])('does not flag %s', (statement) => {
    expect(accessExclusiveStatements(`${statement};`)).toEqual([])
  })
})
```

`apps/api/src/db/migrations/cli.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { writeMigrations } from '../../../test/support/migrations'
import { type CliIo, runMigrateCli } from './cli'

function capture(): CliIo & { stdout: string[]; stderr: string[] } {
  const stdout: string[] = []
  const stderr: string[] = []
  return { stdout, stderr, out: (line) => stdout.push(line), err: (line) => stderr.push(line) }
}

describe('db:migrate CLI — paths that need no database', () => {
  it('--verify passes when every migration is reversible', async () => {
    const dir = await writeMigrations({ '0000_a': { up: 'create table a (id int);', down: 'drop table a;' } })
    const io = capture()
    expect(await runMigrateCli(['--verify', '--dir', dir], io, {})).toBe(0)
    expect(io.stdout.join('\n')).toMatch(/1 migration/)
  })

  it('--verify fails, naming the migration, when a down.sql is missing', async () => {
    const dir = await writeMigrations({ '0000_a': { up: 'create table a (id int);' } })
    const io = capture()
    expect(await runMigrateCli(['--verify', '--dir', dir], io, {})).toBe(1)
    expect(io.stderr.join('\n')).toMatch(/0000_a has no down\.sql/)
  })

  it('requires exactly one mode', async () => {
    expect(await runMigrateCli([], capture(), {})).toBe(2)
    expect(await runMigrateCli(['--apply', '--status'], capture(), {})).toBe(2)
  })

  it('refuses a rollback without --yes', async () => {
    const dir = await writeMigrations({ '0000_a': { up: 'create table a (id int);', down: 'drop table a;' } })
    const io = capture()
    expect(await runMigrateCli(['--rollback', '1', '--dir', dir], io, { DATABASE_URL: 'postgres://x@127.0.0.1:1/x' })).toBe(2)
    expect(io.stderr.join('\n')).toMatch(/--yes/)
  })

  it('requires a postgres DATABASE_URL for database modes', async () => {
    const dir = await writeMigrations({ '0000_a': { up: 'create table a (id int);', down: 'drop table a;' } })
    const io = capture()
    expect(await runMigrateCli(['--status', '--dir', dir], io, {})).toBe(2)
    expect(io.stderr.join('\n')).toMatch(/DATABASE_URL/)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @repo/api test`
Expected: FAIL — `./load`, `./locks`, `./cli` do not exist.

- [ ] **Step 3: Implement the loader and lock analyser**

`apps/api/src/db/migrations/load.ts`:

```ts
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface Migration {
  /** Directory name, e.g. `0000_content_tables`. Sorting ids sorts migrations. */
  id: string
  up: string
  down: string
  /** sha256 of `up.sql` with LF line endings. A changed applied migration is drift. */
  checksum: string
}

export class MigrationLayoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationLayoutError'
  }
}

const ID_PATTERN = /^(\d{4})_[a-z0-9_]+$/
const ALLOWED_FILES = new Set(['README.md'])

function normalize(sql: string): string {
  return sql.replace(/\r\n/g, '\n')
}

function hasStatements(sql: string): boolean {
  return sql.split('\n').some((line) => line.replace(/--.*$/, '').trim() !== '')
}

export function checksumOf(sql: string): string {
  return createHash('sha256').update(normalize(sql)).digest('hex')
}

async function readRequired(path: string, missingMessage: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new MigrationLayoutError(missingMessage)
    throw error
  }
}

/**
 * Reads `<dir>/NNNN_name/{up,down}.sql`. Enforces the reversibility policy (spec §6): a missing
 * or empty down.sql is a layout error, which fails `db:migrate --verify` and therefore CI.
 */
export async function loadMigrations(dir: string): Promise<Migration[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const migrations: Migration[] = []
  const prefixes = new Set<string>()

  for (const entry of entries) {
    if (entry.isFile()) {
      if (ALLOWED_FILES.has(entry.name)) continue
      throw new MigrationLayoutError(`Unexpected file ${entry.name} in ${dir}: migrations are directories`)
    }
    if (!entry.isDirectory()) continue

    const match = ID_PATTERN.exec(entry.name)
    if (match === null) {
      throw new MigrationLayoutError(`${entry.name}: migration directories must match NNNN_snake_name`)
    }
    const prefix = match[1] ?? ''
    if (prefixes.has(prefix)) throw new MigrationLayoutError(`Two migrations share the prefix ${prefix}`)
    prefixes.add(prefix)

    const up = await readRequired(join(dir, entry.name, 'up.sql'), `${entry.name} has no up.sql`)
    const down = await readRequired(
      join(dir, entry.name, 'down.sql'),
      `${entry.name} has no down.sql — every migration must be reversible`,
    )
    if (!hasStatements(up)) throw new MigrationLayoutError(`${entry.name}/up.sql has no statements`)
    if (!hasStatements(down)) {
      throw new MigrationLayoutError(`${entry.name}/down.sql has no statements — write the SQL that undoes up.sql`)
    }

    migrations.push({ id: entry.name, up: normalize(up), down: normalize(down), checksum: checksumOf(up) })
  }

  return migrations.sort((a, b) => a.id.localeCompare(b.id))
}
```

`apps/api/src/db/migrations/locks.ts`:

```ts
/**
 * Statement splitting for *display and analysis only* — migrations always execute exactly as
 * written. The split is on `;` after stripping `--` comments, which is correct for the DDL this
 * repo writes; it is not a general SQL parser (a `;` inside a string or function body would
 * split early, which can only over-report, never hide, a lock).
 */
export function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement !== '')
}

/**
 * Forms that take an ACCESS EXCLUSIVE lock, blocking reads on the table while they run.
 * Conservative: every `ALTER TABLE` is flagged, although a few forms take weaker locks.
 */
const ACCESS_EXCLUSIVE: readonly RegExp[] = [
  /^ALTER TABLE\b/i,
  /^DROP TABLE\b/i,
  /^DROP INDEX (?!CONCURRENTLY\b)/i,
  /^TRUNCATE\b/i,
  /^LOCK TABLE\b/i,
  /^CLUSTER\b/i,
  /^VACUUM FULL\b/i,
  /^REINDEX (?!.*\bCONCURRENTLY\b)/i,
  /^REFRESH MATERIALIZED VIEW (?!CONCURRENTLY\b)/i,
]

export function accessExclusiveStatements(sql: string): string[] {
  return splitStatements(sql).filter((statement) => ACCESS_EXCLUSIVE.some((pattern) => pattern.test(statement)))
}
```

- [ ] **Step 4: Run the loader and lock tests to verify they pass**

Run: `pnpm --filter @repo/api exec vitest run --project unit src/db/migrations/load.test.ts src/db/migrations/locks.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing runner integration test**

`apps/api/test/db/migrations-runner.int.test.ts`:

```ts
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { type CliIo, runMigrateCli } from '../../src/db/migrations/cli'
import { loadMigrations } from '../../src/db/migrations/load'
import { applyPending, MigrationStateError, readStatus, rollback } from '../../src/db/migrations/runner'
import { createTestDatabase, type TestDatabase } from '../support/database'
import { writeMigrations } from '../support/migrations'

const FIXTURES = {
  '0000_widgets': { up: 'create table widgets (id int primary key);', down: 'drop table widgets;' },
  '0001_widget_name': {
    up: 'alter table widgets add column name text;',
    down: 'alter table widgets drop column name;',
  },
}

async function columns(client: Client, table: string): Promise<string[]> {
  const result = await client.query<{ column_name: string }>(
    `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position`,
    [table],
  )
  return result.rows.map((row) => row.column_name)
}

async function ledger(client: Client): Promise<string[]> {
  const exists = await client.query<{ t: string | null }>(`select to_regclass('public.schema_migrations') as t`)
  if (exists.rows[0]?.t === null) return []
  const result = await client.query<{ id: string }>('select id from schema_migrations order by id')
  return result.rows.map((row) => row.id)
}

describe('migration runner', () => {
  let database: TestDatabase
  let client: Client
  let dir: string

  beforeAll(async () => {
    database = await createTestDatabase(inject('databaseUrl'))
  })

  afterAll(async () => {
    await database.drop()
  })

  beforeEach(async () => {
    client = new Client({ connectionString: database.url })
    await client.connect()
    await client.query('drop schema public cascade; create schema public;')
    dir = await writeMigrations(FIXTURES)
  })

  afterEach(async () => {
    await client.end()
  })

  it('reports everything pending on an empty database, without creating the ledger', async () => {
    const status = await readStatus(client, await loadMigrations(dir))
    expect(status.entries).toEqual([
      { id: '0000_widgets', state: 'pending' },
      { id: '0001_widget_name', state: 'pending' },
    ])
    expect(await ledger(client)).toEqual([])
  })

  it('applies pending migrations in order, once', async () => {
    const migrations = await loadMigrations(dir)
    expect(await applyPending(client, migrations)).toEqual(['0000_widgets', '0001_widget_name'])
    expect(await columns(client, 'widgets')).toEqual(['id', 'name'])
    expect(await ledger(client)).toEqual(['0000_widgets', '0001_widget_name'])
    expect(await applyPending(client, migrations)).toEqual([])
  })

  it('applies a batch atomically — one failure leaves no partial schema behind', async () => {
    const broken = await writeMigrations({
      ...FIXTURES,
      '0002_broken': { up: 'create table half (id int); select * from missing_table;', down: 'drop table half;' },
    })
    await expect(applyPending(client, await loadMigrations(broken))).rejects.toThrow(/missing_table/)
    expect(await ledger(client)).toEqual([])
    expect(await columns(client, 'widgets')).toEqual([])
    expect(await columns(client, 'half')).toEqual([])
  })

  it('rolls back the last n migrations with their down.sql', async () => {
    const migrations = await loadMigrations(dir)
    await applyPending(client, migrations)

    expect(await rollback(client, migrations, 1)).toEqual(['0001_widget_name'])
    expect(await columns(client, 'widgets')).toEqual(['id'])
    expect(await ledger(client)).toEqual(['0000_widgets'])

    expect(await rollback(client, migrations, 1)).toEqual(['0000_widgets'])
    expect(await columns(client, 'widgets')).toEqual([])

    await expect(rollback(client, migrations, 1)).rejects.toThrow(MigrationStateError)
  })

  it('detects an edited applied migration and refuses to apply or roll back past it', async () => {
    await applyPending(client, await loadMigrations(dir))
    await writeFile(join(dir, '0000_widgets', 'up.sql'), 'create table widgets (id bigint primary key);')
    const edited = await loadMigrations(dir)

    const status = await readStatus(client, edited)
    expect(status.drifted).toEqual(['0000_widgets'])
    await expect(applyPending(client, edited)).rejects.toThrow(/drift/i)
    await expect(rollback(client, edited, 1)).rejects.toThrow(/drift/i)
  })

  it('serialises concurrent runs with an advisory lock', async () => {
    const other = new Client({ connectionString: database.url })
    await other.connect()
    try {
      const migrations = await loadMigrations(dir)
      const [a, b] = await Promise.all([applyPending(client, migrations), applyPending(other, migrations)])
      expect([...a, ...b].sort()).toEqual(['0000_widgets', '0001_widget_name'])
      expect(await ledger(client)).toEqual(['0000_widgets', '0001_widget_name'])
    } finally {
      await other.end()
    }
  })

  it('--dry-run prints the SQL and the lock warnings, and writes nothing', async () => {
    const stdout: string[] = []
    const io: CliIo = { out: (line) => stdout.push(line), err: (line) => stdout.push(line) }
    expect(await runMigrateCli(['--dry-run', '--dir', dir], io, { DATABASE_URL: database.url })).toBe(0)
    const output = stdout.join('\n')
    expect(output).toContain('-- 0000_widgets')
    expect(output).toContain('create table widgets (id int primary key);')
    expect(output).toMatch(/ACCESS EXCLUSIVE: alter table widgets add column name text/)
    expect(await ledger(client)).toEqual([])
    expect(await columns(client, 'widgets')).toEqual([])
  })

  it('--status exits 1 when an applied migration is missing from disk', async () => {
    await applyPending(client, await loadMigrations(dir))
    const fewer = await writeMigrations({ '0000_widgets': FIXTURES['0000_widgets'] })
    const lines: string[] = []
    const io: CliIo = { out: (line) => lines.push(line), err: (line) => lines.push(line) }
    expect(await runMigrateCli(['--status', '--dir', fewer], io, { DATABASE_URL: database.url })).toBe(1)
    expect(lines.join('\n')).toMatch(/orphaned\s+0001_widget_name/)
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @repo/api test:integration`
Expected: FAIL — `runner` and `cli` do not exist.

- [ ] **Step 7: Implement the runner and CLI**

`apps/api/src/db/migrations/runner.ts`:

```ts
import type { ClientBase } from 'pg'
import type { Migration } from './load'

/** Arbitrary but fixed: every runner in every process contends for the same lock. */
const ADVISORY_LOCK_KEY = 72_610_001

export class MigrationStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationStateError'
  }
}

export interface MigrationStatus {
  entries: { id: string; state: 'applied' | 'pending' | 'drifted' }[]
  pending: Migration[]
  /** Applied, but up.sql on disk no longer matches the recorded checksum. */
  drifted: string[]
  /** Recorded as applied, but no longer on disk. */
  orphaned: string[]
}

async function ensureLedger(client: ClientBase): Promise<void> {
  await client.query(
    `create table if not exists schema_migrations (
       id text primary key,
       checksum text not null,
       applied_at timestamptz not null default now()
     )`,
  )
}

async function appliedChecksums(client: ClientBase): Promise<Map<string, string>> {
  const exists = await client.query<{ t: string | null }>(`select to_regclass('public.schema_migrations') as t`)
  if (exists.rows[0]?.t === null) return new Map()
  const result = await client.query<{ id: string; checksum: string }>('select id, checksum from schema_migrations')
  return new Map(result.rows.map((row) => [row.id, row.checksum]))
}

/** Read-only: never creates the ledger, so --status and --dry-run write nothing. */
export async function readStatus(client: ClientBase, migrations: Migration[]): Promise<MigrationStatus> {
  const applied = await appliedChecksums(client)
  const onDisk = new Set(migrations.map((m) => m.id))
  const status: MigrationStatus = { entries: [], pending: [], drifted: [], orphaned: [] }

  for (const migration of migrations) {
    const checksum = applied.get(migration.id)
    if (checksum === undefined) {
      status.entries.push({ id: migration.id, state: 'pending' })
      status.pending.push(migration)
    } else if (checksum !== migration.checksum) {
      status.entries.push({ id: migration.id, state: 'drifted' })
      status.drifted.push(migration.id)
    } else {
      status.entries.push({ id: migration.id, state: 'applied' })
    }
  }
  status.orphaned = [...applied.keys()].filter((id) => !onDisk.has(id)).sort()
  return status
}

function assertNoDrift(status: MigrationStatus): void {
  if (status.drifted.length > 0 || status.orphaned.length > 0) {
    throw new MigrationStateError(
      `Migration drift — refusing to continue. Edited after apply: [${status.drifted.join(', ')}]; ` +
        `applied but missing on disk: [${status.orphaned.join(', ')}].`,
    )
  }
}

async function withLock<T>(client: ClientBase, work: () => Promise<T>): Promise<T> {
  await client.query('select pg_advisory_lock($1)', [ADVISORY_LOCK_KEY])
  try {
    return await work()
  } finally {
    await client.query('select pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY])
  }
}

async function inTransaction(client: ClientBase, work: () => Promise<void>): Promise<void> {
  await client.query('begin')
  try {
    await work()
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  }
}

/**
 * Applies every pending migration in one transaction, so a deploy lands all of them or none.
 * (Consequence: statements that cannot run in a transaction, such as CREATE INDEX CONCURRENTLY,
 * are not supported by this runner.)
 */
export async function applyPending(client: ClientBase, migrations: Migration[]): Promise<string[]> {
  return withLock(client, async () => {
    await ensureLedger(client)
    const status = await readStatus(client, migrations)
    assertNoDrift(status)
    await inTransaction(client, async () => {
      for (const migration of status.pending) {
        await client.query(migration.up)
        await client.query('insert into schema_migrations (id, checksum) values ($1, $2)', [
          migration.id,
          migration.checksum,
        ])
      }
    })
    return status.pending.map((migration) => migration.id)
  })
}

/** Runs down.sql for the last `count` applied migrations, newest first, in one transaction. */
export async function rollback(client: ClientBase, migrations: Migration[], count: number): Promise<string[]> {
  if (!Number.isInteger(count) || count < 1) {
    throw new MigrationStateError('Rollback count must be a positive integer')
  }
  return withLock(client, async () => {
    await ensureLedger(client)
    assertNoDrift(await readStatus(client, migrations))

    const applied = await client.query<{ id: string }>(
      'select id from schema_migrations order by applied_at desc, id desc',
    )
    if (count > applied.rows.length) {
      throw new MigrationStateError(`Cannot roll back ${count}: only ${applied.rows.length} applied`)
    }

    const byId = new Map(migrations.map((migration) => [migration.id, migration]))
    const targets = applied.rows.slice(0, count).map((row) => {
      const migration = byId.get(row.id)
      // Unreachable after assertNoDrift, which rejects orphaned rows; kept as a type guard.
      if (migration === undefined) throw new MigrationStateError(`${row.id} is not on disk`)
      return migration
    })

    await inTransaction(client, async () => {
      for (const migration of targets) {
        await client.query(migration.down)
        await client.query('delete from schema_migrations where id = $1', [migration.id])
      }
    })
    return targets.map((migration) => migration.id)
  })
}
```

`apps/api/src/db/migrations/cli.ts`:

```ts
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { Client } from 'pg'
import { loadMigrations, type Migration, MigrationLayoutError } from './load'
import { accessExclusiveStatements } from './locks'
import { applyPending, MigrationStateError, readStatus, rollback } from './runner'

export interface CliIo {
  out(line: string): void
  err(line: string): void
}

const USAGE = [
  'Usage: pnpm --filter @repo/api db:migrate <mode> [--dir <path>]',
  '  --verify            every migration has up.sql and down.sql (no database)',
  '  --status            applied vs pending; exits 1 on drift',
  '  --dry-run           print pending SQL and ACCESS EXCLUSIVE warnings; writes nothing',
  '  --apply             apply pending migrations in one transaction',
  '  --rollback <n> --yes   run down.sql for the last n migrations',
].join('\n')

function printPlan(io: CliIo, pending: Migration[]): void {
  if (pending.length === 0) {
    io.out('Nothing to apply.')
    return
  }
  for (const migration of pending) {
    io.out(`-- ${migration.id}`)
    io.out(migration.up.trim())
    for (const statement of accessExclusiveStatements(migration.up)) {
      io.out(`-- WARNING ACCESS EXCLUSIVE: ${statement}`)
    }
  }
}

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    strict: true,
    options: {
      verify: { type: 'boolean' },
      status: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      apply: { type: 'boolean' },
      rollback: { type: 'string' },
      yes: { type: 'boolean' },
      dir: { type: 'string' },
    },
  }).values
}

/** Exit codes: 0 ok · 1 drift, layout or state failure · 2 usage error. */
export async function runMigrateCli(argv: string[], io: CliIo, env: NodeJS.ProcessEnv): Promise<number> {
  let values: ReturnType<typeof parse>
  try {
    values = parse(argv)
  } catch (error) {
    io.err(`${(error as Error).message}\n${USAGE}`)
    return 2
  }

  const modes = [values.verify, values.status, values['dry-run'], values.apply, values.rollback !== undefined]
  if (modes.filter(Boolean).length !== 1) {
    io.err(USAGE)
    return 2
  }
  if (values.rollback !== undefined && values.yes !== true) {
    io.err(`Refusing to roll back without --yes: this runs down.sql for the last ${values.rollback} migration(s).`)
    return 2
  }

  // Scripts run with the package as cwd, so the default resolves to apps/api/migrations.
  const dir = resolve(values.dir ?? 'migrations')
  let migrations: Migration[]
  try {
    migrations = await loadMigrations(dir)
  } catch (error) {
    if (error instanceof MigrationLayoutError) {
      io.err(error.message)
      return 1
    }
    throw error
  }

  if (values.verify) {
    io.out(`${migrations.length} migration(s), each with up.sql and down.sql.`)
    return 0
  }

  const url = env['DATABASE_URL']
  if (url === undefined || !/^postgres(ql)?:\/\//.test(url)) {
    io.err('DATABASE_URL must be a postgres:// connection string')
    return 2
  }

  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    if (values.status || values['dry-run']) {
      const status = await readStatus(client, migrations)
      if (values.status) {
        for (const entry of status.entries) io.out(`${entry.state.padEnd(8)} ${entry.id}`)
        for (const id of status.orphaned) io.out(`orphaned ${id}`)
      }
      if (status.drifted.length > 0 || status.orphaned.length > 0) {
        io.err('Migration drift detected.')
        return 1
      }
      if (values['dry-run']) printPlan(io, status.pending)
      return 0
    }

    if (values.apply) {
      const applied = await applyPending(client, migrations)
      io.out(applied.length > 0 ? `Applied: ${applied.join(', ')}` : 'Nothing to apply.')
      return 0
    }

    const rolledBack = await rollback(client, migrations, Number(values.rollback))
    io.out(`Rolled back: ${rolledBack.join(', ')}`)
    return 0
  } catch (error) {
    if (error instanceof MigrationStateError) {
      io.err(error.message)
      return 1
    }
    throw error
  } finally {
    await client.end()
  }
}
```

`apps/api/src/db/cli/migrate.ts`:

```ts
import { runMigrateCli } from '../migrations/cli'

runMigrateCli(
  process.argv.slice(2),
  { out: (line) => process.stdout.write(`${line}\n`), err: (line) => process.stderr.write(`${line}\n`) },
  process.env,
).then(
  (code) => {
    process.exitCode = code
  },
  (error: unknown) => {
    console.error(error)
    process.exitCode = 1
  },
)
```

- [ ] **Step 8: Run both suites**

Run: `pnpm --filter @repo/api test && pnpm --filter @repo/api test:integration && pnpm --filter @repo/api typecheck && pnpm --filter @repo/api lint`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api
git commit -m "feat(api): reversible migration toolkit — verify, status, dry-run with lock warnings, apply, rollback

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: The first migration — generated by Drizzle Kit, paired by hand, proven reversible

**Files:**
- Create (generated): `apps/api/drizzle/0000_content_tables.sql`, `apps/api/drizzle/meta/_journal.json`, `apps/api/drizzle/meta/0000_snapshot.json`
- Create: `apps/api/migrations/0000_content_tables/up.sql`, `apps/api/migrations/0000_content_tables/down.sql`, `apps/api/migrations/README.md`
- Test: `apps/api/src/db/migrations/mirror.test.ts`, `apps/api/test/db/schema.int.test.ts`
- Create: `apps/api/test/support/migrate.ts`

**Interfaces:**
- Consumes: Drizzle `schema` (Task 4); `loadMigrations`, `applyPending`, `rollback` (Task 5)
- Produces:
  - Migration `0000_content_tables`
  - `migrateToLatest(databaseUrl: string): Promise<void>` in `test/support/migrate.ts` — every later integration test starts from the real schema through this

- [ ] **Step 1: Write the failing mirror test**

The rule this enforces: `up.sql` is Drizzle Kit's output, byte for byte (modulo line endings), so the schema in TypeScript and the SQL that ships can never silently diverge.

`apps/api/src/db/migrations/mirror.test.ts`:

```ts
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadMigrations } from './load'

const API_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const DRIZZLE_DIR = join(API_ROOT, 'drizzle')
const MIGRATIONS_DIR = join(API_ROOT, 'migrations')

describe('migrations mirror Drizzle Kit', () => {
  it('has exactly one runnable migration per generated file, with identical up.sql', async () => {
    const generated = (await readdir(DRIZZLE_DIR)).filter((name) => name.endsWith('.sql')).sort()
    const migrations = await loadMigrations(MIGRATIONS_DIR)

    expect(migrations.map((m) => `${m.id}.sql`)).toEqual(generated)
    for (const migration of migrations) {
      const sql = (await readFile(join(DRIZZLE_DIR, `${migration.id}.sql`), 'utf8')).replace(/\r\n/g, '\n')
      expect(migration.up, `${migration.id}/up.sql must equal drizzle/${migration.id}.sql`).toBe(sql)
    }
  })
})
```

Run: `pnpm --filter @repo/api exec vitest run --project unit src/db/migrations/mirror.test.ts`
Expected: FAIL — `ENOENT` on `drizzle/`.

- [ ] **Step 2: Generate the SQL**

Run: `pnpm --filter @repo/api db:generate --name content_tables`
Expected: Drizzle Kit reports 8 tables and writes `apps/api/drizzle/0000_content_tables.sql` plus `apps/api/drizzle/meta/`. Open the SQL and confirm it contains `CREATE TABLE` for `profile`, `domains`, `projects`, `project_outcomes`, `experiences`, `skill_groups`, `skills`, `seed_runs`, the two foreign keys to `domains`/`projects`/`skill_groups`, the three indexes/checks from Task 4 and `"stack" text[]`. If any is missing, the schema file is wrong — fix `src/db/schema/content.ts` and regenerate (delete `apps/api/drizzle/` first), never hand-edit generated SQL.

- [ ] **Step 3: Create the runnable migration**

```bash
mkdir -p apps/api/migrations/0000_content_tables
cp apps/api/drizzle/0000_content_tables.sql apps/api/migrations/0000_content_tables/up.sql
```

`apps/api/migrations/0000_content_tables/down.sql` — children before parents, so foreign keys never block a drop:

```sql
-- Undoes 0000_content_tables. Children first: their foreign keys reference the parents.
DROP TABLE "skills";
DROP TABLE "skill_groups";
DROP TABLE "experiences";
DROP TABLE "project_outcomes";
DROP TABLE "projects";
DROP TABLE "domains";
DROP TABLE "profile";
DROP TABLE "seed_runs";
```

`apps/api/migrations/README.md`:

````markdown
# Migrations

Reversible by policy (API spec §6). Each migration is a directory `NNNN_snake_name/` holding
`up.sql` and a non-empty `down.sql`. CI runs `db:migrate --verify` and fails without one.

## Adding a migration

1. Change the Drizzle schema in `src/db/schema/`.
2. `pnpm --filter @repo/api db:generate --name <snake_name>` — writes `drizzle/NNNN_<snake_name>.sql`.
3. Copy it verbatim to `migrations/NNNN_<snake_name>/up.sql`. `mirror.test.ts` fails if they differ.
4. Write `down.sql` by hand: the statements that return the schema to its previous state.
5. `pnpm --filter @repo/api test:integration` — `schema.int.test.ts` applies everything, rolls
   everything back and applies again.

## Destructive changes: expand / contract

Never drop or rename in the release that stops using a column. Add → backfill → switch reads →
drop in a *later* release. `db:migrate --dry-run` prints every statement that takes an
`ACCESS EXCLUSIVE` lock so the reviewer sees the blast radius.

## Commands (run with `DATABASE_URL` set, or from `apps/api/.env`)

| Command | Effect |
|---|---|
| `pnpm --filter @repo/api db:migrate --verify` | Layout check, no database |
| `pnpm --filter @repo/api db:migrate --status` | Applied / pending / drift; exit 1 on drift |
| `pnpm --filter @repo/api db:migrate --dry-run` | Pending SQL + lock warnings; writes nothing |
| `pnpm --filter @repo/api db:migrate --apply` | All pending, one transaction |
| `pnpm --filter @repo/api db:migrate --rollback 1 --yes` | `down.sql` of the newest migration |

The runner applies a batch in one transaction, so statements that cannot run inside a
transaction (`CREATE INDEX CONCURRENTLY`) are not supported.
````

Run: `pnpm --filter @repo/api exec vitest run --project unit src/db/migrations/mirror.test.ts && pnpm --filter @repo/api db:migrate --verify`
Expected: PASS; `1 migration(s), each with up.sql and down.sql.`

- [ ] **Step 4: Write the failing schema round-trip test**

`apps/api/test/support/migrate.ts`:

```ts
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import { loadMigrations } from '../../src/db/migrations/load'
import { applyPending } from '../../src/db/migrations/runner'

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url))

/** Brings a test database to the schema that ships, through the same runner production uses. */
export async function migrateToLatest(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    await applyPending(client, await loadMigrations(MIGRATIONS_DIR))
  } finally {
    await client.end()
  }
}
```

`apps/api/test/db/schema.int.test.ts`:

```ts
import { is } from 'drizzle-orm'
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { loadMigrations } from '../../src/db/migrations/load'
import { applyPending, rollback } from '../../src/db/migrations/runner'
import { schema } from '../../src/db/schema'
import { createTestDatabase, type TestDatabase } from '../support/database'
import { MIGRATIONS_DIR } from '../support/migrate'

async function liveColumns(client: Client): Promise<Record<string, string[]>> {
  const result = await client.query<{ table_name: string; column_name: string }>(
    `select table_name, column_name from information_schema.columns
     where table_schema = 'public' and table_name <> 'schema_migrations'
     order by table_name, column_name`,
  )
  const tables: Record<string, string[]> = {}
  for (const row of result.rows) (tables[row.table_name] ??= []).push(row.column_name)
  // Sort in JS: Postgres collation orders `_` differently from Array.prototype.sort.
  for (const columns of Object.values(tables)) columns.sort()
  return tables
}

function drizzleColumns(): Record<string, string[]> {
  const tables: Record<string, string[]> = {}
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue
    const config = getTableConfig(value)
    tables[config.name] = config.columns.map((column) => column.name).sort()
  }
  return tables
}

describe('the shipped schema', () => {
  let database: TestDatabase
  let client: Client

  beforeAll(async () => {
    database = await createTestDatabase(inject('databaseUrl'))
    client = new Client({ connectionString: database.url })
    await client.connect()
  })

  afterAll(async () => {
    await client.end()
    await database.drop()
  })

  it('matches the Drizzle schema exactly after migrating', async () => {
    const migrations = await loadMigrations(MIGRATIONS_DIR)
    await applyPending(client, migrations)
    expect(await liveColumns(client)).toEqual(drizzleColumns())
  })

  it('rolls all the way back to an empty schema and forward again', async () => {
    const migrations = await loadMigrations(MIGRATIONS_DIR)
    await rollback(client, migrations, migrations.length)
    expect(await liveColumns(client)).toEqual({})

    await applyPending(client, migrations)
    expect(await liveColumns(client)).toEqual(drizzleColumns())
  })
})
```

- [ ] **Step 5: Run the integration suite**

Run: `pnpm --filter @repo/api test:integration`
Expected: PASS. (If "matches the Drizzle schema" fails, a column differs between `drizzle/*.sql` and `src/db/schema` — regenerate. If the round trip fails, `down.sql` is incomplete.)

- [ ] **Step 6: Try the CLI against the local database**

```bash
pnpm --filter @repo/api db:migrate --status
pnpm --filter @repo/api db:migrate --dry-run
pnpm --filter @repo/api db:migrate --apply
pnpm --filter @repo/api db:migrate --status
```

Expected, in order: `pending  0000_content_tables`; the SQL with `-- WARNING ACCESS EXCLUSIVE:` lines for the `ALTER TABLE ... ADD CONSTRAINT` statements; `Applied: 0000_content_tables`; `applied  0000_content_tables`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/drizzle apps/api/migrations apps/api/src/db/migrations/mirror.test.ts apps/api/test
git commit -m "feat(api): first migration — content tables, with a proven down.sql

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Content seed from git — parse, hash, plan, apply, record

**Files:**
- Create: `apps/api/src/content/source.ts`, `hash.ts`, `rows.ts`, `seed.ts`, `cli.ts`
- Create: `apps/api/src/db/cli/seed.ts`
- Create: `apps/api/test/support/content.ts`
- Test: `apps/api/src/content/source.test.ts`, `hash.test.ts`, `rows.test.ts`
- Test: `apps/api/test/content/seed.int.test.ts`

**Interfaces:**
- Consumes: contracts schemas and types (Task 1); Drizzle tables, `Database`, `createPool` (Task 4); `migrateToLatest` (Task 6); `CliIo` (Task 5)
- Produces:
  - `interface ContentBundle { profile: Profile; domains: Domain[]; projects: Project[]; experience: Experience[]; skills: SkillGroup[] }`
  - `loadContentFromDir(dir: string): Promise<ContentBundle>`; `class ContentIntegrityError extends Error`
  - `canonicalJson(value: unknown): string`; `contentHash(value: unknown): string` (sha256 hex)
  - `experienceId(experience: Experience): string`; `toRows(bundle: ContentBundle): SeedRows`
  - `type DbExecutor = PgDatabase<NodePgQueryResultHKT, typeof schema>` (a `Database` or a transaction)
  - `type SeedTable = 'profile' | 'domains' | 'projects' | 'experiences' | 'skill_groups'`; `interface TablePlan { inserted: string[]; updated: string[]; deleted: string[]; unchanged: number }`; `type SeedPlan = Record<SeedTable, TablePlan>`
  - `planSeed(db: DbExecutor, rows: SeedRows): Promise<SeedPlan>`; `hasChanges(plan: SeedPlan): boolean`
  - `runSeed(db: Database, bundle: ContentBundle, options: { gitSha: string; dryRun: boolean }): Promise<SeedOutcome>` with `SeedOutcome { plan: SeedPlan; contentHash: string; seedRunId: number; dryRun: boolean }`
  - `detectDrift(db: DbExecutor, bundle: ContentBundle): Promise<boolean>`
  - `runSeedCli(argv: string[], io: CliIo, env: NodeJS.ProcessEnv): Promise<number>` — `--dry-run | --apply | --check`, `--content-dir`, `--git-sha`; exit `1` on `--check` drift or integrity failure, `2` on usage
  - `REPO_CONTENT_DIR: string` in `test/support/content.ts`

- [ ] **Step 1: Write the failing unit tests**

`apps/api/test/support/content.ts`:

```ts
import { fileURLToPath } from 'node:url'

/** The repository's real `content/` — the same files apps/web builds from. */
export const REPO_CONTENT_DIR = fileURLToPath(new URL('../../../../content', import.meta.url))
```

`apps/api/src/content/hash.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { canonicalJson, contentHash } from './hash'

describe('content hashing', () => {
  it('is independent of key order, at every depth', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}')
    expect(contentHash({ b: 1, a: 2 })).toBe(contentHash({ a: 2, b: 1 }))
  })

  it('keeps array order, because order is content', () => {
    expect(contentHash(['a', 'b'])).not.toBe(contentHash(['b', 'a']))
  })

  it('ignores undefined properties, as JSON does', () => {
    expect(contentHash({ a: 1, b: undefined })).toBe(contentHash({ a: 1 }))
  })
})
```

`apps/api/src/content/source.test.ts`:

```ts
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPO_CONTENT_DIR } from '../../test/support/content'
import { ContentIntegrityError, loadContentFromDir } from './source'

async function copyOfRepoContent(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'content-'))
  await cp(REPO_CONTENT_DIR, dir, { recursive: true })
  return dir
}

async function editJson(dir: string, file: string, edit: (value: unknown[]) => unknown[]): Promise<void> {
  const path = join(dir, file)
  const value = JSON.parse(await readFile(path, 'utf8')) as unknown[]
  await writeFile(path, JSON.stringify(edit(value)))
}

describe('loadContentFromDir', () => {
  it("parses the repository's real content through the contracts", async () => {
    const bundle = await loadContentFromDir(REPO_CONTENT_DIR)
    expect(bundle.domains.length).toBeGreaterThan(0)
    expect(bundle.projects.length).toBeGreaterThan(0)
    expect(bundle.profile.kpis.every((kpi) => kpi.group === 'hero' || kpi.group === 'proof')).toBe(true)
  })

  it('names the file and field when content is malformed', async () => {
    const dir = await copyOfRepoContent()
    await editJson(dir, 'projects.json', ([first, ...rest]) => [{ ...(first as object), slug: 'Not Kebab' }, ...rest])
    await expect(loadContentFromDir(dir)).rejects.toThrow(/projects\.json.*slug/)
  })

  it('rejects a project whose domain does not exist', async () => {
    const dir = await copyOfRepoContent()
    await editJson(dir, 'projects.json', ([first, ...rest]) => [{ ...(first as object), domain: 'nowhere' }, ...rest])
    await expect(loadContentFromDir(dir)).rejects.toThrow(ContentIntegrityError)
  })

  it('rejects duplicate slugs', async () => {
    const dir = await copyOfRepoContent()
    await editJson(dir, 'projects.json', (projects) => [...projects, projects[0]])
    await expect(loadContentFromDir(dir)).rejects.toThrow(/duplicate project slug/i)
  })

  it('rejects duplicate project order, which pagination relies on', async () => {
    const dir = await copyOfRepoContent()
    await editJson(dir, 'projects.json', ([first, second, ...rest]) => [
      first,
      { ...(second as object), order: (first as { order: number }).order },
      ...rest,
    ])
    await expect(loadContentFromDir(dir)).rejects.toThrow(/duplicate project order/i)
  })
})
```

`apps/api/src/content/rows.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { REPO_CONTENT_DIR } from '../../test/support/content'
import { contentHash } from './hash'
import { experienceId, toRows } from './rows'
import { loadContentFromDir } from './source'

describe('experienceId', () => {
  it('derives a stable kebab-case key from org and start month', () => {
    expect(
      experienceId({ org: 'Data Age', title: 'Tech Lead', period: { from: '2025-01' }, highlights: ['x'], placeholder: false }),
    ).toBe('data-age-2025-01')
    expect(
      experienceId({
        org: 'Earlier engineering roles (2020–)',
        title: 'x',
        period: { from: '2020-01' },
        highlights: ['x'],
        placeholder: true,
      }),
    ).toBe('earlier-engineering-roles-2020-2020-01')
  })
})

describe('toRows', () => {
  it('maps every content item to exactly one parent row, with positions and hashes', async () => {
    const bundle = await loadContentFromDir(REPO_CONTENT_DIR)
    const rows = toRows(bundle)

    expect(rows.profile.id).toBe(1)
    expect(rows.profile.emailPlaceholder).toBe(bundle.profile.emailPlaceholder ?? false)
    expect(rows.domains.map((d) => d.position)).toEqual(bundle.domains.map((_, i) => i))
    expect(rows.projects).toHaveLength(bundle.projects.length)
    expect(rows.experiences).toHaveLength(bundle.experience.length)
    expect(rows.skillGroups.flatMap((g) => g.skills)).toHaveLength(bundle.skills.flatMap((g) => g.items).length)

    const first = bundle.projects[0]
    const firstRow = rows.projects[0]
    expect(firstRow?.row).toMatchObject({ slug: first?.slug, domainId: first?.domain, sortOrder: first?.order })
    expect(firstRow?.outcomes.map((o) => o.position)).toEqual(first?.outcome.map((_, i) => i))
  })

  it('changes a hash when position changes, so reordering is a real change', async () => {
    const bundle = await loadContentFromDir(REPO_CONTENT_DIR)
    const reordered = { ...bundle, domains: [...bundle.domains].reverse() }
    const before = new Map(toRows(bundle).domains.map((d) => [d.id, d.contentHash]))
    const after = toRows(reordered).domains
    expect(after.some((d) => d.contentHash !== before.get(d.id))).toBe(true)
    expect(contentHash(bundle.profile)).toBe(toRows(bundle).profile.contentHash)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @repo/api test`
Expected: FAIL — `./hash`, `./source`, `./rows` do not exist.

- [ ] **Step 3: Implement hashing, loading and row mapping**

`apps/api/src/content/hash.ts`:

```ts
import { createHash } from 'node:crypto'

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    )
  }
  return value
}

/** JSON with keys sorted at every depth, so equal content always serialises identically. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

export function contentHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}
```

`apps/api/src/content/source.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import {
  type Domain,
  domainSchema,
  type Experience,
  experienceSchema,
  type Profile,
  profileSchema,
  type Project,
  projectSchema,
  type SkillGroup,
  skillGroupSchema,
} from '@repo/contracts'
import { experienceId } from './rows'

export interface ContentBundle {
  profile: Profile
  domains: Domain[]
  projects: Project[]
  experience: Experience[]
  skills: SkillGroup[]
}

export class ContentIntegrityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ContentIntegrityError'
  }
}

async function parseFile<T extends z.ZodTypeAny>(dir: string, file: string, schema: T): Promise<z.output<T>> {
  const raw: unknown = JSON.parse(await readFile(join(dir, file), 'utf8'))
  const result = schema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    throw new ContentIntegrityError(`${file}: ${issues}`)
  }
  return result.data
}

function assertUnique(kind: string, keys: string[]): void {
  const seen = new Set<string>()
  for (const key of keys) {
    if (seen.has(key)) throw new ContentIntegrityError(`Duplicate ${kind}: ${key}`)
    seen.add(key)
  }
}

/**
 * Reads content/*.json through the shared contracts — the same parse apps/web does at build — and
 * adds the checks a database needs: unique keys and resolvable references. `writing.json` is not
 * seeded in M1; the writing cache arrives with the Medium feed in M3.
 */
export async function loadContentFromDir(dir: string): Promise<ContentBundle> {
  const bundle: ContentBundle = {
    profile: await parseFile(dir, 'profile.json', profileSchema),
    domains: await parseFile(dir, 'domains.json', z.array(domainSchema)),
    projects: await parseFile(dir, 'projects.json', z.array(projectSchema)),
    experience: await parseFile(dir, 'experience.json', z.array(experienceSchema)),
    skills: await parseFile(dir, 'skills.json', z.array(skillGroupSchema)),
  }

  assertUnique('domain id', bundle.domains.map((d) => d.id))
  assertUnique('project slug', bundle.projects.map((p) => p.slug))
  // The API pages projects by `order`, so it must be unique (the database enforces it too).
  assertUnique('project order', bundle.projects.map((p) => String(p.order)))
  assertUnique('experience', bundle.experience.map(experienceId))
  assertUnique('skill group id', bundle.skills.map((g) => g.id))

  const domainIds = new Set(bundle.domains.map((d) => d.id))
  for (const project of bundle.projects) {
    if (!domainIds.has(project.domain)) {
      throw new ContentIntegrityError(`Project ${project.slug} references unknown domain ${project.domain}`)
    }
  }
  return bundle
}
```

`apps/api/src/content/rows.ts`:

```ts
import type { Experience } from '@repo/contracts'
import type {
  domains,
  experiences,
  profile,
  projectOutcomes,
  projects,
  skillGroups,
  skills,
} from '../db/schema'
import { contentHash } from './hash'
import type { ContentBundle } from './source'

export interface SeedRows {
  profile: typeof profile.$inferInsert
  domains: (typeof domains.$inferInsert)[]
  projects: { row: typeof projects.$inferInsert; outcomes: (typeof projectOutcomes.$inferInsert)[] }[]
  experiences: (typeof experiences.$inferInsert)[]
  skillGroups: { row: typeof skillGroups.$inferInsert; skills: (typeof skills.$inferInsert)[] }[]
}

/** Experience has no id in content; org + start month is unique and stable across edits to copy. */
export function experienceId(experience: Experience): string {
  return `${experience.org}-${experience.period.from}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Content → rows. Each parent's hash covers its children and its position, so reordering or
 * editing a child is a change to the parent.
 */
export function toRows(bundle: ContentBundle): SeedRows {
  const { profile: p } = bundle
  return {
    profile: {
      id: 1,
      name: p.name,
      headline: p.headline,
      sub: p.sub,
      location: p.location,
      email: p.email,
      emailPlaceholder: p.emailPlaceholder ?? false,
      availability: p.availability,
      roles: p.roles,
      links: p.links,
      kpis: p.kpis,
      contentHash: contentHash(p),
    },
    domains: bundle.domains.map((domain, position) => ({
      ...domain,
      position,
      contentHash: contentHash({ ...domain, position }),
    })),
    projects: bundle.projects.map((project) => ({
      row: {
        slug: project.slug,
        name: project.name,
        domainId: project.domain,
        role: project.role,
        periodFrom: project.period.from,
        periodTo: project.period.to ?? null,
        summary: project.summary,
        stack: project.stack,
        visibility: project.visibility,
        featured: project.featured,
        sortOrder: project.order,
        links: project.links,
        formation: project.formation,
        placeholder: project.placeholder,
        contentHash: contentHash(project),
      },
      outcomes: project.outcome.map((metric, position) => ({
        projectSlug: project.slug,
        position,
        label: metric.label,
        value: metric.value,
        placeholder: metric.placeholder,
      })),
    })),
    experiences: bundle.experience.map((experience, position) => ({
      id: experienceId(experience),
      org: experience.org,
      title: experience.title,
      periodFrom: experience.period.from,
      periodTo: experience.period.to ?? null,
      location: experience.location ?? null,
      highlights: experience.highlights,
      placeholder: experience.placeholder,
      position,
      contentHash: contentHash({ ...experience, position }),
    })),
    skillGroups: bundle.skills.map((group, position) => ({
      row: { id: group.id, label: group.label, position, contentHash: contentHash({ ...group, position }) },
      skills: group.items.map((item, index) => ({
        groupId: group.id,
        position: index,
        name: item.name,
        level: item.level,
      })),
    })),
  }
}
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `pnpm --filter @repo/api test`
Expected: PASS.

- [ ] **Step 5: Write the failing seed integration test**

`apps/api/test/content/seed.int.test.ts`:

```ts
import { count, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { detectDrift, runSeed } from '../../src/content/seed'
import { type ContentBundle, loadContentFromDir } from '../../src/content/source'
import { createPool } from '../../src/db/connection'
import type { Database } from '../../src/db/db.module'
import { projectOutcomes, projects, schema, seedRuns, skills } from '../../src/db/schema'
import { REPO_CONTENT_DIR } from '../support/content'
import { createTestDatabase, type TestDatabase } from '../support/database'
import { migrateToLatest } from '../support/migrate'

describe('content seed', () => {
  let database: TestDatabase
  let pool: Pool
  let db: Database
  let bundle: ContentBundle

  beforeAll(async () => {
    database = await createTestDatabase(inject('databaseUrl'))
    await migrateToLatest(database.url)
    pool = createPool(database.url, 2)
    db = drizzle(pool, { schema })
    bundle = await loadContentFromDir(REPO_CONTENT_DIR)
  })

  afterAll(async () => {
    await pool.end()
    await database.drop()
  })

  const rowCount = async (table: PgTable) =>
    (await db.select({ n: count() }).from(table))[0]?.n ?? 0

  it('--dry-run plans every insert, writes no content, and records the run', async () => {
    const outcome = await runSeed(db, bundle, { gitSha: 'dry', dryRun: true })
    expect(outcome.plan.projects.inserted).toHaveLength(bundle.projects.length)
    expect(outcome.plan.profile.inserted).toEqual(['1'])
    expect(await rowCount(projects)).toBe(0)
    expect(await rowCount(seedRuns)).toBe(1)
  })

  it('applies all content, then is a no-op when nothing changed', async () => {
    const first = await runSeed(db, bundle, { gitSha: 'a1', dryRun: false })
    expect(first.plan.domains.inserted).toHaveLength(bundle.domains.length)
    expect(await rowCount(projects)).toBe(bundle.projects.length)
    expect(await rowCount(skills)).toBe(bundle.skills.flatMap((g) => g.items).length)

    const [before] = await db.select({ at: projects.seededAt }).from(projects).limit(1)
    const second = await runSeed(db, bundle, { gitSha: 'a2', dryRun: false })
    for (const table of Object.values(second.plan)) {
      expect(table).toMatchObject({ inserted: [], updated: [], deleted: [] })
    }
    const [after] = await db.select({ at: projects.seededAt }).from(projects).limit(1)
    expect(after?.at).toEqual(before?.at)
    expect(await detectDrift(db, bundle)).toBe(false)
  })

  it('updates only the edited row', async () => {
    const [target, ...rest] = bundle.projects
    if (target === undefined) throw new Error('content has no projects')
    const edited = { ...bundle, projects: [{ ...target, summary: `${target.summary} Edited.` }, ...rest] }

    expect(await detectDrift(db, edited)).toBe(true)
    const outcome = await runSeed(db, edited, { gitSha: 'b1', dryRun: false })
    expect(outcome.plan.projects.updated).toEqual([target.slug])
    expect(outcome.plan.projects.unchanged).toBe(rest.length)
    const [row] = await db.select({ summary: projects.summary }).from(projects).where(eq(projects.slug, target.slug))
    expect(row?.summary).toMatch(/Edited\.$/)
  })

  it('deletes content removed from git, children included', async () => {
    const [target, ...rest] = bundle.projects
    if (target === undefined) throw new Error('content has no projects')
    // Give the target an outcome first, so the cascade to project_outcomes is really exercised.
    const withOutcome = { ...target, outcome: [{ label: 'Latency', value: '-40%', placeholder: false }] }
    await runSeed(db, { ...bundle, projects: [withOutcome, ...rest] }, { gitSha: 'c0', dryRun: false })
    const outcomesFor = () => db.select().from(projectOutcomes).where(eq(projectOutcomes.projectSlug, target.slug))
    expect(await outcomesFor()).toHaveLength(1)

    const outcome = await runSeed(db, { ...bundle, projects: rest }, { gitSha: 'c1', dryRun: false })
    expect(outcome.plan.projects.deleted).toEqual([target.slug])
    expect(await db.select().from(projects).where(eq(projects.slug, target.slug))).toEqual([])
    expect(await outcomesFor()).toEqual([])
  })

  it('records every run with its git sha, content hash and plan', async () => {
    const runs = await db.select().from(seedRuns).orderBy(seedRuns.id)
    expect(runs.map((run) => run.gitSha)).toEqual(['dry', 'a1', 'a2', 'b1', 'c0', 'c1'])
    expect(runs[0]?.dryRun).toBe(true)
    expect(runs[1]?.contentHash).toMatch(/^[0-9a-f]{64}$/)
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @repo/api test:integration`
Expected: FAIL — `../../src/content/seed` does not exist.

- [ ] **Step 7: Implement the seed and its CLI**

`apps/api/src/content/seed.ts`:

```ts
import { inArray, sql } from 'drizzle-orm'
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import type { Database } from '../db/db.module'
import {
  domains,
  experiences,
  profile,
  projectOutcomes,
  projects,
  type schema,
  seedRuns,
  skillGroups,
  skills,
} from '../db/schema'
import { contentHash } from './hash'
import { type SeedRows, toRows } from './rows'
import type { ContentBundle } from './source'

/** A database handle or a transaction — both expose the query builders the seed uses. */
export type DbExecutor = PgDatabase<NodePgQueryResultHKT, typeof schema>

export type SeedTable = 'profile' | 'domains' | 'projects' | 'experiences' | 'skill_groups'

export interface TablePlan {
  inserted: string[]
  updated: string[]
  deleted: string[]
  unchanged: number
}

export type SeedPlan = Record<SeedTable, TablePlan>

export interface SeedOutcome {
  plan: SeedPlan
  contentHash: string
  seedRunId: number
  dryRun: boolean
}

function diff(desired: { key: string; hash: string }[], existing: { key: string; hash: string }[]): TablePlan {
  const current = new Map(existing.map((row) => [row.key, row.hash]))
  const wanted = new Set(desired.map((row) => row.key))
  const plan: TablePlan = { inserted: [], updated: [], deleted: [], unchanged: 0 }
  for (const { key, hash } of desired) {
    const found = current.get(key)
    if (found === undefined) plan.inserted.push(key)
    else if (found !== hash) plan.updated.push(key)
    else plan.unchanged += 1
  }
  plan.deleted = existing.map((row) => row.key).filter((key) => !wanted.has(key)).sort()
  return plan
}

export async function planSeed(db: DbExecutor, rows: SeedRows): Promise<SeedPlan> {
  const [profileRows, domainRows, projectRows, experienceRows, groupRows] = await Promise.all([
    db.select({ key: sql<string>`${profile.id}::text`, hash: profile.contentHash }).from(profile),
    db.select({ key: domains.id, hash: domains.contentHash }).from(domains),
    db.select({ key: projects.slug, hash: projects.contentHash }).from(projects),
    db.select({ key: experiences.id, hash: experiences.contentHash }).from(experiences),
    db.select({ key: skillGroups.id, hash: skillGroups.contentHash }).from(skillGroups),
  ])
  return {
    profile: diff([{ key: '1', hash: rows.profile.contentHash }], profileRows),
    domains: diff(rows.domains.map((d) => ({ key: d.id, hash: d.contentHash })), domainRows),
    projects: diff(rows.projects.map((p) => ({ key: p.row.slug, hash: p.row.contentHash })), projectRows),
    experiences: diff(rows.experiences.map((e) => ({ key: e.id, hash: e.contentHash })), experienceRows),
    skill_groups: diff(rows.skillGroups.map((g) => ({ key: g.row.id, hash: g.row.contentHash })), groupRows),
  }
}

export function hasChanges(plan: SeedPlan): boolean {
  return Object.values(plan).some((t) => t.inserted.length + t.updated.length + t.deleted.length > 0)
}

function changedKeys(plan: TablePlan): Set<string> {
  return new Set([...plan.inserted, ...plan.updated])
}

const touched = { seededAt: sql`now()` }

async function applyPlan(tx: DbExecutor, rows: SeedRows, plan: SeedPlan): Promise<void> {
  if (changedKeys(plan.profile).size > 0) {
    await tx
      .insert(profile)
      .values(rows.profile)
      .onConflictDoUpdate({ target: profile.id, set: { ...rows.profile, ...touched } })
  }

  const domainChanges = changedKeys(plan.domains)
  for (const row of rows.domains.filter((d) => domainChanges.has(d.id))) {
    await tx.insert(domains).values(row).onConflictDoUpdate({ target: domains.id, set: { ...row, ...touched } })
  }

  const projectChanges = changedKeys(plan.projects)
  for (const { row, outcomes } of rows.projects.filter((p) => projectChanges.has(p.row.slug))) {
    await tx.insert(projects).values(row).onConflictDoUpdate({ target: projects.slug, set: { ...row, ...touched } })
    await tx.delete(projectOutcomes).where(inArray(projectOutcomes.projectSlug, [row.slug]))
    if (outcomes.length > 0) await tx.insert(projectOutcomes).values(outcomes)
  }
  // Projects go before domains: a removed domain may still be referenced by a removed project.
  if (plan.projects.deleted.length > 0) {
    await tx.delete(projects).where(inArray(projects.slug, plan.projects.deleted))
  }
  if (plan.domains.deleted.length > 0) {
    await tx.delete(domains).where(inArray(domains.id, plan.domains.deleted))
  }

  const experienceChanges = changedKeys(plan.experiences)
  for (const row of rows.experiences.filter((e) => experienceChanges.has(e.id))) {
    await tx
      .insert(experiences)
      .values(row)
      .onConflictDoUpdate({ target: experiences.id, set: { ...row, ...touched } })
  }
  if (plan.experiences.deleted.length > 0) {
    await tx.delete(experiences).where(inArray(experiences.id, plan.experiences.deleted))
  }

  const groupChanges = changedKeys(plan.skill_groups)
  for (const { row, skills: items } of rows.skillGroups.filter((g) => groupChanges.has(g.row.id))) {
    await tx
      .insert(skillGroups)
      .values(row)
      .onConflictDoUpdate({ target: skillGroups.id, set: { ...row, ...touched } })
    await tx.delete(skills).where(inArray(skills.groupId, [row.id]))
    if (items.length > 0) await tx.insert(skills).values(items)
  }
  if (plan.skill_groups.deleted.length > 0) {
    await tx.delete(skillGroups).where(inArray(skillGroups.id, plan.skill_groups.deleted))
  }
}

/**
 * Plans and (unless dry) applies the seed in one transaction, then records the run in
 * `seed_runs`. Idempotent: unchanged rows are not written, so `seeded_at` means "last changed".
 */
export async function runSeed(
  db: Database,
  bundle: ContentBundle,
  options: { gitSha: string; dryRun: boolean },
): Promise<SeedOutcome> {
  const rows = toRows(bundle)
  const hash = contentHash(bundle)
  return db.transaction(async (tx) => {
    const plan = await planSeed(tx, rows)
    if (!options.dryRun) await applyPlan(tx, rows, plan)
    const [run] = await tx
      .insert(seedRuns)
      .values({ gitSha: options.gitSha, contentHash: hash, dryRun: options.dryRun, result: plan })
      .returning({ id: seedRuns.id })
    if (run === undefined) throw new Error('seed_runs insert returned no row')
    return { plan, contentHash: hash, seedRunId: run.id, dryRun: options.dryRun }
  })
}

/** True when the database no longer matches git. */
export async function detectDrift(db: DbExecutor, bundle: ContentBundle): Promise<boolean> {
  return hasChanges(await planSeed(db, toRows(bundle)))
}
```

`apps/api/src/content/cli.ts`:

```ts
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { drizzle } from 'drizzle-orm/node-postgres'
import { createPool } from '../db/connection'
import type { CliIo } from '../db/migrations/cli'
import { schema } from '../db/schema'
import { detectDrift, runSeed, type SeedPlan } from './seed'
import { type ContentBundle, ContentIntegrityError, loadContentFromDir } from './source'

const USAGE = [
  'Usage: pnpm --filter @repo/api db:seed <mode> [--content-dir <path>] [--git-sha <sha>]',
  '  --dry-run   plan against the database; write only the seed_runs record',
  '  --apply     apply the plan in one transaction',
  '  --check     exit 1 if the database differs from git',
].join('\n')

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    strict: true,
    options: {
      'dry-run': { type: 'boolean' },
      apply: { type: 'boolean' },
      check: { type: 'boolean' },
      'content-dir': { type: 'string' },
      'git-sha': { type: 'string' },
    },
  }).values
}

function printPlan(io: CliIo, plan: SeedPlan): void {
  for (const [table, p] of Object.entries(plan)) {
    io.out(
      `${table.padEnd(12)} +${p.inserted.length} ~${p.updated.length} -${p.deleted.length} =${p.unchanged}` +
        (p.deleted.length > 0 ? `  deleting: ${p.deleted.join(', ')}` : ''),
    )
  }
}

/** Exit codes: 0 ok · 1 drift (--check) or invalid content · 2 usage error. */
export async function runSeedCli(argv: string[], io: CliIo, env: NodeJS.ProcessEnv): Promise<number> {
  let values: ReturnType<typeof parse>
  try {
    values = parse(argv)
  } catch (error) {
    io.err(`${(error as Error).message}\n${USAGE}`)
    return 2
  }
  if ([values['dry-run'], values.apply, values.check].filter(Boolean).length !== 1) {
    io.err(USAGE)
    return 2
  }
  const url = env['DATABASE_URL']
  if (url === undefined || !/^postgres(ql)?:\/\//.test(url)) {
    io.err('DATABASE_URL must be a postgres:// connection string')
    return 2
  }

  // Scripts run with apps/api as cwd; the repository's content/ is two levels up.
  const contentDir = resolve(values['content-dir'] ?? '../../content')
  let bundle: ContentBundle
  try {
    bundle = await loadContentFromDir(contentDir)
  } catch (error) {
    if (error instanceof ContentIntegrityError) {
      io.err(error.message)
      return 1
    }
    throw error
  }

  const pool = createPool(url, 1)
  const db = drizzle(pool, { schema })
  try {
    if (values.check) {
      const drifted = await detectDrift(db, bundle)
      io.out(drifted ? 'Database content differs from git.' : 'Database content matches git.')
      return drifted ? 1 : 0
    }
    const outcome = await runSeed(db, bundle, {
      gitSha: values['git-sha'] ?? env['GITHUB_SHA'] ?? 'local',
      dryRun: values['dry-run'] === true,
    })
    printPlan(io, outcome.plan)
    io.out(`${outcome.dryRun ? 'Dry run' : 'Applied'} · content ${outcome.contentHash.slice(0, 12)} · seed_runs #${outcome.seedRunId}`)
    return 0
  } finally {
    await pool.end()
  }
}
```

`apps/api/src/db/cli/seed.ts`:

```ts
import { runSeedCli } from '../../content/cli'

runSeedCli(
  process.argv.slice(2),
  { out: (line) => process.stdout.write(`${line}\n`), err: (line) => process.stderr.write(`${line}\n`) },
  process.env,
).then(
  (code) => {
    process.exitCode = code
  },
  (error: unknown) => {
    console.error(error)
    process.exitCode = 1
  },
)
```

- [ ] **Step 8: Run all suites**

Run: `pnpm --filter @repo/api test && pnpm --filter @repo/api test:integration && pnpm --filter @repo/api typecheck && pnpm --filter @repo/api lint`
Expected: PASS.

- [ ] **Step 9: Seed the local database**

```bash
pnpm --filter @repo/api db:seed --dry-run
pnpm --filter @repo/api db:seed --apply
pnpm --filter @repo/api db:seed --check
```

Expected: a `+N ~0 -0 =0` line per table on the dry run; the same plan with `Applied`; then `Database content matches git.` and exit 0.

- [ ] **Step 10: Commit**

```bash
git add apps/api
git commit -m "feat(api): idempotent content seed from git with dry-run, drift check and seed_runs history

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Content reader and readiness

The reader turns rows back into contract types — and parses them through the contract on the way out, so the API can never emit a shape the web app's types do not describe. Its tests are round trips: seed the real `content/`, read it back, compare with what git says.

**Files:**
- Create: `apps/api/src/content/cursor.ts`, `apps/api/src/content/content.reader.ts`
- Create: `apps/api/src/health/readiness.ts`
- Modify: `apps/api/src/health/health.controller.ts`
- Test: `apps/api/src/content/cursor.test.ts`, `apps/api/src/health/readiness.test.ts`
- Test: `apps/api/test/content/reader.int.test.ts`, `apps/api/test/health/ready.int.test.ts`
- Create: `apps/api/test/support/seeded.ts`

**Interfaces:**
- Consumes: contracts types and schemas, `resolveDerivedKpis`, `Page`, `ProjectListQuery`, `Readiness` (Task 1); `ValidationFailedError` (Task 3); tables, `DB`, `PG_POOL`, `Database` (Task 4); `migrateToLatest` (Task 6); `runSeed`, `loadContentFromDir`, `REPO_CONTENT_DIR` (Task 7)
- Produces:
  - `encodeCursor(cursor: ProjectCursor): string`; `decodeCursor(value: string): ProjectCursor | null`; `interface ProjectCursor { order: number }`
  - `CONTENT_READER: unique symbol`; `interface ContentReader { getProfile(): Promise<Profile | null>; listDomains(): Promise<Domain[]>; listProjects(query: ProjectListQuery): Promise<Page<Project>>; getProject(slug: string): Promise<Project | null>; listExperience(): Promise<Experience[]>; listSkillGroups(): Promise<SkillGroup[]> }`
  - `class PostgresContentReader implements ContentReader` (constructor `@Inject(DB) db: Database`); `listProjects` throws `ValidationFailedError` with path `['cursor']` for a bad cursor
  - `probePostgres(pool: Pool, timeoutMs?: number): Promise<boolean>`
  - `GET /v1/ready` → `200 { status: 'ready', checks: { postgres: 'ok' } }` or `503 { status: 'unavailable', checks: { postgres: 'failed' } }`, `Cache-Control: no-store`
  - `seededDatabase(): Promise<{ database: TestDatabase; bundle: ContentBundle }>` in `test/support/seeded.ts` — migrated and seeded with the repo's content

- [ ] **Step 1: Write the failing unit tests**

`apps/api/src/content/cursor.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { decodeCursor, encodeCursor } from './cursor'

describe('project cursor', () => {
  it('round-trips and is URL-safe', () => {
    const encoded = encodeCursor({ order: 7 })
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeCursor(encoded)).toEqual({ order: 7 })
  })

  it.each([
    ['garbage', 'not-a-cursor!'],
    ['valid base64 of the wrong shape', Buffer.from('{"order":1}').toString('base64url')],
    ['a negative order', Buffer.from('[-1]').toString('base64url')],
    ['a fractional order', Buffer.from('[1.5]').toString('base64url')],
  ])('rejects %s', (_label, value) => {
    expect(decodeCursor(value)).toBeNull()
  })
})
```

`apps/api/src/health/readiness.test.ts`:

```ts
import type { NestExpressApplication } from '@nestjs/platform-express'
import type { Pool } from 'pg'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readinessSchema } from '@repo/contracts'
import { testEnv } from '../../test/support/env'
import { createApp } from '../app'
import { probePostgres } from './readiness'

describe('probePostgres', () => {
  it('reports false when the query exceeds the timeout', async () => {
    const hanging = { query: () => new Promise(() => undefined) } as unknown as Pool
    expect(await probePostgres(hanging, 20)).toBe(false)
  })

  it('reports false when the query fails', async () => {
    const failing = { query: () => Promise.reject(new Error('ECONNREFUSED')) } as unknown as Pool
    expect(await probePostgres(failing)).toBe(false)
  })
})

describe('GET /v1/ready without a database', () => {
  let app: NestExpressApplication

  beforeAll(async () => {
    app = await createApp(testEnv())
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('answers 503 so Cloud Run stops routing to the instance', async () => {
    const response = await request(app.getHttpServer()).get('/v1/ready').expect(503)
    expect(readinessSchema.parse(response.body)).toEqual({ status: 'unavailable', checks: { postgres: 'failed' } })
    expect(response.headers['cache-control']).toBe('no-store')
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @repo/api test`
Expected: FAIL — `./cursor` and `./readiness` do not exist.

- [ ] **Step 3: Implement the cursor, the probe and the endpoint**

`apps/api/src/content/cursor.ts`:

```ts
export interface ProjectCursor {
  order: number
}

/**
 * Keyset cursor over `sort_order`, which is unique (content integrity check + unique index).
 * Opaque to callers — base64url JSON — so the key can change without breaking the contract.
 */
export function encodeCursor(cursor: ProjectCursor): string {
  return Buffer.from(JSON.stringify([cursor.order])).toString('base64url')
}

export function decodeCursor(value: string): ProjectCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (Array.isArray(parsed) && parsed.length === 1 && Number.isInteger(parsed[0]) && (parsed[0] as number) >= 0) {
      return { order: parsed[0] as number }
    }
  } catch {
    // Not base64url JSON: fall through to null.
  }
  return null
}
```

`apps/api/src/health/readiness.ts`:

```ts
import type { Pool } from 'pg'

/** Readiness: can this instance serve reads right now? Bounded, so a hung pool fails fast. */
export async function probePostgres(pool: Pool, timeoutMs = 2_000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      pool.query('select 1'),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('readiness probe timed out')), timeoutMs)
      }),
    ])
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
```

Replace `apps/api/src/health/health.controller.ts` with:

```ts
import { Controller, Get, Header, Inject, Res } from '@nestjs/common'
import type { Response } from 'express'
import type { Pool } from 'pg'
import type { z } from 'zod'
import type { healthSchema, Readiness } from '@repo/contracts'
import { PG_POOL } from '../db/db.module'
import { probePostgres } from './readiness'

@Controller('v1')
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Liveness. Touches nothing, so a slow database never gets a healthy instance restarted. */
  @Get('health')
  @Header('Cache-Control', 'no-store')
  health(): z.infer<typeof healthSchema> {
    return { status: 'ok' }
  }

  /** Readiness. Postgres only in M1; GCS joins in M4 (plan refinement 5). */
  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async ready(@Res({ passthrough: true }) res: Response): Promise<Readiness> {
    const postgres = await probePostgres(this.pool)
    res.status(postgres ? 200 : 503)
    return { status: postgres ? 'ready' : 'unavailable', checks: { postgres: postgres ? 'ok' : 'failed' } }
  }
}
```

Run: `pnpm --filter @repo/api test`
Expected: PASS.

- [ ] **Step 4: Write the failing integration tests**

`apps/api/test/support/seeded.ts`:

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { inject } from 'vitest'
import { runSeed } from '../../src/content/seed'
import { type ContentBundle, loadContentFromDir } from '../../src/content/source'
import { createPool } from '../../src/db/connection'
import { schema } from '../../src/db/schema'
import { REPO_CONTENT_DIR } from './content'
import { createTestDatabase, type TestDatabase } from './database'
import { migrateToLatest } from './migrate'

/** A fresh database at the shipped schema, seeded with the repository's real content. */
export async function seededDatabase(): Promise<{ database: TestDatabase; bundle: ContentBundle }> {
  const database = await createTestDatabase(inject('databaseUrl'))
  await migrateToLatest(database.url)
  const bundle = await loadContentFromDir(REPO_CONTENT_DIR)
  const pool = createPool(database.url, 1)
  try {
    await runSeed(drizzle(pool, { schema }), bundle, { gitSha: 'test', dryRun: false })
  } finally {
    await pool.end()
  }
  return { database, bundle }
}
```

`apps/api/test/content/reader.int.test.ts`:

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { type Project, resolveDerivedKpis } from '@repo/contracts'
import { PostgresContentReader } from '../../src/content/content.reader'
import type { ContentBundle } from '../../src/content/source'
import { createPool } from '../../src/db/connection'
import { schema } from '../../src/db/schema'
import { ValidationFailedError } from '../../src/http/validation'
import { createTestDatabase, type TestDatabase } from '../support/database'
import { migrateToLatest } from '../support/migrate'
import { seededDatabase } from '../support/seeded'

const byOrder = (a: Project, b: Project) => a.order - b.order

describe('PostgresContentReader — round trip from git', () => {
  let database: TestDatabase
  let bundle: ContentBundle
  let pool: Pool
  let reader: PostgresContentReader

  beforeAll(async () => {
    ;({ database, bundle } = await seededDatabase())
    pool = createPool(database.url, 2)
    reader = new PostgresContentReader(drizzle(pool, { schema }))
  })

  afterAll(async () => {
    await pool.end()
    await database.drop()
  })

  it('returns the profile with derived KPIs resolved', async () => {
    expect(await reader.getProfile()).toEqual(resolveDerivedKpis(bundle.profile, bundle.projects))
  })

  it('returns domains, experience and skills exactly as authored, in order', async () => {
    expect(await reader.listDomains()).toEqual(bundle.domains)
    expect(await reader.listExperience()).toEqual(bundle.experience)
    expect(await reader.listSkillGroups()).toEqual(bundle.skills)
  })

  it('pages through every project in order', async () => {
    const collected: Project[] = []
    let cursor: string | undefined
    for (let guard = 0; guard < 50; guard++) {
      const page = await reader.listProjects({ limit: 2, ...(cursor === undefined ? {} : { cursor }) })
      expect(page.data.length).toBeLessThanOrEqual(2)
      collected.push(...page.data)
      if (page.nextCursor === null) break
      cursor = page.nextCursor
    }
    expect(collected).toEqual([...bundle.projects].sort(byOrder))
  })

  it('filters by domain and by featured', async () => {
    const domain = bundle.projects[0]?.domain ?? ''
    const inDomain = await reader.listProjects({ limit: 50, domain })
    expect(inDomain.data.map((p) => p.slug)).toEqual(
      bundle.projects.filter((p) => p.domain === domain).sort(byOrder).map((p) => p.slug),
    )
    const featured = await reader.listProjects({ limit: 50, featured: true })
    expect(featured.data.every((p) => p.featured)).toBe(true)
    expect(featured.data).toHaveLength(bundle.projects.filter((p) => p.featured).length)
  })

  it('rejects a malformed cursor as a validation failure', async () => {
    await expect(reader.listProjects({ limit: 5, cursor: 'nope' })).rejects.toBeInstanceOf(ValidationFailedError)
  })

  it('reads one project with its outcomes, or null', async () => {
    const withOutcomes = bundle.projects.find((p) => p.outcome.length > 0) ?? bundle.projects[0]
    expect(await reader.getProject(withOutcomes?.slug ?? '')).toEqual(withOutcomes)
    expect(await reader.getProject('does-not-exist')).toBeNull()
  })
})

describe('PostgresContentReader — before any seed', () => {
  it('returns null for the profile rather than inventing one', async () => {
    const database = await createTestDatabase(inject('databaseUrl'))
    await migrateToLatest(database.url)
    const pool = createPool(database.url, 1)
    try {
      expect(await new PostgresContentReader(drizzle(pool, { schema })).getProfile()).toBeNull()
    } finally {
      await pool.end()
      await database.drop()
    }
  })
})
```

`apps/api/test/health/ready.int.test.ts`:

```ts
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createApp } from '../../src/app'
import { createTestDatabase, type TestDatabase } from '../support/database'
import { testEnv } from '../support/env'

describe('GET /v1/ready with a database', () => {
  let database: TestDatabase
  let app: NestExpressApplication

  beforeAll(async () => {
    database = await createTestDatabase(inject('databaseUrl'))
    app = await createApp(testEnv({ DATABASE_URL: database.url }))
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await database.drop()
  })

  it('answers 200 ready', async () => {
    const response = await request(app.getHttpServer()).get('/v1/ready').expect(200)
    expect(response.body).toEqual({ status: 'ready', checks: { postgres: 'ok' } })
  })
})
```

- [ ] **Step 5: Run them to verify they fail**

Run: `pnpm --filter @repo/api test:integration`
Expected: FAIL — `content.reader` does not exist (the readiness test passes already).

- [ ] **Step 6: Implement the reader**

`apps/api/src/content/content.reader.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, gt, inArray, type SQL } from 'drizzle-orm'
import {
  type Domain,
  domainSchema,
  type Experience,
  experienceSchema,
  type Page,
  type Profile,
  profileSchema,
  type Project,
  type ProjectListQuery,
  projectSchema,
  resolveDerivedKpis,
  type SkillGroup,
  skillGroupSchema,
} from '@repo/contracts'
import { type Database, DB } from '../db/db.module'
import { domains, experiences, profile, projectOutcomes, projects, skillGroups, skills } from '../db/schema'
import { ValidationFailedError } from '../http/validation'
import { decodeCursor, encodeCursor } from './cursor'

export const CONTENT_READER = Symbol('CONTENT_READER')

export interface ContentReader {
  getProfile(): Promise<Profile | null>
  listDomains(): Promise<Domain[]>
  listProjects(query: ProjectListQuery): Promise<Page<Project>>
  getProject(slug: string): Promise<Project | null>
  listExperience(): Promise<Experience[]>
  listSkillGroups(): Promise<SkillGroup[]>
}

type ProjectRow = typeof projects.$inferSelect

/**
 * Rows → contract types. Every value is parsed through the shared schema on the way out, so a
 * database that drifted from the contract fails loudly here instead of reaching a client.
 */
@Injectable()
export class PostgresContentReader implements ContentReader {
  constructor(@Inject(DB) private readonly db: Database) {}

  async getProfile(): Promise<Profile | null> {
    const [row] = await this.db.select().from(profile).where(eq(profile.id, 1))
    if (row === undefined) return null
    const shipped = await this.db
      .select({ domain: projects.domainId, placeholder: projects.placeholder })
      .from(projects)
    const parsed = profileSchema.parse({
      name: row.name,
      headline: row.headline,
      sub: row.sub,
      location: row.location,
      email: row.email,
      ...(row.emailPlaceholder ? { emailPlaceholder: true } : {}),
      availability: row.availability,
      roles: row.roles,
      links: row.links,
      kpis: row.kpis,
    })
    return resolveDerivedKpis(parsed, shipped)
  }

  async listDomains(): Promise<Domain[]> {
    const rows = await this.db.select().from(domains).orderBy(asc(domains.position))
    return rows.map((row) => domainSchema.parse({ id: row.id, label: row.label, blurb: row.blurb, accent: row.accent }))
  }

  async listProjects(query: ProjectListQuery): Promise<Page<Project>> {
    const conditions: (SQL | undefined)[] = []
    if (query.domain !== undefined) conditions.push(eq(projects.domainId, query.domain))
    if (query.featured !== undefined) conditions.push(eq(projects.featured, query.featured))
    if (query.cursor !== undefined) {
      const cursor = decodeCursor(query.cursor)
      if (cursor === null) throw new ValidationFailedError([{ path: ['cursor'], message: 'Invalid cursor' }])
      conditions.push(gt(projects.sortOrder, cursor.order))
    }

    const rows = await this.db
      .select()
      .from(projects)
      .where(and(...conditions))
      .orderBy(asc(projects.sortOrder))
      .limit(query.limit + 1)

    const page = rows.slice(0, query.limit)
    const last = page.at(-1)
    return {
      data: await this.withOutcomes(page),
      nextCursor:
        rows.length > query.limit && last !== undefined
          ? encodeCursor({ order: last.sortOrder })
          : null,
    }
  }

  async getProject(slug: string): Promise<Project | null> {
    const rows = await this.db.select().from(projects).where(eq(projects.slug, slug))
    const [project] = await this.withOutcomes(rows)
    return project ?? null
  }

  async listExperience(): Promise<Experience[]> {
    const rows = await this.db.select().from(experiences).orderBy(asc(experiences.position))
    return rows.map((row) =>
      experienceSchema.parse({
        org: row.org,
        title: row.title,
        period: row.periodTo === null ? { from: row.periodFrom } : { from: row.periodFrom, to: row.periodTo },
        ...(row.location === null ? {} : { location: row.location }),
        highlights: row.highlights,
        placeholder: row.placeholder,
      }),
    )
  }

  async listSkillGroups(): Promise<SkillGroup[]> {
    const [groups, items] = await Promise.all([
      this.db.select().from(skillGroups).orderBy(asc(skillGroups.position)),
      this.db.select().from(skills).orderBy(asc(skills.groupId), asc(skills.position)),
    ])
    return groups.map((group) =>
      skillGroupSchema.parse({
        id: group.id,
        label: group.label,
        items: items
          .filter((item) => item.groupId === group.id)
          .map((item) => ({ name: item.name, level: item.level })),
      }),
    )
  }

  private async withOutcomes(rows: ProjectRow[]): Promise<Project[]> {
    if (rows.length === 0) return []
    const outcomes = await this.db
      .select()
      .from(projectOutcomes)
      .where(inArray(projectOutcomes.projectSlug, rows.map((row) => row.slug)))
      .orderBy(asc(projectOutcomes.projectSlug), asc(projectOutcomes.position))

    return rows.map((row) =>
      projectSchema.parse({
        slug: row.slug,
        name: row.name,
        domain: row.domainId,
        role: row.role,
        period: row.periodTo === null ? { from: row.periodFrom } : { from: row.periodFrom, to: row.periodTo },
        summary: row.summary,
        stack: row.stack,
        visibility: row.visibility,
        featured: row.featured,
        order: row.sortOrder,
        outcome: outcomes
          .filter((outcome) => outcome.projectSlug === row.slug)
          .map((outcome) => ({ label: outcome.label, value: outcome.value, placeholder: outcome.placeholder })),
        links: row.links,
        formation: row.formation,
        placeholder: row.placeholder,
      }),
    )
  }
}
```

- [ ] **Step 7: Run all suites**

Run: `pnpm --filter @repo/api test && pnpm --filter @repo/api test:integration && pnpm --filter @repo/api typecheck && pnpm --filter @repo/api lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api
git commit -m "feat(api): contract-parsed content reader with keyset pagination, and /v1/ready

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Public read endpoints

**Files:**
- Create: `apps/api/src/content/content.controller.ts`, `apps/api/src/content/projects.controller.ts`, `apps/api/src/content/content.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/content/content.e2e.test.ts`

**Interfaces:**
- Consumes: `CONTENT_READER`, `ContentReader`, `PostgresContentReader` (Task 8); `ZodValidationPipe`, `PublicCacheInterceptor`, `PUBLIC_CACHE_CONTROL` (Task 3); `projectListQuerySchema`, `slugSchema`, `problemDetailsSchema` (Task 1); `seededDatabase` (Task 8)
- Produces (all under `Cache-Control: public, s-maxage=300, stale-while-revalidate=86400` with strong ETags):
  - `GET /v1/profile` → `Profile` (derived KPIs resolved) · `404` before the first seed
  - `GET /v1/domains` → `Domain[]` · `GET /v1/experience` → `Experience[]` · `GET /v1/skills` → `SkillGroup[]`
  - `GET /v1/projects?domain=&featured=&limit=&cursor=` → `Page<Project>` · `422` on an invalid or unknown parameter
  - `GET /v1/projects/:slug` → `Project` · `404` unknown · `422` non-kebab slug
  - `ContentController`, `ProjectsController`, `ContentModule` (Task 10 adds OpenAPI decorators to both controllers)

- [ ] **Step 1: Write the failing end-to-end test**

`apps/api/test/content/content.e2e.test.ts`:

```ts
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { type Page, problemDetailsSchema, type Project, resolveDerivedKpis } from '@repo/contracts'
import { createApp } from '../../src/app'
import type { ContentBundle } from '../../src/content/source'
import { PUBLIC_CACHE_CONTROL } from '../../src/http/cache'
import { createTestDatabase, type TestDatabase } from '../support/database'
import { testEnv } from '../support/env'
import { migrateToLatest } from '../support/migrate'
import { seededDatabase } from '../support/seeded'

const byOrder = (a: Project, b: Project) => a.order - b.order

describe('public content API', () => {
  let database: TestDatabase
  let bundle: ContentBundle
  let app: NestExpressApplication
  let http: ReturnType<typeof request>

  beforeAll(async () => {
    ;({ database, bundle } = await seededDatabase())
    app = await createApp(testEnv({ DATABASE_URL: database.url }))
    await app.init()
    http = request(app.getHttpServer())
  })

  afterAll(async () => {
    await app.close()
    await database.drop()
  })

  describe('round trip: every read equals what git says', () => {
    it('GET /v1/profile', async () => {
      const response = await http.get('/v1/profile').expect(200)
      expect(response.body).toEqual(resolveDerivedKpis(bundle.profile, bundle.projects))
    })

    it('GET /v1/domains, /v1/experience, /v1/skills', async () => {
      expect((await http.get('/v1/domains').expect(200)).body).toEqual(bundle.domains)
      expect((await http.get('/v1/experience').expect(200)).body).toEqual(bundle.experience)
      expect((await http.get('/v1/skills').expect(200)).body).toEqual(bundle.skills)
    })

    it('GET /v1/projects returns every project on one default page', async () => {
      const page = (await http.get('/v1/projects').expect(200)).body as Page<Project>
      expect(page.data).toEqual([...bundle.projects].sort(byOrder))
      expect(page.nextCursor).toBeNull()
    })

    it('GET /v1/projects/:slug', async () => {
      const project = bundle.projects[0]
      expect((await http.get(`/v1/projects/${project?.slug}`).expect(200)).body).toEqual(project)
    })
  })

  describe('projects query', () => {
    it('follows cursors to the end', async () => {
      const slugs: string[] = []
      let path = '/v1/projects?limit=3'
      for (let guard = 0; guard < 20; guard++) {
        const page = (await http.get(path).expect(200)).body as Page<Project>
        slugs.push(...page.data.map((p) => p.slug))
        if (page.nextCursor === null) break
        path = `/v1/projects?limit=3&cursor=${page.nextCursor}`
      }
      expect(slugs).toEqual([...bundle.projects].sort(byOrder).map((p) => p.slug))
    })

    it('filters by featured and by domain', async () => {
      const featured = (await http.get('/v1/projects?featured=true').expect(200)).body as Page<Project>
      expect(featured.data.map((p) => p.slug)).toEqual(
        bundle.projects.filter((p) => p.featured).sort(byOrder).map((p) => p.slug),
      )
      const domain = bundle.projects[0]?.domain ?? ''
      const inDomain = (await http.get(`/v1/projects?domain=${domain}`).expect(200)).body as Page<Project>
      expect(inDomain.data.every((p) => p.domain === domain)).toBe(true)
    })

    it.each([
      ['limit=0', 'limit'],
      ['limit=51', 'limit'],
      ['featured=yes', 'featured'],
      ['cursor=nope', 'cursor'],
    ])('answers ?%s with 422 naming %s', async (query, field) => {
      const response = await http.get(`/v1/projects?${query}`).expect(422)
      const problem = problemDetailsSchema.parse(JSON.parse(response.text))
      expect(problem.errors?.map((error) => error.path[0])).toContain(field)
    })

    it('rejects unknown parameters with 422', async () => {
      await http.get('/v1/projects?sort=name').expect(422)
    })
  })

  describe('single project errors', () => {
    it('404s an unknown slug as Problem Details', async () => {
      const response = await http.get('/v1/projects/does-not-exist').expect(404)
      expect(response.headers['content-type']).toMatch(/^application\/problem\+json/)
      expect(problemDetailsSchema.parse(JSON.parse(response.text)).instance).toBe('/v1/projects/does-not-exist')
    })

    it('422s a slug that could never exist', async () => {
      await http.get('/v1/projects/Not%20Kebab').expect(422)
    })
  })

  describe('HTTP caching', () => {
    it('sends public cache headers and honours If-None-Match', async () => {
      const first = await http.get('/v1/projects').expect(200)
      expect(first.headers['cache-control']).toBe(PUBLIC_CACHE_CONTROL)
      await http.get('/v1/projects').set('If-None-Match', String(first.headers['etag'])).expect(304)
    })

    it('answers HEAD without a body', async () => {
      const response = await http.head('/v1/profile').expect(200)
      expect(response.text ?? '').toBe('')
    })
  })
})

describe('public content API before the first seed', () => {
  it('404s the profile instead of inventing one', async () => {
    const database = await createTestDatabase(inject('databaseUrl'))
    await migrateToLatest(database.url)
    const app = await createApp(testEnv({ DATABASE_URL: database.url }))
    await app.init()
    try {
      await request(app.getHttpServer()).get('/v1/profile').expect(404)
      expect((await request(app.getHttpServer()).get('/v1/projects').expect(200)).body).toEqual({
        data: [],
        nextCursor: null,
      })
    } finally {
      await app.close()
      await database.drop()
    }
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @repo/api test:integration`
Expected: FAIL — every `/v1/<content>` route returns 404.

- [ ] **Step 3: Implement the controllers and module**

`apps/api/src/content/content.controller.ts`:

```ts
import { Controller, Get, Inject, NotFoundException, UseInterceptors } from '@nestjs/common'
import type { Domain, Experience, Profile, SkillGroup } from '@repo/contracts'
import { PublicCacheInterceptor } from '../http/cache'
import { CONTENT_READER, type ContentReader } from './content.reader'

@Controller('v1')
@UseInterceptors(PublicCacheInterceptor)
export class ContentController {
  constructor(@Inject(CONTENT_READER) private readonly content: ContentReader) {}

  @Get('profile')
  async profile(): Promise<Profile> {
    const profile = await this.content.getProfile()
    if (profile === null) throw new NotFoundException('The profile has not been seeded yet.')
    return profile
  }

  @Get('domains')
  domains(): Promise<Domain[]> {
    return this.content.listDomains()
  }

  @Get('experience')
  experience(): Promise<Experience[]> {
    return this.content.listExperience()
  }

  @Get('skills')
  skills(): Promise<SkillGroup[]> {
    return this.content.listSkillGroups()
  }
}
```

`apps/api/src/content/projects.controller.ts`:

```ts
import { Controller, Get, Inject, NotFoundException, Param, Query, UseInterceptors } from '@nestjs/common'
import { type Page, type Project, type ProjectListQuery, projectListQuerySchema, slugSchema } from '@repo/contracts'
import { PublicCacheInterceptor } from '../http/cache'
import { ZodValidationPipe } from '../http/validation'
import { CONTENT_READER, type ContentReader } from './content.reader'

@Controller('v1/projects')
@UseInterceptors(PublicCacheInterceptor)
export class ProjectsController {
  constructor(@Inject(CONTENT_READER) private readonly content: ContentReader) {}

  @Get()
  list(@Query(new ZodValidationPipe(projectListQuerySchema)) query: ProjectListQuery): Promise<Page<Project>> {
    return this.content.listProjects(query)
  }

  @Get(':slug')
  async get(@Param('slug', new ZodValidationPipe(slugSchema)) slug: string): Promise<Project> {
    const project = await this.content.getProject(slug)
    if (project === null) throw new NotFoundException(`No project named ${slug}.`)
    return project
  }
}
```

`apps/api/src/content/content.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { ContentController } from './content.controller'
import { CONTENT_READER, PostgresContentReader } from './content.reader'
import { ProjectsController } from './projects.controller'

@Module({
  controllers: [ContentController, ProjectsController],
  providers: [{ provide: CONTENT_READER, useClass: PostgresContentReader }],
})
export class ContentModule {}
```

In `apps/api/src/app.module.ts`, add `import { ContentModule } from './content/content.module'` and append `ContentModule` to `imports` after `DbModule`.

- [ ] **Step 4: Run all suites**

Run: `pnpm --filter @repo/api test && pnpm --filter @repo/api test:integration && pnpm --filter @repo/api typecheck && pnpm --filter @repo/api lint`
Expected: PASS.

- [ ] **Step 5: Exercise it locally**

```bash
pnpm --filter @repo/api build
pnpm --filter @repo/api start
```

In a second terminal:

```bash
curl -s http://localhost:8080/v1/projects?limit=2
curl -s -i http://localhost:8080/v1/projects/does-not-exist
```

Expected: a page of two projects with a `nextCursor`; then `HTTP/1.1 404`, `Content-Type: application/problem+json`, an `X-Request-Id` header and a JSON body whose `requestId` matches it. Stop the server with Ctrl+C and confirm it exits cleanly (the pool closes on shutdown).

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "feat(api): public read endpoints for profile, domains, projects, experience and skills

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: OpenAPI from the Zod contracts, Swagger UI, and a committed contract snapshot

Spec §1: the published API surface is itself a portfolio artifact. The document is generated from the **same** Zod schemas that validate requests and type the web app, and a committed snapshot makes every contract change a visible diff in review (spec §10, "Contract").

**Files:**
- Create: `apps/api/src/openapi/openapi.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/src/content/content.controller.ts`, `apps/api/src/content/projects.controller.ts`, `apps/api/src/health/health.controller.ts`
- Test: `apps/api/src/openapi/openapi.test.ts`
- Create (generated by the test): `apps/api/openapi.snapshot.json`

**Interfaces:**
- Consumes: controllers (Tasks 8–9); contracts schemas (Task 1); `createApp`, `testEnv` (Tasks 2–3)
- Produces:
  - `zodToOpenApi(schema: z.ZodTypeAny): SchemaObject`
  - `ApiProblem(...statuses: number[])` — method decorator documenting `application/problem+json` responses
  - `buildOpenApiDocument(app: NestExpressApplication, env: Env): OpenAPIObject`
  - `setupOpenApi(app: NestExpressApplication, env: Env): void` — Swagger UI at `/docs`, JSON at `/v1/openapi.json`
  - `OPENAPI_JSON_PATH = 'v1/openapi.json'`

- [ ] **Step 1: Write the failing test**

`apps/api/src/openapi/openapi.test.ts`:

```ts
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testEnv } from '../../test/support/env'
import { createApp } from '../app'
import { buildOpenApiDocument } from './openapi'

describe('OpenAPI', () => {
  // A fixed base URL keeps the snapshot independent of whoever runs the test.
  const env = testEnv({ PUBLIC_BASE_URL: 'https://api.example.dev' })
  let app: NestExpressApplication

  beforeAll(async () => {
    app = await createApp(env)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('matches the committed contract snapshot', async () => {
    const document = buildOpenApiDocument(app, env)
    // To accept an intended change: pnpm --filter @repo/api exec vitest run --project unit -u
    await expect(`${JSON.stringify(document, null, 2)}\n`).toMatchFileSnapshot('../../openapi.snapshot.json')
  })

  it('documents every public read with a JSON schema for its 200 response', () => {
    const document = buildOpenApiDocument(app, env)
    const paths = [
      '/v1/health',
      '/v1/ready',
      '/v1/profile',
      '/v1/domains',
      '/v1/experience',
      '/v1/skills',
      '/v1/projects',
      '/v1/projects/{slug}',
    ]
    for (const path of paths) {
      const schema = document.paths[path]?.get?.responses['200']
      expect(schema, `${path} documents a 200`).toBeDefined()
      expect(JSON.stringify(schema), `${path} carries a schema`).toContain('"schema"')
    }
  })

  it('documents errors as Problem Details', () => {
    const document = buildOpenApiDocument(app, env)
    const responses = document.paths['/v1/projects']?.get?.responses ?? {}
    expect(Object.keys(responses)).toContain('422')
    expect(JSON.stringify(responses['422'])).toContain('application/problem+json')
    const parameters = (document.paths['/v1/projects']?.get?.parameters ?? []) as { name: string }[]
    expect(parameters.map((parameter) => parameter.name).sort()).toEqual(['cursor', 'domain', 'featured', 'limit'])
  })

  it('serves the JSON document and the Swagger UI', async () => {
    const json = await request(app.getHttpServer()).get('/v1/openapi.json').expect(200)
    expect(json.body.openapi).toMatch(/^3\./)
    expect(json.body.info.title).toBe('Portfolio API')
    const ui = await request(app.getHttpServer()).get('/docs').redirects(1).expect(200)
    expect(ui.text).toContain('swagger-ui')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @repo/api test`
Expected: FAIL — `./openapi` does not exist.

- [ ] **Step 3: Implement the OpenAPI module**

`apps/api/src/openapi/openapi.ts`:

```ts
import { STATUS_CODES } from 'node:http'
import { applyDecorators } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { ApiResponse, DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger'
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface'
import type { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { problemDetailsSchema } from '@repo/contracts'
import type { Env } from '../config/env'

export const OPENAPI_JSON_PATH = 'v1/openapi.json'

/** One schema, three uses: request validation, this document, and the web app's types. */
export function zodToOpenApi(schema: z.ZodTypeAny): SchemaObject {
  return zodToJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' }) as SchemaObject
}

/** Documents RFC 9457 error responses for the given statuses. */
export function ApiProblem(...statuses: number[]): ReturnType<typeof applyDecorators> {
  const schema = zodToOpenApi(problemDetailsSchema)
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: STATUS_CODES[status] ?? 'Error',
        content: { 'application/problem+json': { schema } },
      }),
    ),
  )
}

export function buildOpenApiDocument(app: NestExpressApplication, env: Env): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Portfolio API')
    .setDescription(
      "Public read API behind Wieslaw Samushonga's portfolio. Content is seeded from the site's git " +
        'repository and served with strong ETags and CDN cache headers. Every error is RFC 9457 ' +
        'Problem Details (`application/problem+json`) carrying the request ID from `X-Request-Id`.',
    )
    .setVersion('1.0.0')
    .addServer(env.PUBLIC_BASE_URL)
    .build()
  return SwaggerModule.createDocument(app, config)
}

export function setupOpenApi(app: NestExpressApplication, env: Env): void {
  SwaggerModule.setup('docs', app, buildOpenApiDocument(app, env), {
    jsonDocumentUrl: OPENAPI_JSON_PATH,
    raw: ['json'],
    customSiteTitle: 'Portfolio API',
  })
}
```

In `apps/api/src/app.ts`, add `import { setupOpenApi } from './openapi/openapi'` and call it just before `app.enableShutdownHooks()`:

```ts
  setupOpenApi(app, env)
```

- [ ] **Step 4: Decorate the controllers**

`apps/api/src/health/health.controller.ts` — add imports:

```ts
import { ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger'
import { healthSchema as healthResponse, readinessSchema } from '@repo/contracts'
import { zodToOpenApi } from '../openapi/openapi'
```

change the existing `import type { healthSchema, Readiness } from '@repo/contracts'` to `import type { Readiness } from '@repo/contracts'`, change the return type of `health()` to `z.infer<typeof healthResponse>`, then decorate:

```ts
@ApiTags('operations')
@Controller('v1')
export class HealthController {
```

```ts
  @Get('health')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ description: 'Liveness', schema: zodToOpenApi(healthResponse) })
```

```ts
  @Get('ready')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ description: 'Ready to serve', schema: zodToOpenApi(readinessSchema) })
  @ApiResponse({ status: 503, description: 'A dependency is unavailable', schema: zodToOpenApi(readinessSchema) })
```

`apps/api/src/content/content.controller.ts` — add imports:

```ts
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'
import { domainSchema, experienceSchema, profileSchema, skillGroupSchema } from '@repo/contracts'
import { ApiProblem, zodToOpenApi } from '../openapi/openapi'
```

and decorate:

```ts
@ApiTags('content')
@Controller('v1')
@UseInterceptors(PublicCacheInterceptor)
export class ContentController {
```

```ts
  @Get('profile')
  @ApiOkResponse({ schema: zodToOpenApi(profileSchema) })
  @ApiProblem(404)
```

```ts
  @Get('domains')
  @ApiOkResponse({ schema: zodToOpenApi(z.array(domainSchema)) })
```

```ts
  @Get('experience')
  @ApiOkResponse({ schema: zodToOpenApi(z.array(experienceSchema)) })
```

```ts
  @Get('skills')
  @ApiOkResponse({ schema: zodToOpenApi(z.array(skillGroupSchema)) })
```

`apps/api/src/content/projects.controller.ts` — add imports:

```ts
import { ApiOkResponse, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger'
import { pageSchema, projectSchema } from '@repo/contracts'
import { ApiProblem, zodToOpenApi } from '../openapi/openapi'
```

(merge `pageSchema` and `projectSchema` into the existing `@repo/contracts` import), and decorate:

```ts
const SLUG_PATTERN = '^[a-z0-9]+(?:-[a-z0-9]+)*$'

@ApiTags('content')
@Controller('v1/projects')
@UseInterceptors(PublicCacheInterceptor)
export class ProjectsController {
```

```ts
  @Get()
  @ApiOkResponse({ schema: zodToOpenApi(pageSchema(projectSchema)) })
  @ApiQuery({ name: 'domain', required: false, schema: { type: 'string', pattern: SLUG_PATTERN } })
  @ApiQuery({ name: 'featured', required: false, schema: { type: 'string', enum: ['true', 'false'] } })
  @ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque; from a previous page', schema: { type: 'string' } })
  @ApiProblem(422)
```

```ts
  @Get(':slug')
  @ApiParam({ name: 'slug', schema: { type: 'string', pattern: SLUG_PATTERN } })
  @ApiOkResponse({ schema: zodToOpenApi(projectSchema) })
  @ApiProblem(404, 422)
```

- [ ] **Step 5: Generate the snapshot and run everything**

Run: `pnpm --filter @repo/api test`
Expected: PASS; `apps/api/openapi.snapshot.json` is written on this first run. Open it and check: 8 paths, `info.title` `Portfolio API`, `servers[0].url` `https://api.example.dev`, a `422` with `application/problem+json` under `/v1/projects`, and a `Project` schema with `slug`, `domain`, `period`, `stack` properties. The `@Query()` argument itself adds no parameter: its design type is the `ProjectListQuery` alias, which reflects as `Object`, and the explorer documents only the four `@ApiQuery` entries — the "documents errors" test asserts exactly that list.

Run: `pnpm --filter @repo/api test:integration && pnpm --filter @repo/api typecheck && pnpm --filter @repo/api lint`
Expected: PASS.

Run: `CI=true pnpm --filter @repo/api test`
Expected: PASS. (Under `CI=true`, Vitest refuses to write a missing snapshot, which is how CI catches an uncommitted contract change.)

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "feat(api): OpenAPI document from the Zod contracts, Swagger UI at /docs, committed contract snapshot

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Production image — distroless, framework-only `node_modules`, ≤ 200 MB

**Files:**
- Create: `apps/api/Dockerfile`
- Create: `.dockerignore` (repo root — the build context is the workspace root)

**Interfaces:**
- Consumes: `@repo/api` `build` script and `files: ["dist"]` (Task 2); the full app (Tasks 2–10)
- Produces: an image that runs `node dist/main.js` as a non-root user on port 8080; Task 12 gates its size, boot and vulnerabilities; Task 13 deploys it

- [ ] **Step 1: Write the build context filter**

`.dockerignore`:

```
# The build context is the repo root, for the pnpm workspace and lockfile. Keep it small.
.git
**/node_modules
**/.next
**/.turbo
**/dist
**/coverage
**/test-results
**/playwright-report
**/.lighthouseci
docs
content
# apps/web is not built into this image, but pnpm needs its manifest to honour the lockfile.
apps/web/*
!apps/web/package.json
**/.env
**/.env.*
!**/.env.example
```

- [ ] **Step 2: Write the Dockerfile**

`apps/api/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1.7
# Build from the repo root:  docker build -f apps/api/Dockerfile -t portfolio-api .

FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

# Manifests first, so dependency layers are cached across source-only changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile --filter @repo/api...

COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @repo/api build

# A self-contained copy of @repo/api with production dependencies only. Contracts, Zod, Drizzle
# and ulid are devDependencies because tsup inlined them into dist/main.js.
RUN pnpm --filter @repo/api deploy --prod /out

FROM gcr.io/distroless/nodejs22-debian12:nonroot
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
EXPOSE 8080
# The distroless entrypoint is `node`.
CMD ["--enable-source-maps", "dist/main.js"]
```

- [ ] **Step 3: Build and check the budget**

```bash
docker build -f apps/api/Dockerfile -t portfolio-api:local .
docker image inspect portfolio-api:local --format '{{.Size}}' | awk '{ printf "%.1f MB\n", $1 / 1000000 }'
```

Expected: the build succeeds and the size is **≤ 200.0 MB**. If it is over:
1. `docker run --rm --entrypoint=/nodejs/bin/node portfolio-api:local -e "console.log(require('fs').readdirSync('node_modules'))"` and confirm no devDependency (`typescript`, `vitest`, `drizzle-kit`, `@swc/*`, `zod`, `drizzle-orm`) is present — if one is, it was listed under `dependencies` by mistake.
2. Only then consider inlining more pure-JS packages via `noExternal` in `tsup.config.ts` (moving each to `devDependencies`), re-running the boot check below after every change.

- [ ] **Step 4: Boot it against the local database**

```bash
docker run --rm -d --name portfolio-api -p 8080:8080 \
  -e DATABASE_URL=postgres://portfolio:portfolio@host.docker.internal:5433/portfolio \
  -e PUBLIC_BASE_URL=http://localhost:8080 \
  portfolio-api:local
start=$(date +%s%N); until curl -fsS http://localhost:8080/v1/health >/dev/null; do sleep 0.1; done
echo "ready in $(( ($(date +%s%N) - start) / 1000000 )) ms"
curl -s http://localhost:8080/v1/ready
curl -s http://localhost:8080/v1/profile | head -c 200; echo
docker logs portfolio-api | head -n 3
docker stop portfolio-api
```

Expected: `ready in` well under 2000 ms (spec §11 cold-start budget); `{"status":"ready","checks":{"postgres":"ok"}}`; the start of the seeded profile JSON; log lines that are single-line JSON with `"severity":"INFO"` and a `message` key; `docker stop` returns within a few seconds (SIGTERM drains and exits rather than waiting out the 10 s kill).

- [ ] **Step 5: Commit**

```bash
git add apps/api/Dockerfile .dockerignore
git commit -m "build(api): distroless production image with framework-only node_modules

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: CI — integration against real Postgres, image gates, Neon branch per PR

The existing `verify` job already runs `pnpm typecheck`, `pnpm lint` and `pnpm test` through Turbo, so the API's unit tests and the OpenAPI snapshot (under GitHub's `CI=true`, which refuses to write snapshots) run there with no change. This task adds what needs a database or Docker.

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/neon-branch-cleanup.yml`

**Interfaces:**
- Consumes: `db:migrate --verify|--apply`, `db:seed --apply|--check`, `test:integration`, `apps/api/Dockerfile` (Tasks 5–11)
- Produces: jobs `api-integration`, `api-image`, `api-neon-branch`; repository settings it reads — variable `NEON_PROJECT_ID`, secret `NEON_API_KEY` (both optional until the Neon project exists)

- [ ] **Step 1: Add the jobs**

Append to the `jobs:` map in `.github/workflows/ci.yml`:

```yaml
  api-integration:
    name: API — migrations, seed and integration tests on Postgres 17
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 2s
          --health-timeout 3s
          --health-retries 30
    env:
      TEST_DATABASE_URL: postgres://postgres:postgres@localhost:5432/postgres
    steps:
      - uses: actions/checkout@v4
      # No `version:` — `packageManager` in package.json is the single source of truth.
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          cache-dependency-path: pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - name: Every migration ships a down.sql
        run: pnpm --filter @repo/api db:migrate --verify
      - name: Integration and end-to-end suites
        run: pnpm --filter @repo/api test:integration
      - name: Migrations apply and content seeds cleanly from git
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/postgres
        run: |
          pnpm --filter @repo/api db:migrate --dry-run
          pnpm --filter @repo/api db:migrate --apply
          pnpm --filter @repo/api db:seed --apply
          pnpm --filter @repo/api db:seed --check

  api-image:
    name: API — image size, boot and vulnerability scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build
        run: docker build -f apps/api/Dockerfile -t portfolio-api:ci .
      - name: Image is within the 200 MB budget
        run: |
          size=$(docker image inspect portfolio-api:ci --format '{{.Size}}')
          echo "Image size: $((size / 1000000)) MB (budget 200 MB)"
          test "$size" -le 200000000
      - name: Boots and answers liveness without a database
        run: |
          docker run -d --name api -p 8080:8080 \
            -e DATABASE_URL=postgres://nobody:nothing@127.0.0.1:1/none portfolio-api:ci
          for attempt in $(seq 1 40); do
            if curl -fsS http://localhost:8080/v1/health; then exit 0; fi
            sleep 0.25
          done
          docker logs api
          exit 1
      - name: No fixable HIGH or CRITICAL vulnerabilities
        uses: aquasecurity/trivy-action@v0.36.0
        with:
          image-ref: portfolio-api:ci
          severity: CRITICAL,HIGH
          ignore-unfixed: true
          vuln-type: os,library
          exit-code: '1'

  api-neon-branch:
    name: API — migrations against a Neon branch of production
    # Runs once the Neon project exists, and never for forks (no secrets there).
    if: >-
      github.event_name == 'pull_request' &&
      vars.NEON_PROJECT_ID != '' &&
      github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          cache-dependency-path: pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - name: Branch production data for this PR
        id: branch
        uses: neondatabase/create-branch-action@v6.4.0
        with:
          project_id: ${{ vars.NEON_PROJECT_ID }}
          branch_name: preview/pr-${{ github.event.number }}
          api_key: ${{ secrets.NEON_API_KEY }}
      - name: Dry-run, apply, seed and check against the real data shape
        env:
          DATABASE_URL: ${{ steps.branch.outputs.db_url }}
        run: |
          pnpm --filter @repo/api db:migrate --dry-run
          pnpm --filter @repo/api db:migrate --apply
          pnpm --filter @repo/api db:seed --apply
          pnpm --filter @repo/api db:seed --check
```

`.github/workflows/neon-branch-cleanup.yml`:

```yaml
name: Neon branch cleanup

on:
  pull_request:
    types: [closed]

jobs:
  delete:
    name: Delete the PR's Neon branch
    if: vars.NEON_PROJECT_ID != '' && github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    steps:
      - uses: neondatabase/delete-branch-action@v3.2.1
        with:
          project_id: ${{ vars.NEON_PROJECT_ID }}
          branch: preview/pr-${{ github.event.number }}
          api_key: ${{ secrets.NEON_API_KEY }}
```

- [ ] **Step 2: Validate the workflow syntax locally**

Run: `npx --yes @action-validator/cli .github/workflows/ci.yml && npx --yes @action-validator/cli .github/workflows/neon-branch-cleanup.yml`
Expected: no output and exit 0 for both.

- [ ] **Step 3: Commit, push the branch and watch CI**

Pushing and opening a PR are outward-facing: confirm with Wieslaw before running the `git push` and `gh pr create` lines.

```bash
git add .github/workflows/ci.yml .github/workflows/neon-branch-cleanup.yml
git commit -m "ci(api): integration on Postgres 17, image budget and Trivy gates, Neon branch per PR

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push -u origin feat/m1-api-service
gh pr create --draft --title "M1: API service" --body "Implements docs/superpowers/plans/2026-09-17-m1-api-service.md.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh pr checks --watch
```

Expected: `verify`, `budgets`, `e2e`, `api-integration` and `api-image` pass; `api-neon-branch` is **skipped** until `NEON_PROJECT_ID` is set. If `api-image`'s Trivy step fails, read the CVE list: update the flagged dependency (or rebuild to pick up a patched distroless base) rather than lowering the severity gate.

---

## Task 13: Keyless deploy to Cloud Run, the one-time GCP runbook, and the M1 close-out

The workflow is complete and committed now, but **skips itself until `vars.GCP_PROJECT_ID` exists** — the GCP project and Neon project are owner inputs (spec §10). Step 4 is the only step that needs them.

**Files:**
- Create: `.github/workflows/deploy-api.yml`
- Create: `docs/api-gcp-setup.md`
- Create: `docs/m1-status.md`
- Modify: `README.md` (repo root)

**Interfaces:**
- Consumes: CI workflow named `CI` (Task 12); image (Task 11); `db:migrate --apply`, `db:seed --apply` (Tasks 5, 7); env contract (Task 2)
- Produces: GitHub **variables** `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA`, `GCP_RUNTIME_SA`, `API_PUBLIC_BASE_URL`, `API_CORS_ORIGINS`, `API_CORS_PREVIEW_ORIGIN_PATTERN`; Secret Manager secret `api-database-url`; Cloud Run service `portfolio-api`; Artifact Registry repository `portfolio`

- [ ] **Step 1: Write the deploy workflow**

`.github/workflows/deploy-api.yml`:

```yaml
name: Deploy API

# Deploys only a commit that CI already passed on main. No service-account keys exist anywhere:
# GitHub's OIDC token is exchanged for short-lived GCP credentials (Workload Identity Federation).
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy-api
  cancel-in-progress: false

permissions:
  contents: read
  id-token: write

jobs:
  deploy:
    name: Build, migrate, seed, deploy
    if: >-
      vars.GCP_PROJECT_ID != '' &&
      (github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success')
    runs-on: ubuntu-latest
    environment: production
    env:
      SERVICE: portfolio-api
      REGION: ${{ vars.GCP_REGION }}
      IMAGE: ${{ vars.GCP_REGION }}-docker.pkg.dev/${{ vars.GCP_PROJECT_ID }}/portfolio/api:${{ github.event.workflow_run.head_sha || github.sha }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.workflow_run.head_sha || github.sha }}
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          cache-dependency-path: pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile

      - uses: google-github-actions/auth@v3
        with:
          workload_identity_provider: ${{ vars.GCP_WIF_PROVIDER }}
          service_account: ${{ vars.GCP_DEPLOY_SA }}
      - uses: google-github-actions/setup-gcloud@v3

      - name: Build and push the image
        run: |
          gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet
          docker build -f apps/api/Dockerfile -t "$IMAGE" .
          docker push "$IMAGE"

      - name: Read the database URL from Secret Manager
        run: |
          url=$(gcloud secrets versions access latest --secret=api-database-url --project="${{ vars.GCP_PROJECT_ID }}")
          echo "::add-mask::$url"
          echo "DATABASE_URL=$url" >> "$GITHUB_ENV"

      # Expand/contract (spec §6) is what makes migrating before the new revision serves safe:
      # the old revision keeps working against the expanded schema.
      - name: Migrate
        run: |
          pnpm --filter @repo/api db:migrate --dry-run
          pnpm --filter @repo/api db:migrate --apply
      - name: Seed content from git
        run: pnpm --filter @repo/api db:seed --apply --git-sha "${{ github.event.workflow_run.head_sha || github.sha }}"

      - name: Deploy to Cloud Run
        run: |
          # ^@^ switches gcloud's list delimiter to @, because CORS_ORIGINS itself contains commas.
          gcloud run deploy "$SERVICE" \
            --project="${{ vars.GCP_PROJECT_ID }}" \
            --region="$REGION" \
            --image="$IMAGE" \
            --service-account="${{ vars.GCP_RUNTIME_SA }}" \
            --allow-unauthenticated \
            --min-instances=0 --max-instances=10 \
            --cpu=1 --memory=512Mi --concurrency=80 --timeout=30 \
            --set-secrets=DATABASE_URL=api-database-url:latest \
            --set-env-vars="^@^NODE_ENV=production@PUBLIC_BASE_URL=${{ vars.API_PUBLIC_BASE_URL }}@CORS_ORIGINS=${{ vars.API_CORS_ORIGINS }}@CORS_PREVIEW_ORIGIN_PATTERN=${{ vars.API_CORS_PREVIEW_ORIGIN_PATTERN }}@GOOGLE_CLOUD_PROJECT=${{ vars.GCP_PROJECT_ID }}"

      - name: Smoke test the new revision
        run: |
          url=$(gcloud run services describe "$SERVICE" --project="${{ vars.GCP_PROJECT_ID }}" --region="$REGION" --format='value(status.url)')
          curl -fsS --retry 5 --retry-all-errors --retry-delay 2 "$url/v1/ready"
          curl -fsS "$url/v1/profile" > /dev/null
          curl -fsS "$url/v1/openapi.json" > /dev/null
```

Run: `npx --yes @action-validator/cli .github/workflows/deploy-api.yml`
Expected: exit 0.

- [ ] **Step 2: Write the one-time setup runbook**

`docs/api-gcp-setup.md`:

````markdown
# API — one-time GCP, Neon and GitHub setup

Run once, by the owner, from a shell with `gcloud` and `gh` authenticated. Nothing here creates a
service-account key: GitHub Actions authenticates through Workload Identity Federation, restricted
to this repository's `main` branch.

## 0. Choose

```bash
PROJECT_ID=<your-gcp-project-id>
REGION=europe-west1          # pair with a nearby Neon region, e.g. AWS eu-central-1
REPO=JxstWieslaw/portfolio
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
```

## 1. APIs and the image registry

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  --project="$PROJECT_ID"
gcloud artifacts repositories create portfolio --repository-format=docker \
  --location="$REGION" --project="$PROJECT_ID"
```

## 2. Service accounts

```bash
gcloud iam service-accounts create portfolio-api-runtime --project="$PROJECT_ID" \
  --display-name="Portfolio API (Cloud Run runtime)"
gcloud iam service-accounts create portfolio-api-deployer --project="$PROJECT_ID" \
  --display-name="Portfolio API (GitHub deployer)"
RUNTIME_SA=portfolio-api-runtime@$PROJECT_ID.iam.gserviceaccount.com
DEPLOY_SA=portfolio-api-deployer@$PROJECT_ID.iam.gserviceaccount.com

gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$DEPLOY_SA" --role=roles/run.admin
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$DEPLOY_SA" --role=roles/artifactregistry.writer
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" --project="$PROJECT_ID" \
  --member="serviceAccount:$DEPLOY_SA" --role=roles/iam.serviceAccountUser
```

## 3. The database URL, in Secret Manager only

Create the Neon project (Postgres 17, a region near `$REGION`), then copy the **pooled** connection
string for the `main` branch.

```bash
printf '%s' '<neon-pooled-connection-string>' | \
  gcloud secrets create api-database-url --data-file=- --project="$PROJECT_ID"
for SA in "$RUNTIME_SA" "$DEPLOY_SA"; do
  gcloud secrets add-iam-policy-binding api-database-url --project="$PROJECT_ID" \
    --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor
done
```

## 4. Workload Identity Federation for GitHub Actions

```bash
gcloud iam workload-identity-pools create github --project="$PROJECT_ID" --location=global \
  --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers create-oidc portfolio --project="$PROJECT_ID" \
  --location=global --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository=='$REPO' && assertion.ref=='refs/heads/main'"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" --project="$PROJECT_ID" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"
```

## 5. GitHub repository settings

```bash
gh variable set GCP_PROJECT_ID --body "$PROJECT_ID"
gh variable set GCP_REGION --body "$REGION"
gh variable set GCP_WIF_PROVIDER --body "projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/portfolio"
gh variable set GCP_DEPLOY_SA --body "$DEPLOY_SA"
gh variable set GCP_RUNTIME_SA --body "$RUNTIME_SA"
gh variable set API_PUBLIC_BASE_URL --body "https://api.<domain>"      # the run.app URL until the domain exists
gh variable set API_CORS_ORIGINS --body "https://<domain>"
gh variable set API_CORS_PREVIEW_ORIGIN_PATTERN --body '^https://portfolio-[a-z0-9-]+-jxstwieslaw\.vercel\.app$'
# Neon branch per PR (optional; enables the api-neon-branch CI job)
gh variable set NEON_PROJECT_ID --body "<neon-project-id>"
gh secret set NEON_API_KEY
```

Create a GitHub environment named `production` (Settings → Environments); add required reviewers
there if deploys should wait for approval.

## 6. First deploy

`gh workflow run "Deploy API"`, then `gh run watch`. The smoke step prints `/v1/ready`.

## Domain (when chosen)

`gcloud beta run domain-mappings create --service=portfolio-api --domain=api.<domain> --region="$REGION"`,
add the DNS records it prints, then update `API_PUBLIC_BASE_URL`.
````

- [ ] **Step 3: Record the M1 close-out and point the README at it**

`docs/m1-status.md`:

```markdown
# M1 — API service status

**Branch:** `feat/m1-api-service` · **Plan:** `docs/superpowers/plans/2026-09-17-m1-api-service.md`

## Delivered

| Spec item (main spec §8, M1) | Where |
|---|---|
| NestJS scaffold | `apps/api` — NestJS 11, tsup/SWC bundle, Zod-validated config |
| Drizzle + reversible migration CLI | `apps/api/migrations`, `pnpm --filter @repo/api db:migrate --verify / --status / --dry-run / --apply / --rollback n --yes` |
| Content seed from git | `pnpm --filter @repo/api db:seed --dry-run / --apply / --check`, history in `seed_runs` |
| Public read endpoints | `/v1/profile`, `/v1/domains`, `/v1/projects`, `/v1/projects/:slug`, `/v1/experience`, `/v1/skills` |
| OpenAPI + Swagger published | `/v1/openapi.json`, `/docs`, snapshot in `apps/api/openapi.snapshot.json` |
| Health / readiness | `/v1/health` (no dependencies), `/v1/ready` (Postgres) |
| Cloud Run via Workload Identity Federation | `.github/workflows/deploy-api.yml`, `docs/api-gcp-setup.md` |

## Verified

Fill each row with the measured value when closing the milestone — do not copy expectations.

| Check | Result |
|---|---|
| `pnpm --filter @repo/api test` (unit) | |
| `pnpm --filter @repo/api test:integration` | |
| `pnpm --filter @repo/web test` (unchanged by M1) | |
| Image size (budget 200 MB) | |
| Container ready time, local (budget 2 s) | |
| CI: verify · budgets · e2e · api-integration · api-image | |
| Live deploy smoke test | Blocked until the GCP project exists (owner input) |

## Deliberate refinements

See the plan's "Deliberate refinements of the spec": NestJS 11 not 12 · own Zod pipe instead of
`nestjs-zod` · seed as a CI CLI, not `/internal/content/seed` · tables scoped to existing content ·
readiness checks Postgres only · writing/lab/stats/manifest endpoints ship with M3/M4 · Neon
branch per PR gated on the Neon project · tracing deferred to M3.

## Owner inputs still open

GCP project + billing · Neon project · API domain.
```

In the repo-root `README.md`, add under the existing documentation links (keep the file's existing style — one bullet or table row, matching its neighbours):

```markdown
- API service (M1): [`docs/m1-status.md`](docs/m1-status.md) · one-time cloud setup: [`docs/api-gcp-setup.md`](docs/api-gcp-setup.md)
```

- [ ] **Step 4: First live deploy (only once the owner inputs exist)**

After the owner completes `docs/api-gcp-setup.md`:

Run: `gh workflow run "Deploy API" && gh run watch`
Expected: every step green; the smoke step prints `{"status":"ready","checks":{"postgres":"ok"}}`. Then open `<service-url>/docs` in a browser and confirm the Swagger UI lists 8 operations. Record the result in `docs/m1-status.md`.

- [ ] **Step 5: Fill in the verified results and commit**

Run the checks listed in `docs/m1-status.md` → *Verified*, write the actual measured values into the table, then:

```bash
git add .github/workflows/deploy-api.yml docs/api-gcp-setup.md docs/m1-status.md README.md
git commit -m "ci(api): keyless Cloud Run deploy workflow, GCP setup runbook and M1 status

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review record

- **Spec coverage (M1 row):** scaffold → Tasks 2–3 · Neon → Tasks 4, 12, 13 · Drizzle + reversible migration CLI → Tasks 4–6 · content seed from git → Task 7 · public reads → Tasks 8–9 · OpenAPI + Swagger → Task 10 · Cloud Run via WIF → Tasks 11, 13 · health/readiness → Tasks 2, 8. Cross-cutting §5 rows in M1 scope (validation, errors, logging, request ID, CORS, headers, caching, secrets, shutdown, config) → Tasks 2–4. Rate limiting, idempotency and abuse scoring belong to the first public write (M3); tracing to M3 (refinement 8).
- **Testing (spec §10):** unit (Vitest) · integration against real Postgres (Testcontainers / CI service / Neon branch) · contract (OpenAPI snapshot + contracts typechecked by both apps) · e2e (Supertest: 304s, CORS rejection, Problem Details shape). Auth-guard, rate-limit and idempotency e2e cases arrive with those features. Load (k6) is an M5 pre-launch item.
