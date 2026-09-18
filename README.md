# Portfolio — Wieslaw Samushonga

Personal portfolio and résumé site. **Milestone M0 is built and merged**: a complete,
accessible, indexable site — nine sections, real content, designed fallbacks — deliberately
shipped before any WebGL or backend exists, so both are additive risk rather than blocking risk.

## What exists today

A single Next.js app in a pnpm + Turborepo workspace.

| Package | What |
|---|---|
| `apps/web` | Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind v4 |
| `packages/contracts` | Zod schemas defining the content model — the canonical definition a future API service will derive its DTOs from |
| `packages/config` | Shared `tsconfig` and flat ESLint config |
| `content/` | The site's content as JSON, validated at build |

The animated backdrop is a **2D canvas** particle field, not a renderer — there is no `three`,
no React Three Fiber and no physics engine installed. The WebGL layer arrives in M2.

## Verified state

| Check | Result |
|---|---|
| Unit tests (Vitest) | 584 web + 7 contracts |
| E2E, a11y, visual (Playwright, 5 browser projects) | 60 passed · 20 skipped · 0 failed |
| axe — WCAG 2.0/2.1 A and AA | **0 serious, 0 critical** |
| Initial JS, gzipped | 119.19 kB against a 120 kB budget |
| Lighthouse a11y / best-practices / SEO | 1.00 / 0.96 / 1.00 |
| CLS | 0.024 against a 0.05 budget |

**One budget is not met and is deliberately visible:** LCP measures 2527–2698 ms against a
≤ 2000 ms target. Those two Lighthouse assertions are `warn` rather than `error` so the pipeline
reports honestly instead of being permanently red — the thresholds themselves are unchanged.
[`docs/m0-lcp-investigation.md`](docs/m0-lcp-investigation.md) has the full analysis, including
the controlled experiment that ruled out the backdrop canvases as the cause.

## Running it

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm test         # unit
pnpm build
pnpm lint:content # reports which content is still placeholder copy
```

Requires Node ≥ 22.11 and pnpm ≥ 9.

## Principles this codebase holds to

- **Content is git-first.** `apps/web/lib/content.ts` is the only module that reads `content/`;
  every component consumes its getters. A later milestone can swap the storage behind that seam
  without touching a component.
- **Nothing renders empty.** Every slot carries real copy, placeholder copy, or a designed
  fallback. The page renders in full with JavaScript disabled.
- **Nothing is claimed that is not true.** Testimonials hide rather than being fabricated,
  counters with no engine behind them render `—`, the contact form never reports success for a
  message it did not send, and unverified content is flagged and reported by `lint:content`.

## Documents

| Doc | Purpose |
|---|---|
| [`docs/m0-status.md`](docs/m0-status.md) | M0 close-out: verified state, remaining placeholders, open gaps |
| [`docs/m0-lcp-investigation.md`](docs/m0-lcp-investigation.md) | Why LCP misses its budget, and what was ruled out |
| [`docs/superpowers/specs/2026-08-15-portfolio-website-design.md`](docs/superpowers/specs/2026-08-15-portfolio-website-design.md) | System architecture and design spec |
| [`docs/superpowers/specs/2026-08-15-api-service-design.md`](docs/superpowers/specs/2026-08-15-api-service-design.md) | Planned backend service — not yet built |
| [`docs/next-16-upgrade-notes.md`](docs/next-16-upgrade-notes.md) | Toolchain breakages to expect when upgrading off Next 15 |
| [`docs/3d-asset-sourcing.md`](docs/3d-asset-sourcing.md) | 3D asset sources, requirements and pipeline, for M2 |
| [`docs/m1-status.md`](docs/m1-status.md) | M1 close-out: API service delivered, verified state, owner inputs still open. One-time cloud setup: [`docs/api-gcp-setup.md`](docs/api-gcp-setup.md) |

## Roadmap

`M0` foundations ✅ → `M1` API service (NestJS on Cloud Run + Neon Postgres) → `M2` "The
Assembly" WebGL layer → `M3` case studies and dynamic content → `M4` admin and asset pipeline →
`M5` polish and launch.
