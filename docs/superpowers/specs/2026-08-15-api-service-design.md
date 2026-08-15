# API Service — Architecture & Design Specification

| | |
|---|---|
| **Service** | `apps/api` — the portfolio's backend service |
| **Date** | 2026-08-15 |
| **Status** | Approved design, pre-implementation |
| **Parent spec** | [`2026-08-15-portfolio-website-design.md`](2026-08-15-portfolio-website-design.md) |
| **Stack** | NestJS · TypeScript · Drizzle · Neon Postgres · Google Cloud Run · GCS · Cloud Tasks · Firebase Auth |

---

## 1. Why this service exists

A portfolio backend is thin by default. Separating one out is only worth doing if it owns work the frontend genuinely cannot — otherwise it is an empty service, and an empty service reads as cargo-culting to exactly the audience this site is built to impress.

So this service is scoped around **four real jobs**, plus one deliberate side-effect:

1. **Lead pipeline** — inbound consulting enquiries: validated, deduplicated, spam-scored, persisted, emailed, and workable through an inbox with status.
2. **First-party, cookieless analytics** — which case studies get read, how far, from where. Genuinely useful to someone selling consulting, and impossible to answer from a static site.
3. **3D asset registry, negotiation and transcoding** — the backend that makes the WebGL specialism operational: one uploaded GLB fans out into tier-specific LODs, KTX2 textures, Meshopt compression, a USDZ for iOS AR, and a render poster.
4. **Writing feed cache** — Medium RSS fetched and cached server-side rather than at build time.

**The side-effect that matters:** NestJS + `@nestjs/swagger` publishes an OpenAPI surface at `api.<domain>/docs`. Linked from the site, that turns invisible infrastructure into a **visible portfolio artifact** — a documented, versioned, ETagged public API is a stronger credential than a paragraph claiming backend competence.

### 1.1 What this service does NOT own
| Not owned | Owner | Why |
|---|---|---|
| Page rendering, routing, SEO, OG images | `apps/web` | Latency; static generation wins |
| Content authorship | Git (`content/*.mdx`) | Content ships through PRs and code review |
| Visitor identity / sessions | Nobody — there are none | No visitor auth exists by design |
| Poster and image delivery for the site shell | Vercel CDN | Colocated with the pages that use them |

**The load-bearing constraint:** content is git-first. A cold visitor's page render **never** touches this API. The API serves content publicly (seeded from git in CI) for its own read API, the admin surface and third parties — but `apps/web` builds statically from `content/` directly. That single decision is what lets Cloud Run run at `min-instances=0` without ever putting a cold start in front of a human being.

---

## 2. Service topology

```
                         ┌──────────────────────────────────────┐
  Visitor ──────────────►│  apps/web  (Vercel, SSG/ISR)         │
                         │  content baked from git at build     │
                         └───────────────┬──────────────────────┘
                                         │  post-hydration only
                    ┌────────────────────┼────────────────────┐
                    │ POST /v1/contact   │ POST /v1/events    │ GET /v1/assets/manifest
                    ▼                    ▼                    ▼
                         ┌──────────────────────────────────────┐
                         │  apps/api  (Cloud Run, NestJS)       │
                         │  min 0 · max 10 · 512Mi · conc 80    │
                         └──┬────────┬─────────┬────────┬───────┘
                            │        │         │        │
                   Neon Postgres    GCS    Cloud Tasks  Resend
                     (pooled)    (assets)      │
                                               ▼
                         ┌──────────────────────────────────────┐
                         │  transcoder (Cloud Run, min 0)       │
                         │  gltf-transform · toktx · usd tools  │
                         │  2 vCPU · 2Gi · timeout 900s         │
                         └──────────────────────────────────────┘

  CI (GitHub Actions, Workload Identity Federation — no service-account keys)
    content/*.mdx ──► seed (dry-run → apply) ──► Neon
    docker build  ──► Artifact Registry ──► Cloud Run deploy
```

Two Cloud Run services, not one: transcoding needs 2 vCPU, 2 Gi and a 15-minute timeout, while the API needs 512 Mi and sub-second responses. Sharing a container would force the API to carry the transcoder's memory floor and its ~400 MB of native tooling on every cold start.

---

## 3. API surface

Versioned under `/v1`. Deprecations announced with `Deprecation` and `Sunset` headers one minor release before removal.

### 3.1 Public reads — cached, unauthenticated
```
GET  /v1/health                          liveness (no dependencies touched)
GET  /v1/ready                           readiness (Postgres + GCS reachable)
GET  /v1/openapi.json                    machine-readable contract
GET  /docs                               Swagger UI — public, linked from the site

GET  /v1/profile
GET  /v1/domains
GET  /v1/projects?domain=&featured=&limit=&cursor=
GET  /v1/projects/:slug
GET  /v1/projects/:slug/stats            public view count (rolled up, cached 5m)
GET  /v1/experience
GET  /v1/skills
GET  /v1/lab
GET  /v1/writing                         cached Medium feed
GET  /v1/assets/manifest?tier=1|2|3&caps=ktx2,meshopt,avif
```
All reads send `ETag` + `Cache-Control: public, s-maxage=300, stale-while-revalidate=86400` and honour `If-None-Match` with `304`.

### 3.2 Public writes — rate-limited, abuse-scored
```
POST /v1/contact                         Idempotency-Key header required
POST /v1/events                          batched beacon, ≤ 20 events per call
```

### 3.3 Admin — Firebase ID token; UID must exist in the `admins` table
```
GET    /v1/admin/leads?status=&cursor=
GET    /v1/admin/leads/:id
PATCH  /v1/admin/leads/:id               { status, note }
GET    /v1/admin/analytics/summary?from=&to=
GET    /v1/admin/analytics/projects
GET    /v1/admin/assets
POST   /v1/admin/assets                  → signed GCS upload URL
POST   /v1/admin/assets/:id/transcode    enqueue Cloud Tasks jobs
DELETE /v1/admin/assets/:id
```

### 3.4 Internal — OIDC, caller identity verified, never publicly routable
```
POST /internal/transcode                 Cloud Tasks → transcoder worker
POST /internal/rollup                    Cloud Scheduler → nightly analytics rollup
POST /internal/writing/refresh           Cloud Scheduler → re-fetch Medium feed
POST /internal/content/seed              CI → upsert content from git payload
```

### 3.5 Error format
Every error is RFC 9457 `application/problem+json`, emitted by one global exception filter:
```json
{ "type": "https://api.example.dev/problems/validation-failed",
  "title": "Validation failed", "status": 422,
  "detail": "message must be at least 20 characters",
  "instance": "/v1/contact", "requestId": "01J...", "errors": [] }
```

---

## 4. Data model (Postgres, Drizzle)

**Content tables** — seeded from git, read-mostly, never written at runtime: `domains` · `projects` · `project_decisions` · `project_outcomes` · `project_media` · `project_skills` (join) · `experiences` · `skill_groups` · `skills` · `lab_experiments` · `profile` (singleton). Each row carries `content_hash` and `seeded_at`, so a seed run is idempotent and drift is detectable.

**Owned tables** — the service's actual state:

| Table | Shape | Notes |
|---|---|---|
| `leads` | id, name, email, message, source_path, referrer_host, spam_score, status, idempotency_key **unique**, created_at, replied_at | status ∈ new / read / replied / spam / archived |
| `lead_notes` | id, lead_id, body, created_at | working notes on an enquiry |
| `events` | id, occurred_at, session_id, kind, path, project_slug, section_id, duration_ms, gpu_tier, viewport_w, referrer_host, country | **partitioned monthly**; no PII, no IP stored |
| `event_rollup_daily` | day, kind, project_slug, path, count, avg_duration_ms | composite PK; nightly job; admin reads hit this, never `events` |
| `assets` | id, kind, name, license, author, source_url, created_at | licence recorded at upload — feeds the site colophon |
| `asset_variants` | id, asset_id, format, tier, bytes, width, height, tri_count, gcs_object, checksum, status | one row per delivered file |
| `transcode_jobs` | id, asset_id, target_format, status, attempts, error, enqueued_at, completed_at | retries and failures visible |
| `writing_cache` | id, url **unique**, title, published_at, source, excerpt, fetched_at | |
| `rate_limits` | key, window_start, count | Postgres-backed; no Redis dependency |
| `admins` | uid (Firebase), email, role, created_at | identity lives in Firebase; authorisation lives here |
| `audit_log` | id, actor, action, entity, entity_id, diff jsonb, at | every admin mutation |
| `seed_runs` | id, git_sha, content_hash, applied_at, dry_run, result jsonb | content deploy history |

`events` is partitioned by month with a 13-month retention job — a portfolio should not accumulate unbounded rows, and dropping a partition is far cheaper than `DELETE`.

---

## 5. Cross-cutting design

| Concern | Implementation |
|---|---|
| **Validation** | `nestjs-zod` — DTOs generated from `packages/contracts` Zod schemas, so runtime validation and the OpenAPI schema come from **one** definition that the frontend also imports |
| **Errors** | Global filter → RFC 9457 Problem Details; no stack traces past the boundary |
| **Logging** | `nestjs-pino` structured JSON; Cloud Logging parses `severity` and `trace` natively, so logs correlate with traces without running a shipper |
| **Tracing** | OpenTelemetry → Cloud Trace + Sentry; W3C `traceparent` propagated web → API → worker |
| **Request ID** | ULID per request, echoed in `X-Request-Id`, present on every log line and in every error body |
| **Rate limiting** | `@nestjs/throttler` over the Postgres `rate_limits` table (shared across Cloud Run instances, nothing extra to operate); `/v1/contact` 5 per 10 min per IP hash, `/v1/events` 60 per min |
| **Abuse** | Honeypot field, submission-timing check, spam score (link count, entropy, disposable-domain list); optional Firebase App Check attestation on public POSTs |
| **Idempotency** | `Idempotency-Key` on `POST /v1/contact`; unique index; a replay returns the original response verbatim |
| **Caching** | ETag + `s-maxage` on all reads; 304 handling; nothing user-specific is ever cacheable |
| **CORS** | Strict origin allowlist (production web origin, preview deploys by regex, localhost in dev); credentials off |
| **Headers** | `helmet`, HSTS, `X-Content-Type-Options`, no `X-Powered-By` |
| **Secrets** | Secret Manager, mounted as env at deploy; **no** service-account JSON anywhere — CI authenticates via Workload Identity Federation |
| **Shutdown** | SIGTERM → stop accepting, drain in-flight, close the pool — Cloud Run allows 10 s |
| **Config** | Zod-validated env at boot; the process refuses to start on bad config rather than failing at the first request |

---

## 6. Migrations — reversible by policy

The README this site supports claims *"reversible data migrations — dry-run, apply and rollback."* This service is where that has to be literally true.

`pnpm db:migrate` wraps Drizzle Kit:

| Command | Behaviour |
|---|---|
| `--dry-run` | Prints the exact SQL and flags statements that take `ACCESS EXCLUSIVE` locks |
| `--apply` | Runs inside a transaction, records `schema_migrations` with a checksum |
| `--rollback <n>` | Applies the paired `down.sql` for the last *n* migrations |
| `--status` | Applied vs. pending, with checksum drift detection |

**Enforced in CI:** every migration ships a `down.sql` or the build fails. Destructive changes follow expand/contract across releases — add column → backfill → switch reads → drop in a *later* release, never in one step.

**Neon branch per PR:** CI creates a database branch from production, runs migrations and the integration suite against the real data shape, then deletes the branch on merge. Migration bugs surface in review rather than in production.

---

## 7. Asset pipeline

This is where the backend earns its place beside the WebGL positioning.

1. Admin requests an upload → API returns a **signed GCS URL**; the browser uploads directly to storage and the API never proxies file bytes.
2. API writes `assets` + `asset_variants(status=pending)` and enqueues **Cloud Tasks** jobs.
3. The **transcoder** Cloud Run service pulls the object and produces:
   - Meshopt-compressed GLB, plus decimated LODs for tier 1 / 2 / 3
   - KTX2 (Basis) textures via `toktx`
   - **USDZ** for iOS Quick Look AR — the only AR path on Safari
   - A headless render poster PNG, reused as the no-WebGL fallback and OG background
4. Variants land in GCS behind a CDN; rows flip to `ready` with byte size and triangle count recorded.
5. `GET /v1/assets/manifest?tier=2&caps=ktx2,meshopt` returns exactly the right URLs for the caller's detected GPU tier and codec support.
6. `apps/web` calls the manifest **once, after hydration** — never in the render path — and falls back to a committed default manifest if the API is unreachable.

Failed jobs retry with backoff (native to Cloud Tasks), surface in the admin UI with their error, and never block the asset's other variants.

---

## 8. Authentication

**Firebase Auth owns identity; Postgres owns authorisation.** The admin signs in with Firebase (email/password + TOTP MFA); the web app sends the ID token as `Authorization: Bearer`; a NestJS guard verifies it with the Firebase Admin SDK, then checks the UID against the `admins` table.

A hand-rolled JWT scheme with refresh rotation was considered and rejected: for a single-operator admin surface, rolling your own auth is more code, more risk, and a *worse* signal than visibly choosing a managed identity provider — and Firebase Admin is already in this stack (`learnx`).

There is **no visitor authentication**. Nothing on the public site has a login.

---

## 9. Deployment & environments

| Piece | Choice |
|---|---|
| Images | Artifact Registry; distroless Node base; multi-stage build; ≤ 200 MB |
| CI/CD | GitHub Actions → **Workload Identity Federation** (keyless; no long-lived credentials in secrets) |
| API service | Cloud Run: min 0, max 10, 1 vCPU, 512 Mi, concurrency 80, 30 s timeout |
| Transcoder | Cloud Run: min 0, max 3, 2 vCPU, 2 Gi, 900 s timeout, ingress internal-only |
| Database | Neon Postgres — pooled endpoint, scale-to-zero, branch per PR |
| Storage | GCS bucket, uniform bucket-level access, lifecycle rule on orphaned uploads |
| Queue | Cloud Tasks (managed retry + backoff, no broker to operate) |
| Cron | Cloud Scheduler → `/internal/rollup`, `/internal/writing/refresh` |
| Secrets | Secret Manager |
| Domain | `api.<domain>` via Cloud Run domain mapping |
| Environments | `production` and `preview` (preview API + Neon branch per PR) |

**Cold starts are acceptable here by design.** `min-instances=0` costs nothing at idle, and the only callers of a cold API are a contact submit (which shows a pending state anyway), a fire-and-forget analytics beacon, and a post-hydration asset manifest. No human ever waits on a cold container to see a page. If the admin surface feels sluggish, `min-instances=1` is a ~$6/month switch, not a re-architecture.

---

## 10. Testing

| Layer | Approach |
|---|---|
| Unit | Vitest; services against in-memory repository fakes |
| Integration | **Real Postgres** — Testcontainers locally, ephemeral Neon branch in CI; migrations run first, so the schema under test is the schema that ships |
| Contract | Generated OpenAPI is snapshot-committed, so any breaking change appears as a diff in the PR; `packages/contracts` is typechecked by *both* apps, so a broken contract fails `apps/web`'s build |
| E2E | Supertest against a booted app: auth guards, rate limits, idempotency replay, 304s, CORS rejection, Problem Details shape |
| Load | k6 smoke on `/v1/contact` and `/v1/events` before launch |
| Security | `npm audit`, Trivy image scan, secret scanning, CORS/authz negative tests in CI |

---

## 11. Budgets

| Metric | Budget |
|---|---|
| p95 latency, cached GET | ≤ 80 ms |
| p95 latency, `POST /v1/contact` | ≤ 400 ms (excluding cold start) |
| Cold start | ≤ 2 s |
| Container image | ≤ 200 MB |
| Error rate | < 0.5% of non-4xx responses |
| Monthly cost at portfolio traffic | ≤ $10 (Cloud Run idle $0 + Neon launch tier + GCS pennies) |

---

## 12. Failure modes — the site must never depend on this service

| Failure | Behaviour |
|---|---|
| API unreachable | Site fully functional. Content is static; the contact form degrades to a `mailto:` link; the analytics beacon fails silently; the asset manifest uses the committed default |
| Database down | `/v1/ready` fails and Cloud Run stops routing; reads continue from CDN cache for up to 24 h via `stale-while-revalidate` |
| Resend down | The lead is still persisted and visible in the inbox; a retry job re-sends; the visitor still sees success, because the message genuinely *was* received |
| Transcode fails | Other variants still serve; the site falls back to a lower tier or the poster; the job shows its error in admin |
| Cloud Tasks backlog | Uploads still succeed; variants appear late; nothing user-facing breaks |
| Seed run drift | `seed_runs` records the mismatch; the content API serves last-good; CI fails loudly |

---

## 13. Decision log

| Decision | Chosen | Rejected | Reason |
|---|---|---|---|
| Backend scope | Dynamic state only; content git-first | Content in Postgres | Keeps the API out of the render path, preserving LCP ≤ 2.0 s; content still ships through code review |
| Framework | NestJS | Fastify+Zod · Hono · Express | Modules/DI/guards read as deliberate architecture, and `@nestjs/swagger` makes the API a *publishable* artifact |
| Repo | Turborepo monorepo, two deployables | Two repos | Shared Zod contracts fail the web typecheck on a breaking change, in CI, before anything ships |
| Host | Cloud Run + Neon | Render · Fly · Railway · Cloud SQL | Genuinely separate platform from Vercel; scale-to-zero; Neon adds branch-per-PR that Cloud SQL cannot |
| Auth | Firebase Auth + `admins` table | Hand-rolled JWT rotation | Choosing managed identity is both the better engineering call and the better signal than rolling auth |
| Firestore | Not used | Firestore alongside Postgres | Two databases for one small service is indecision, not architecture |
| Rate-limit store | Postgres | Redis / Upstash | One fewer runtime dependency at this volume; revisit above ~50 rps |
| Queue | Cloud Tasks | BullMQ + Redis | Managed retry/backoff with nothing to operate |
| Analytics | First-party, cookieless, no IP stored | GA4 / third-party | Privacy is a values signal on a site selling judgement — and there is no cookie banner to design |
| Transcoder | Separate Cloud Run service | Same container as the API | 2 Gi plus ~400 MB of native tooling would ride on every API cold start |
| CI auth | Workload Identity Federation | Service-account JSON in secrets | No long-lived credentials to leak or rotate |
