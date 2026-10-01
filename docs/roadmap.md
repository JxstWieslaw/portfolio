# Roadmap — the phases after the 2026-10-01 iteration

**Written:** 2026-10-01 · **For:** Wieslaw (owner, tech lead) and the agents building from it ·
**Companion:** [`docs/superpowers/plans/2026-10-01-coming-soon-areas.md`](superpowers/plans/2026-10-01-coming-soon-areas.md)
(one plan per "Coming soon" area) · the 3D design lives in
[`docs/superpowers/specs/2026-10-01-assembly-journey.md`](superpowers/specs/2026-10-01-assembly-journey.md)
and is not repeated here.

## 1. Where we are

| Done | Evidence |
|---|---|
| M0, the 2D site at `/` | `docs/m0-status.md`; 585 unit tests, axe 0 serious, initial JS under 120 kB |
| M1, NestJS API on Cloud Run + Neon, public read endpoints, OpenAPI snapshot | `docs/m1-status.md`; GCP `jxst-portfolio-api`, Neon `holy-star-27595330` |
| M2 slice, the WebGL Assembly layer (three + R3F, 3 000 instanced cubes, seven formations, scroll morphing, 2D fallback) | PR #12, merged 2026-10-01; `docs/lead/2026-10-01-m2-assembly-3d.md` |
| Typed API client in the web app (`apps/web/lib/api-client.ts`), health/readiness only | PRs #10–#11 |
| In flight today | pnpm → npm workspaces (`chore/npm-workspaces`), the `develop` integration branch, profile and experience progression (`feat/profile-roles-progression`), the Assembly journey spec (`docs/assembly-journey-spec`) |

What is still "Coming soon" in the live site: `/work/[slug]`, `/lab`, `/about`, `/resume`, the
"View perf" link, the writing feed, testimonials, the lead pipeline behind the contact form, and
eight placeholder content items (`npm run lint:content`, exit 0 by design). Each has its own plan in
the companion document.

## 2. The phases, and where this departs from spec §8

Spec §8 ordered the remainder as M2 (Assembly) → M3 (depth and dynamic) → M4 (admin and assets)
→ M5 (polish and launch). Three things about today's state make that order wrong as written:

1. **The 3D is no longer one milestone but a track.** The Assembly already ships; what remains is
   the expressive journey (its own spec, PR-sized slices) plus the performance follow-ups from the
   PR #12 review. Serialising every route behind "M2 complete" would park content work that needs
   no 3D at all. So the journey runs as **Lane B**, in parallel with the content lane, with one
   hard coupling: `/lab` reuses the Assembly system and waits for the journey's tiering work.
2. **M3 splits in two.** Half of M3 (`/work/[slug]`, `/about`, `/resume`, sitemap, OG, JSON-LD) is
   static, git-first content that touches no API and is blocked only on owner inputs. The other
   half (lead pipeline, writing cache, analytics beacon) needs API writes, a web origin for CORS,
   an API domain and secrets. Mixing them means the static routes wait on infrastructure. They
   become **Phase 2a** (depth) and **Phase 2b** (dynamic).
3. **The LCP gap moves forward.** `docs/m0-status.md` §3 shows the driver is page-wide hydration,
   not the canvases, and the deep routes and the journey both add hydration. Closing it after
   M4 (spec §8 says "polish") would mean measuring against a page that has grown twice. The
   `Craft.tsx` client-boundary split is **Phase 1** work, before anything else lands on `/`.

M4's asset pipeline (GCS, Cloud Tasks transcoder, KTX2, USDZ) is kept but demoted: it exists to
serve a modelled artefact, and v1 of the journey is procedural (spec §5.8). It is built only
when an asset exists to push through it (an owner decision, §4).

### Phase 0 — Platform and integration (this iteration, Lane C)

- **Outcome:** `develop` is the integration branch, the monorepo installs with `npm ci`, CI is
  green on every job, and a `develop → main` release PR is open.
- **Why first:** every later PR targets `develop` and installs with npm; a red `main` or a
  half-migrated toolchain would make every other phase's CI failure ambiguous (mission log D2, D3).
- **Exit criteria (verifiable):** `npm ci && npm run typecheck && npm run lint && npm test && npm run build`
  green locally and in CI on `chore/npm-workspaces`; `api-image` (Trivy) and `api-integration` green;
  `.size-limit.json` budgets unchanged (initial JS ≤ 120 kB, lazy three ≤ 260 kB); README and
  `docs/api-gcp-setup.md` say `npm`; `git log main..develop` contains PR #16 and the npm PR.
- **Dependencies:** PR #16 (lockfile fix) merged to `develop` first.
- **Risks:** Dockerfile rebuilt around `turbo prune --docker` + `npm ci --omit=dev` can change the
  image size (200 MB budget, compressed) and the boot check; npm's flat tree can surface
  phantom-dependency breakage hidden by pnpm's strictness.
- **Owner inputs:** merge the release PR to `main` (`auto_main: no`); optionally make `develop`
  the GitHub default branch.
- **Rollback:** revert the npm PR on `develop`; the pnpm lockfile at `05e7218` is known good.
- **Size:** M (one devops PR, one lead release PR).

### Phase 1 — Hygiene and the LCP gap (Lane A, first)

- **Outcome:** the Lighthouse `largest-contentful-paint` and `categories:performance` assertions
  return to `error` (`apps/web/lighthouserc.cjs:26,31`), and the PR #12 review follow-ups that
  affect every visitor are closed.
- **Why this order:** both the journey and the deep routes add client JavaScript; the budget must be
  met before the page grows, or it never will be.
- **Scope:** split `components/sections/Craft.tsx` into a server shell and a client child (the one
  section still fully `'use client'`, `docs/m0-status.md` §3); gate the Assembly mount on LCP
  rather than the 300 ms idle timeout; build only the from/to formation bundles at mount; the
  perspective-correct pointer ray; `npm audit --omit=dev --audit-level=high` in CI; tighten the
  lazy size-limit glob (`.size-limit.json`, counts two pages-router chunks).
- **Exit criteria:** 12 Lighthouse runs on the CI runner with LCP ≤ 2 000 ms on mobile emulation;
  `lighthouserc.cjs` with both assertions at `error` and CI green; vitest count ≥ 629 with the
  new tests; size-limit unchanged or lower.
- **Dependencies:** Phase 0 (npm scripts in CI).
- **Risks:** the Craft split is "untested — measure before believing it" (m0-status §3); if LCP
  does not close, the fallback is a documented second investigation, not a loosened threshold.
- **Owner inputs:** none.
- **Rollback:** each item is its own PR; revert individually. The `warn` demotion stays until the
  numbers hold.
- **Size:** M.

### Phase 2a — Depth: the static routes (Lane A)

- **Outcome:** `/work/[slug]` for every non-placeholder project, `/about`, `/resume`, the sitemap
  listing them, OG images and JSON-LD per route, and the "Coming soon" affordances in the footer,
  the Craft section and the bento cards replaced by real links where the destination exists.
- **Why here:** no API involvement, so it is blocked only on owner content; it is the biggest
  visible step from "portfolio" to "case studies"; and it is what the journey's per-section
  formations will eventually frame.
- **Exit criteria:** every route in `app/sitemap.ts` returns 200 with JavaScript disabled;
  axe 0 serious/critical on each route; `.size-limit.json` extended to `app/**/page-*.js` (m0-status
  §4) and green; `lint:content` no longer lists an item the owner has supplied; Playwright route
  specs for each new route; private projects show the walkthrough CTA, not a 404 or empty body.
- **Dependencies:** Phase 1 (budget before growth). Content inputs from §4.
- **Risks:** case-study bodies for private client work must not disclose client detail without
  consent; the resume publishes PII (see the companion plan's security notes); MDX at build time
  only, never from the API.
- **Owner inputs:** case-study facts per project, the about narrative, a photo (or keep the
  monogram), `resume.pdf` or the decision to print from HTML.
- **Rollback:** routes are additive; reverting a route PR restores the "Coming soon" affordance,
  which still renders (the components take `href`/`labHref` as optional).
- **Size:** L (one PR per route group: case-study template + first two studies, about, resume,
  sitemap/OG).

### Phase 2b — Dynamic: the API in front of a visitor (Lane A, after 2a starts)

- **Outcome:** the contact form submits to `POST /v1/contact` with a `mailto:` fallback; the
  writing section shows the real Medium feed from `/v1/writing`; a cookieless analytics beacon;
  the API has a domain and the web origin in `API_CORS_ORIGINS`.
- **Why after 2a:** the first thing that depends on the API should be one thing (the lead
  pipeline, as spec §8 argued), and it needs the owner inputs still open from M1 (API domain, web
  origin, `NEON_API_KEY`), which 2a does not.
- **Exit criteria:** `leads` and `writing_cache` migrations with `down.sql`; `openapi.snapshot.json`
  diff reviewed under the expand/contract rule (`docs/m1-status.md`); the API-offline Playwright
  suite (spec §7) passes with the API origin blackholed; a submitted enquiry appears in `leads`
  and in the owner's mailbox; replaying the same `Idempotency-Key` returns the original response;
  `feedAttempted` is `true` only on a build where the fetch ran.
- **Dependencies:** M1 open inputs; Phase 0 CI; a Resend (or equivalent) account; the security
  MUST items in the companion plan.
- **Risks:** CORS widened for the POST only; rate limiting over Postgres `rate_limits` is untested
  under real load; the Medium feed is third-party XML (host-pinned, bounded, XXE-safe parsing).
- **Owner inputs:** API domain, web origin, Resend account, lead retention period, analytics
  country handling.
- **Rollback:** unset `NEXT_PUBLIC_API_URL` on Vercel and the site is byte-for-byte the static one
  (`apps/web/lib/api-client.ts` reports "unconfigured"); API routes roll back with `db:migrate --rollback`.
- **Size:** L.

### Lane B — The Assembly journey (parallel with Phases 1–2)

- **Outcome:** the 3D becomes "an expressive journey, not just cubes", delivered in the slices the
  journey spec defines. This roadmap only fixes its boundaries.
- **Boundaries:** every slice keeps the 2D fallback byte-identical on non-WebGL paths (PR #12 D3);
  the lazy chunk budget is enforced at the measured number and moves toward the spec's 200 kB
  (plain three build, named imports); tier detection and the context-loss ladder tests land
  before `/lab` (Phase 3) because the lab shares the single GL context (spec §3.3); rendered
  posters (`scripts/render-posters.ts`, spec §4.5) are a Lane B deliverable because OG images
  (Phase 2a) and the no-WebGL fallback both consume them.
- **Exit criteria per slice:** CI green, performance-engineer review, frame cost measured on a
  mid-range Android, no change to the initial JS budget.
- **Owner inputs:** the optional GLB hero artefact and its licence (spec §5.8); otherwise none.
- **Size:** per the journey spec.

### Phase 3 — Lab and admin (spec M4, reordered)

- **Outcome:** `/lab` with the Assembly sandbox and the shader study (physics and AR only when
  their dependencies earn their place); the admin leads inbox behind Firebase Auth with an
  allow-list and MFA; nightly rollup and the writing-refresh scheduler on Cloud Scheduler via
  `/internal/*` with OIDC caller verification.
- **Why here:** the inbox needs leads to exist (2b); the lab needs the journey's tiering (Lane B);
  both need a Firebase project (owner input) that nothing earlier needs.
- **Exit criteria:** `/lab` renders a poster card per experiment on a non-WebGL device; the
  `Permissions-Policy` header allows `xr-spatial-tracking`/`gyroscope` on self only and XR starts
  only from a user gesture; `/admin` is `noindex`, absent from the sitemap, and returns 401 for a
  valid Firebase token whose UID is not in `admins`; an admin status change is written with an
  audit row.
- **Dependencies:** 2b, Lane B tiering, Firebase project.
- **Risks:** drei `View` (one GL context, many viewports) was deliberately left out of PR #12;
  adding it is a dependency decision with a bundle cost; Rapier WASM only on opt-in.
- **Owner inputs:** Firebase project and admin email allow-list; which lab experiments are worth
  shipping in v1.
- **Rollback:** `/lab` is additive; admin routes are behind auth and can be disabled by removing
  the `admins` row.
- **Size:** L.

### Phase 4 — Asset pipeline (spec M4 remainder, conditional)

- **Outcome:** signed GCS uploads, the Cloud Tasks transcoder (Meshopt, LODs, KTX2, USDZ, poster),
  `GET /v1/assets/manifest` with the committed default manifest as fallback.
- **Why last and conditional:** it serves a modelled artefact that does not exist; until the owner
  supplies one, `docs/3d-asset-sourcing.md`'s manual commands are enough. Building it on
  speculation is the "separation reads as over-engineering" risk from spec §9.
- **Exit criteria:** an uploaded GLB produces every variant; `/v1/ready` includes GCS; the manifest
  is called once after hydration and never on the render path (API-offline suite).
- **Owner inputs:** the decision to commission or source an artefact, and its licence.
- **Size:** L. Skip entirely if the journey stays procedural.

### Phase 5 — Polish and launch (spec M5)

- **Outcome:** placeholder count 0 or each remaining item signed off by the owner; device
  performance pass; visual regression refreshed; a11y audit; API-offline suite in CI; domains
  (`<domain>` and `api.<domain>`); Search Console; colophon numbers from measurement.
- **Exit criteria:** `lint:content` prints "No placeholder content remaining" or the owner's
  sign-off list is in the launch PR; Lighthouse mobile ≥ 95 on all four categories at `error`;
  production domain serving with HSTS; the `develop → main` release PR merged by the owner.
- **Owner inputs:** domain name, sign-off on every remaining placeholder, the CSP decision
  (allowlist versus nonce).
- **Size:** M.

## 3. Lane C — CI and platform track (runs alongside everything)

| Item | State today | Action and deadline |
|---|---|---|
| pnpm → npm workspaces | `chore/npm-workspaces` in flight; `package.json:4` still `pnpm@9.15.0` on this branch | Phase 0. All three workflows, the API Dockerfile and docs switch together |
| `develop` branch | exists locally and on origin, cut from `main` at `e836c21` | Every PR targets it; release PRs `develop → main` are Wieslaw's merge |
| Lighthouse LCP and performance at `warn` | `apps/web/lighthouserc.cjs:26,31`, thresholds unchanged | Restore to `error` at Phase 1 exit; never loosen the numbers |
| Trivy waiver | `.trivyignore.yaml`: CVE-2026-75804 and CVE-2026-84782, `expired_at: 2026-10-31` | Dependabot's monthly docker bump should move the distroless digest first. If no fixed base exists by 2026-10-25, Wieslaw decides: extend the waiver (dated, with the same statement) or switch the runtime image. The gate goes red on its own on 2026-11-01 otherwise |
| Dependabot, docker stream | `.github/dependabot.yml`: `docker` in `/apps/api`, monthly, Node majors ignored | Keep |
| Dependabot, npm stream | not configured; `chore/npm-workspaces` at its current head still lists only `docker` | Add `package-ecosystem: npm` (root, monthly, grouped minor/patch) in the npm PR or its follow-up; Actions stay pinned by SHA and bumped by hand |
| Dependency audit in CI | none (`pnpm audit --prod` was run by hand in the M2 review) | `npm audit --omit=dev --audit-level=high` in the `verify` job, Phase 1 |
| Vercel | project `dev-wieslaw`; previews behind Vercel Authentication; `NEXT_PUBLIC_SITE_URL` not yet set (m0-status §4) | Set `NEXT_PUBLIC_SITE_URL` before Phase 2a (canonical URLs, sitemap, OG) |
| API deploy | `deploy-api.yml` on `main` pushes; liveness on `/v1/ready` restarts during a database outage (m1-status "Still open") | Decide readiness vs liveness after the first real deploy; no change until then |

## 4. Owner inputs, by the phase that needs them (spec §10, updated)

| Input | Needed by | Default until supplied |
|---|---|---|
| Merge the `develop → main` release PR; optionally default branch `develop` | Phase 0 | `main` unchanged, production unchanged |
| Case-study facts per project (problem, role, decisions, outcome, what you'd change) for the six real projects | 2a | Card without a destination, walkthrough CTA |
| AR project details (name, platform, role, outcome) | 2a | Placeholder card, `[AR project name]` |
| youth-care and angelo-crown: domain, role, outcome, or drop them | 2a | Listed as placeholders, never featured |
| Earlier roles 2020–2023, or confirm "Earlier engineering roles" as the final wording | 2a | Placeholder timeline entry |
| The two proof KPIs (platforms led/shipped, systems monitored), or drop them | 2a | Placeholder values 10 and 6 |
| About narrative (300–500 words), photo or monogram | 2a | Monogram; no `/about` |
| `resume.pdf`, and the PII boundary (the CV in `docs/Portfolio Design/uploads` is public in the repo) | 2a | Print stylesheet + `window.print()` |
| Testimonials with written consent, or none | 2a | Block hidden |
| API domain, web origin, Resend account, lead retention period | 2b | Form hands off to `mailto:` |
| Analytics: country handling and whether to run the beacon at all | 2b | No beacon |
| Firebase project, admin allow-list emails, MFA | 3 | No `/admin` |
| GLB hero artefact and licence, or stay procedural | 4 | Procedural; Phase 4 skipped |
| Domain name; CSP choice (allowlist versus nonce) | 5 | Vercel domain; no CSP |

### 4.1 Decisions taken by the owner on 2026-10-01

| Decision | Choice | Consequence |
|---|---|---|
| Lead retention | Keep name, email and message indefinitely | The contact form's privacy sentence must say so; no anonymisation job in 2b; leads inbox exports stay admin-only |
| Admin access | One allow-listed account (the public contact email), TOTP MFA mandatory | No recovery flow to build; Firebase project limited to that account |
| Analytics country | Dropped | The beacon stays cookieless and IP-free; no consent banner |
| CSP mode | Allowlist CSP, static generation kept | Strict `connect-src`, `frame-ancestors`, `object-src`, `worker-src`; inline scripts allowed; shipped with the Phase 1 headers work |
| Resume PII | Email and LinkedIn only on `/resume` and the PDF; the tracked CV removed from the tree and purged from history | Tree removal in this change; the history purge is a force push the owner runs (commands in the mission log) |
| Trivy waiver | Dropped now; the image job stays red until distroless republishes a fixed base | PRs cannot pass the merge gate until then; the owner merges by exception or waits for the base |
| Vercel SSO protection | Left on for now | Production URL still asks visitors to log in until a custom domain is added |

## 5. How to read this with the plans

The companion plan gives each "Coming soon" area its current state with `file:line`, its data and
contract changes, API involvement, acceptance criteria, size, dependencies, owner inputs and phase.
Build from the plan; use this document for order and for what "done" means at each phase.
