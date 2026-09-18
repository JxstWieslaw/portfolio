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

GCP project + billing · Neon project · API domain.

## Open before the first deploy

- No Cloud Run health probe is configured, so the spec §12 promise ("database down → /v1/ready fails and Cloud Run stops routing") is not in effect; add `--liveness-probe` on `/v1/ready` and `--startup-probe` on `/v1/health` to the deploy step, or move to a declarative service YAML.
- Base images in `apps/api/Dockerfile` use floating tags, so the image CI scans with Trivy can differ from the one the deploy workflow builds; pin both by digest.
- Third-party actions are pinned by tag rather than commit SHA in workflows holding `secrets.NEON_API_KEY` and `id-token: write`.
- The deploy seeds content before promoting the candidate revision, so content that only the new contract accepts can make the still-serving old revision 500 on that route; decide whether to seed after promotion or apply expand/contract to contract changes too.
- On a service's very first deploy, gcloud ignores `--no-traffic`, so revision one serves before it is smoke-tested.
- The `candidate` tag stays publicly resolvable after promotion; add `--remove-tags=candidate` to the promotion step when convenient.
- `DB_POOL_MAX` is not set at deploy: the default 5 × `--max-instances=10` allows up to 50 Neon connections; set it explicitly.
