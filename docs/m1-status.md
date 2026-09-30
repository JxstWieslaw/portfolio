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

| Check | Result |
|---|---|
| `pnpm --filter @repo/api test` (unit) | 78 passed (14 files) |
| `pnpm --filter @repo/api test:integration` | 44 passed (7 files) |
| `pnpm --filter @repo/web test` (unchanged by M1) | 584 passed |
| Image size (budget 200 MB) | 59.5 MB compressed (docker save \| gzip) · ~204 MB unpacked (docker history sum) |
| Container ready time, local (budget 2 s) | 112 ms measured locally at Task 11 (container already pulled; not a cold Cloud Run start) |
| CI: verify · budgets · e2e · api-integration · api-image | Not run — branch not pushed (controller ruling); workflows validated statically with @action-validator |
| Live deploy smoke test | Blocked — owner inputs (GCP project + billing, Neon project) do not exist yet |

The plan's ≤200 MB budget is applied to the compressed size; the unpacked figure exceeds it by ~2% and is flagged for the owner's decision.

## Deliberate refinements

See the plan's "Deliberate refinements of the spec": NestJS 11 not 12 · own Zod pipe instead of
`nestjs-zod` · seed as a CI CLI, not `/internal/content/seed` · tables scoped to existing content ·
readiness checks Postgres only · writing/lab/stats/manifest endpoints ship with M3/M4 · Neon
branch per PR gated on the Neon project · tracing deferred to M3.

## Owner inputs still open

GCP project + billing � API domain.

The Neon project now exists: id `holy-star-27595330`, org Code Villa, `aws-eu-central-1`, Postgres 17, default
branch `main`, database `portfolio`. Still to do by the owner: store its pooled and direct connection strings in
Secret Manager (`docs/api-gcp-setup.md` section 3), set the `NEON_PROJECT_ID` variable and `NEON_API_KEY` secret to
switch on the per-PR branch job. Connection strings are never committed or written in docs.

## Closed before the first deploy

| Item | Resolution |
|---|---|
| No Cloud Run health probe | `deploy-api.yml` passes `--startup-probe` on `/v1/health` and `--liveness-probe` on `/v1/ready`. `gcloud run deploy` supports both natively (checked against gcloud 574.0.0 `--help`), so no service YAML was needed. |
| Floating base-image tags | Both `FROM` lines in `apps/api/Dockerfile` are pinned by index digest. Trivy (`api-image`) and the deploy build the same file, so the scanned base is the shipped base. Dependabot (`.github/dependabot.yml`) opens the PRs that move the pins. |
| Actions pinned by tag | Every action in `ci.yml`, `deploy-api.yml` and `neon-branch-cleanup.yml` (all hold `NEON_API_KEY` or `id-token: write`) is pinned to a commit SHA with the version as a trailing comment. |
| `DB_POOL_MAX` unset | `DB_POOL_MAX=3` at deploy: 3 x `--max-instances=10` = 30 connections at most, against a free-tier compute floor of about 112 `max_connections`. The runtime URL is the pooled one. |
| `candidate` tag stays public | Promotion runs `update-traffic --to-latest --remove-tags=candidate`. |
| First-deploy `--no-traffic` ignored | Documented in `docs/api-gcp-setup.md` section 6, with the compensating startup probe and the safe order of operations. |
| Seed ordering | Decided below; comment added at the seed step. |

### Seed ordering: decision

Options were seed after promotion, or apply expand/contract to content contract changes and keep seeding first.
The reader parses every row through the shared Zod contract on the way out, so a mismatch breaks whichever
revision meets content it does not understand:

- Seed before promotion (current): content in the new shape can make the still-serving old revision return 500 on
  the affected routes until promotion, typically under a minute.
- Seed after promotion: the candidate runs against old content first, so its own smoke check on `/v1/profile` can
  fail and abort the deploy before the seed ever runs, so a contract-changing release can never ship. If the
  smoke check does pass, users hit 500s on the new revision instead.

Seed-after-promotion only swaps which revision breaks and adds a deadlock, so the smaller safe option is to keep
the order and make the rule explicit. Content contract changes follow expand/contract, like migrations: release N
widens the contract to accept both the old and new shape and ships the new content; release N+1 tightens it.
Additive changes (new optional fields, new entries) need no ceremony. A contract PR shows up as an
`openapi.snapshot.json` diff, which is the trigger for applying the rule. No pipeline change was needed beyond a
comment; the residual risk is a reviewer missing a breaking contract change, and it is limited to a short window
on a public read API with no consumers yet.

## Still open

- Liveness on `/v1/ready` restarts an instance during a sustained database outage. A restart does not fix Postgres,
  and Cloud Run has no notion of "stop routing but keep the process", so the outage still surfaces as errors. The
  spec �12 wording ("Cloud Run stops routing") is closer to a readiness probe; `gcloud run deploy` also lists
  `--readiness-probe`, but its availability for services was not confirmed offline. Decide after the first deploy
  whether to add it.
- The Dockerfile digests were resolved from registry metadata (`docker buildx imagetools inspect`), but the
  image was not rebuilt locally because the Docker daemon was not running. CI's `api-image` job is the first real
  build with the pins.
- `DB_POOL_MAX=3` and the Neon connection limit are reasoned from published limits, not measured; revisit with
  real load.
