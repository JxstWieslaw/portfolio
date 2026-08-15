# Portfolio — Wieslaw Samushonga

Personal portfolio / resume site. **Two independently deployed applications in one Turborepo:**

| App | Stack | Deploys to |
|---|---|---|
| `apps/web` | Next.js · TypeScript · React Three Fiber · Tailwind v4 | Vercel |
| `apps/api` | NestJS · Drizzle · Neon Postgres | Google Cloud Run |
| `apps/transcoder` | gltf-transform · toktx · USD tooling | Google Cloud Run (internal) |

Signature: a persistent, scroll-driven WebGL layer ("The Assembly") behind an accessible, indexable HTML document. The backend owns leads, first-party cookieless analytics, the 3D asset transcoding pipeline and a writing cache — and publishes its own OpenAPI docs at `api.<domain>/docs`.

**The load-bearing constraint:** content is git-first, so a cold visitor's page render never touches the API. The site stays fully functional with the backend offline, and Cloud Run idles at zero.

**Status:** design approved, pre-implementation (2026-08-15).

## Documents
| Doc | Purpose |
|---|---|
| [`docs/superpowers/specs/2026-08-15-portfolio-website-design.md`](docs/superpowers/specs/2026-08-15-portfolio-website-design.md) | System architecture & design spec (source of truth) |
| [`docs/superpowers/specs/2026-08-15-api-service-design.md`](docs/superpowers/specs/2026-08-15-api-service-design.md) | Backend service: API surface, data model, auth, migrations, asset pipeline |
| [`docs/claude-design-brief.md`](docs/claude-design-brief.md) | Self-contained brief to paste into Claude Design for visual design work |
| [`docs/3d-asset-sourcing.md`](docs/3d-asset-sourcing.md) | Where to get 3D assets, requirements, and the integration pipeline |

## Milestones
`M0` foundations (publishable 2D site with 3D posters, no API) → `M1` API service → `M2` The Assembly → `M3` depth & dynamic → `M4` admin & assets → `M5` polish & launch.

M0 ships before a single shader or endpoint exists, so both the 3D work and the backend are additive risk rather than blocking risk.

## Next step
Execute [`docs/superpowers/plans/2026-08-15-m0-foundations.md`](docs/superpowers/plans/2026-08-15-m0-foundations.md) — 19 TDD tasks delivering M0.
