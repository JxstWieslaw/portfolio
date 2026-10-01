# Plan — every "Coming soon" and placeholder area (2026-10-01)

**For:** Wieslaw and the agents building from it · **Order and phases:** [`docs/roadmap.md`](../../roadmap.md)
· **Security:** the security-auditor report of 2026-10-01 (T3b in
`docs/lead/2026-10-01-npm-journey-cleanup.md`) sets MUST items per area; they are folded in below
as "Security (MUST)" and not re-argued.

Two rules every plan respects:

- **Content is git-first.** `apps/web/lib/content.ts` is the only module reading `content/`
  (`getProfile`, `getProjects`, `getExperience`, `getWriting`, `listPlaceholders`, lines 64–130).
  A route reads through those getters; nothing fetches content from the API on the render path
  (spec §4.10).
- **The API derives its DTOs from the same Zod contracts** (`packages/contracts/src/content.ts`,
  `api.ts`). A contract change is an `openapi.snapshot.json` diff and follows expand/contract
  (`docs/m1-status.md`, "Seed ordering: decision"). Additive optional fields need no ceremony.

Line numbers are from the branch `docs/roadmap-and-coming-soon` at `05e7218`.

Placeholder list, `npm run lint:content` (exit 0 by design, `apps/web/scripts/lint-content.ts:8-10`):

```
8 placeholder item(s) still in content:
  kpi          · Production platforms led/shipped · Concurrent production systems monitored
  project      · AR Product Visualiser · youth-care · angelo-crown
  experience   · Earlier engineering roles
  writing      · Reversible data migrations: dry-run, apply, rollback · One draw call: holding 60 fps on a mid-range phone
```

---

## 1. `/work/[slug]` case studies

- **Current state:** no `app/work` directory exists (`apps/web/app` holds only `page.tsx`,
  `layout.tsx`, `robots.ts`, `sitemap.ts`). `components/cards/ProjectCard.tsx:163-165` says the
  `/work/${slug}` fallback href is "deliberately gone"; `ProjectCard.tsx:227-232` renders a card
  without a destination as a plain container (no `<a>`, no glow). `app/page.tsx:40-45,46-72`
  `toBentoProject` sets `href` only from `links[0].url` (today: PR-Pulse on GitHub) and the
  placeholder treatment for the AR project.
- **User-facing outcome:** each real project card links to `/work/<slug>` with the spec §3.2
  template (context, problem, role, architecture, decisions, outcome, stack, what I'd do
  differently, prev/next, contact CTA). Private projects show the walkthrough copy and a "Book a
  walkthrough" CTA prefilling the contact form. `/work` lists all projects filterable by domain.
- **Data and contract changes:** `projectSchema` (`packages/contracts/src/content.ts:32-47`) gains
  optional `decisions: {decision, why, tradeoff}[]`, `problem`, `approach`, `architecture` (MDX
  file reference, not inline), `media` (spec §4.6), all optional so existing content still parses.
  Case-study bodies as MDX under `content/work/<slug>.mdx`, read by `lib/content.ts` at build.
  `links[].url` and `media[].src` get an http(s) refinement.
- **API involvement:** none on the render path. The seed picks up the new optional columns
  (`project_decisions`, `project_media`, M1 plan refinement 4) in a later, separate PR; `/v1/projects/:slug/stats` stays Phase 3.
- **Acceptance:** route 200 with JS disabled for every non-placeholder project; a placeholder
  project has no route (404 is correct, no link points at it); `generateMetadata` + `CreativeWork`
  JSON-LD per study; axe clean; `.size-limit.json` extended to `app/**/page-*.js`; Playwright
  spec for one public and one private study; `toBentoProject` passes `href` for every project
  with a body and keeps the external link for PR-Pulse as a secondary CTA.
- **Security (MUST):** MDX compiled at build time only, never fetched or rendered from the API;
  external `href` values validated as http(s) in contracts; no client confidential detail without
  owner sign-off per study.
- **Size:** L (template + first two studies M, each further study S).
- **Dependencies:** Phase 1 budget work; rendered posters from Lane B for OG backgrounds (a flat
  gradient OG is the fallback).
- **Owner inputs:** the facts per project; which private projects may have a public write-up.
- **Phase:** 2a.

## 2. `/lab`

- **Current state:** `components/sections/Craft.tsx:272-277` documents `labHref` as "omit it in
  M0"; `Craft.tsx:402` passes it to `LabLink`, and `Craft.tsx:413-431` renders an `aria-disabled`
  button with a "Coming soon" badge when undefined. `app/page.tsx:109-111` omits it. The footer
  renders `/lab` through `ComingSoonLink` (`components/layout/Footer.tsx:66-76,78-87`) when a
  `FooterLink` has no `href`.
- **User-facing outcome:** `/lab` with experiment cards (spec §3.3): Assembly sandbox, shader study;
  physics playground and AR only if their dependencies are accepted; designed "Next experiment"
  placeholder cards; a poster card per experiment on non-WebGL devices.
- **Data and contract changes:** `labExperimentSchema` (spec §4.6: slug, title, kind, blurb,
  minTier, component, placeholder) added to contracts; `content/lab.json`; `getLab()` in
  `lib/content.ts`.
- **API involvement:** `/v1/lab` and the `lab_experiments` table are additive and can follow in a
  separate seed PR; the route needs neither.
- **Acceptance:** `labHref="/lab"` passed from `page.tsx` and the footer link live; the button
  variant of `LabLink` no longer renders on `/`; `/lab` renders every card with JS disabled;
  `?nogl=1` shows posters; the single-GL-context rule holds (no second `<Canvas>`); frame cost
  measured on a mid-range Android; lazy chunk budget unchanged for `/`.
- **Security (MUST):** `Permissions-Policy` allowing `xr-spatial-tracking` and `gyroscope` on
  self only; XR sessions and device-orientation access start only from a user gesture; Leva or any
  control panel is prod-visible on this page only.
- **Size:** L.
- **Dependencies:** Lane B tiering and context-loss ladder; the drei `View` dependency decision.
- **Owner inputs:** which experiments are worth v1; whether gabar material may be shown.
- **Phase:** 3.

## 3. `/about`

- **Current state:** no route; footer link is "Coming soon" (`Footer.tsx:14-20`, the `FooterLink`
  without `href`). `app/sitemap.ts:5-10` lists only `/`.
- **User-facing outcome:** narrative (300–500 words), photo slot with the monogram fallback,
  values, "how I work", the full timeline (spec §3.4).
- **Data and contract changes:** `content/about.json` or `about.mdx` with `narrative`, `values[]`,
  `howIWork[]`, optional `photo` (`src`, `alt`); `getAbout()` in `lib/content.ts`; timeline reuses
  `getExperience()`.
- **API involvement:** none.
- **Acceptance:** 200 with JS disabled; `Person` JSON-LD reused from `/`; axe clean; the footer and
  nav links live; sitemap entry; visual snapshot at the four widths.
- **Security (MUST):** publishes nothing beyond what `content/profile.json` already makes public
  (no address, no phone, no date of birth).
- **Size:** S–M.
- **Dependencies:** none beyond Phase 1.
- **Owner inputs:** the narrative, values, a photo or the decision to keep the monogram.
- **Phase:** 2a.

## 4. `/resume`

- **Current state:** no route; footer "Coming soon". A CV PDF is tracked in the public repo at
  `docs/Portfolio Design/uploads/WIESLAW_SAMUSHONGA_Java SE.pdf`.
- **User-facing outcome:** the same content model rendered for print (`@media print`), a
  "Download PDF" button serving `public/resume.pdf` if present, else `window.print()`.
- **Data and contract changes:** none required; reuses profile, experience, skills, projects. An
  optional `resumePdf: true` build flag or the file's presence decides the button.
- **API involvement:** none.
- **Acceptance:** print preview fits A4 and Letter without clipped sections; the download link
  returns 200 or is absent (never a dead link); `noindex` is not set (a resume is meant to be
  found) but the PDF is excluded from the sitemap; axe clean.
- **Security (MUST):** no PII beyond `profile.json`; the owner decides the PII boundary for the
  PDF before any PDF ships, and decides whether the tracked CV under `docs/` should remain in the
  public repository (it is already public; removing it from history is a separate decision).
- **Size:** S.
- **Dependencies:** `/about` content shape is useful but not required.
- **Owner inputs:** `resume.pdf` and the PII decision.
- **Phase:** 2a.

## 5. The "View perf" link in the footer

- **Current state:** `Footer.tsx:98-102` documents `perfHref`; `Footer.tsx:144-154` renders the
  "Coming soon" affordance when it is undefined; `app/page.tsx` does not pass it. The Craft perf
  HUD reports only `fps` and `frame` and renders `—` for renderer counters (`Craft.tsx:38-45`).
- **User-facing outcome:** a `/perf` page (or a section on `/lab`) that shows measured numbers
  only: the live frame-time HUD, the CI budgets (`.size-limit.json` and `lighthouserc.cjs` values)
  and the last measured Lighthouse figures, each with its source and date. Spec §3.1's footer
  "perf stats" and the colophon's numbers come from here.
- **Data and contract changes:** a build-time `content/perf.json` written by CI from the size-limit
  and Lighthouse outputs, validated by a `perfSnapshotSchema` in contracts. No runtime API.
- **API involvement:** none. Not a telemetry endpoint.
- **Acceptance:** every number on the page links to the run that produced it; nothing renders a
  placeholder figure (reconciliation §6a); `perfHref` passed from `page.tsx`; the WebGL counters
  (draw calls, instances, tier) show real values only while the Assembly is live.
- **Security:** none beyond the rule that nothing fabricated is shown.
- **Size:** M.
- **Dependencies:** Phase 1 (the numbers must be true before they are advertised); Lane B exposes
  renderer counters.
- **Owner inputs:** none.
- **Phase:** 2a (static budgets) then Lane B (live counters).

## 6. The writing feed

- **Current state:** `components/sections/Writing.tsx:28,38-47` document `feedUrl` and
  `feedAttempted` ("`false` in M0, because no fetch happens at all"); `Writing.tsx:89-108` renders
  the "Feed not wired up yet" card with the Medium link. `app/page.tsx:117-124` passes `feedUrl`
  and omits `feedAttempted`. `content/writing.json:2-17` holds two `placeholder: true` articles
  whose `url` is the Medium profile, not an article. The API has no `/v1/writing` and no
  `writing_cache` table (M1 plan refinement 6; the plan's seed section notes "writing.json is not
  seeded in M1; the writing cache arrives with the Medium feed in M3").
- **User-facing outcome:** the three latest Medium posts with real titles, dates and article URLs;
  on fetch failure the last-good cache; if the API is unreachable, three designed cards linking to
  the Medium profile (spec §4.5).
- **Data and contract changes:** `writingSchema` (`contracts/src/content.ts:69-76`) unchanged;
  `writingPageSchema` for the `/v1/writing` response in `api.ts`. `content/writing.json` placeholder
  entries are removed once the feed is live (or replaced with real article URLs by the owner
  before then).
- **API involvement:** `writing_cache` table (api spec §4), `GET /v1/writing` (ETag, s-maxage 300),
  `POST /internal/writing/refresh` behind OIDC caller verification, Cloud Scheduler job. The web
  app fetches `/v1/writing` **at build time** (ISR revalidate or a build step), never from the
  browser on the render path, and passes `feedAttempted={true}` only when the fetch actually ran.
- **Acceptance:** a build with the API reachable shows real posts; a build with it unreachable
  shows the designed cards and `feedAttempted` reflects the truth; replaying the refresh is
  idempotent on `url`; `down.sql` for the migration; the API-offline Playwright suite passes.
- **Security (MUST):** fetched out of band by the API, never from the browser; the feed URL is
  host-pinned (`medium.com`, the owner's handle) and not configurable from a request; bounded
  fetch (timeout, max bytes, redirect limit); XXE-safe XML parsing (no DTD, no entity expansion);
  excerpts stored as text, rendered escaped.
- **Size:** M.
- **Dependencies:** Phase 2b inputs (API domain, scheduler), Phase 0 CI.
- **Owner inputs:** confirm the Medium handle (`profile.json:17`); optionally supply real article
  URLs now so the two placeholders can go before the feed exists.
- **Phase:** 2b.

## 7. Testimonials

- **Current state:** `components/sections/HowILead.tsx:39-56` defines `TestimonialQuote` and the
  optional `testimonial` prop; `HowILead.tsx:132-134` returns `null` without a quote or with an
  empty one; `app/page.tsx:105-107` passes none, citing spec §5.7 ("fabricated praise is not
  acceptable"). Reconciliation §6.7 keeps the block hidden.
- **User-facing outcome:** one or more real, attributed quotes under "How I Lead"; nothing
  otherwise. The rule never changes: no quote, no block.
- **Data and contract changes:** `testimonialSchema { quote, author, role, org?, url?, consentedOn
  (date), placeholder: never }` in contracts; `content/testimonials.json` reviewed through a PR;
  `getTestimonials()` in `lib/content.ts`; `lint:content` reports a testimonial lacking
  `consentedOn`.
- **API involvement:** none, by design.
- **Acceptance:** with an empty file the block is absent from the DOM; with one entry it renders
  with initials fallback (`HowILead.tsx:136`); a schema test rejects `placeholder: true`.
- **Security (MUST):** quotes come from a git-reviewed content file with recorded consent, never
  from the API or any user input.
- **Size:** S.
- **Dependencies:** none.
- **Owner inputs:** the quotes and written consent from each author.
- **Phase:** 2a (whenever a quote exists).

## 8. The AR case study and the youth-care / angelo-crown placeholders

- **Current state:** `content/projects.json:76-86` `ar-product-visualiser` (`featured: true`,
  `placeholder: true`); `projects.json:101-111` `youth-care` and `:114-124` `angelo-crown`
  (`featured: false`, `placeholder: true`). `page.tsx:64-70` renders the AR card as the
  reconciliation §6.10 non-interactive card named `[AR project name]`. `countDomainsShipped`
  (`contracts/src/content.ts:116-122`) excludes placeholders, so the KPI reads 7 until the AR
  project is real.
- **User-facing outcome:** either a real AR case study in the bento (the KPI becomes 8) or the
  slot filled by the next real project (`BENTO_SLOTS = 7`, `lib/content.ts:103`); youth-care and
  angelo-crown appear under `/work` with real details or are removed.
- **Data and contract changes:** none; the owner's facts replace the entries and `placeholder`
  is dropped. If a project is dropped, `getBentoProjects` picks the next by `order`.
- **API involvement:** the seed re-runs on deploy; a removed project is an additive content
  change (the row is upserted, not deleted; add a `removed` handling only if the seed does not
  already tolerate it, check `apps/api/src/content/seed.ts`).
- **Acceptance:** `lint:content` no longer lists the three; the AR card is a link to `/work/<slug>`
  or gone; the hero KPI shows the derived count.
- **Security:** client names only with consent (youth-care and angelo-crown are private).
- **Size:** S each (content), plus the case-study body under §1.
- **Dependencies:** §1 for the destination.
- **Owner inputs:** AR project name, platform, role, outcome, media; youth-care and angelo-crown
  domain, role, outcome, or the decision to drop them.
- **Phase:** 2a.

## 9. "Earlier engineering roles" placeholder

- **Current state:** `content/experience.json:24-33`, `org: "Earlier engineering roles"`,
  2020-01 to 2023-12, `placeholder: true`. Today's `feat/profile-roles-progression` adds the
  per-company role ladder (mission log D4) without a contract change; this entry is untouched by it.
- **User-facing outcome:** real earlier roles (org, title, period, highlights) or the entry
  removed and the timeline starting at 2024.
- **Data and contract changes:** none (`experienceSchema`, `contracts/src/content.ts:50-57`).
- **API involvement:** seed upsert of `experiences`.
- **Acceptance:** `lint:content` no longer lists it; the Timeline test fixtures updated; the
  "Years shipping" KPI (`profile.json:23`) agrees with the earliest real `period.from`.
- **Size:** S.
- **Owner inputs:** the roles, or the decision to drop the entry.
- **Phase:** 2a.

## 10. The two placeholder KPIs

- **Current state:** `content/profile.json:26` "Production platforms led/shipped: 10" and `:29`
  "Concurrent production systems monitored: 6", both `placeholder: true`, group `proof`. The
  schema allows `derived` only for `domainsShipped` (`contracts/src/content.ts:105-110,128-134`).
- **User-facing outcome:** two confirmed numbers, or two different KPIs that can be derived from
  content (for example "Case studies published", derived from projects with a body), or the proof
  strip reduced to the tiles that are true.
- **Data and contract changes:** if a derived KPI is chosen, extend the `derived` enum and
  `resolveKpis` with a test; otherwise content only.
- **API involvement:** `profile` seed; `/v1/profile` serves the resolved values.
- **Acceptance:** `lint:content` shows no `kpi` items; the ProofStrip layout holds with 2, 3 or 4
  tiles (reconciliation §1.1).
- **Size:** S.
- **Owner inputs:** confirm the two numbers or choose replacements.
- **Phase:** 2a.

## 11. Deep routes absent from `app/sitemap.ts`

- **Current state:** `apps/web/app/sitemap.ts:5-10` lists only `/` and explains why ("a sitemap
  that advertises 404s is worse than a short one"); `/admin` excluded permanently.
- **User-facing outcome:** the sitemap lists every public route that exists, with `lastModified`
  from content, never a route that does not.
- **Data and contract changes:** none. The sitemap derives `/work/<slug>` from
  `getProjects().filter(p => !p.placeholder && hasBody(p))`.
- **Acceptance:** a Playwright test fetches `/sitemap.xml`, requests every URL and expects 200;
  `/admin` and the PDF never appear; `NEXT_PUBLIC_SITE_URL` set on Vercel so `canonical()` does
  not fall back to the per-deployment `VERCEL_URL` (m0-status §4).
- **Security (MUST):** OG images are static route handlers keyed by slug, with no free-text
  parameter.
- **Size:** S, one commit per route group as it lands.
- **Dependencies:** each route above.
- **Phase:** 2a, incrementally.

## 12. The contact form's API wiring

- **Current state:** `components/sections/ContactForm.tsx:29-33` ships all six states "so M3 can
  wire `POST /v1/contact` behind exactly this"; `ContactForm.tsx:268-276` says `sending`,
  `success`, `limited` and `error` are unreachable; the submit builds a `mailto:` (`:112-119`,
  `:292-300`) and shows the `offline` copy (`:91-93`, "Nothing was sent from this page").
  `apps/web/lib/api-client.ts` has `apiRequest` with Zod-validated responses and
  `ApiError` kinds (`unconfigured`, `network`, `timeout`, `http`, `invalid-response`) but only
  health/readiness schemas (`contracts/src/api.ts:43-48`). The API has no contact module
  (`apps/api/src`: config, content, db, health, http, openapi) and no `leads` table.
- **User-facing outcome:** submit sends the enquiry; `success` says it reached the owner (true,
  because it is persisted); rate-limited shows `limited`; any API failure, including
  `unconfigured`, shows `offline` with the `mailto:` link, so the path never dead-ends.
- **Data and contract changes:** `contactRequestSchema { name, email, message (min 20),
  company_website (honeypot, must be empty), startedAt }` and `contactResponseSchema { id,
  receivedAt }` in `contracts/src/api.ts`; both apps import them.
- **API involvement:** `leads` and `lead_notes` tables with `down.sql`; `POST /v1/contact`;
  `@nestjs/throttler` over Postgres `rate_limits` (5 per 10 min per IP hash); `Idempotency-Key`
  unique index with verbatim replay; Resend delivery with background retry; `problem+json` errors
  mapped to form states (`422` → `error`, `429` → `limited`).
- **Acceptance:** integration tests for happy path, honeypot, timing check, replay, rate limit;
  the web form test covers every state through a mocked `apiRequest`; the API-offline suite shows
  the `mailto:` path; p95 ≤ 400 ms excluding cold start (api spec §11); `openapi.snapshot.json`
  updated.
- **Security (MUST):** `trust proxy` narrowed from `true` (`apps/api/src/app.ts:30`) to `1`
  (Cloud Run's single proxy hop) before any IP hashing; throttler on the route; `Idempotency-Key` required; CORS widened for this POST only,
  to the production and preview origins; a lead retention period decided and enforced by a
  scheduled purge; message body redacted from logs and Sentry; IP hashed, never stored raw.
- **Size:** L (API M, web S, infra S).
- **Dependencies:** API domain, web origin in `API_CORS_ORIGINS`, Resend account, Phase 0 CI.
- **Owner inputs:** Resend (or alternative) account, the retention period, confirmation that
  `wieslawsamushonga01@gmail.com` is the delivery address.
- **Phase:** 2b.

## 13. Cross-cutting items the security report adds

These are not "Coming soon" affordances but they gate the areas above.

| Item | Where it lands | Owner decision |
|---|---|---|
| Analytics beacon: cookieless, honours DNT and GPC, no raw IP, country handling | Phase 2b with the contact pipeline | whether to run it; country handling |
| Admin surface: Firebase ID token verified against an `admins` allow-list, MFA required | Phase 3 | Firebase project, allow-list emails |
| CSP: allowlist (`connect-src` = API origin, Sentry, Firebase Auth) versus nonce | Phase 5, before the domain goes live | which model |
| PII boundary for the resume PDF; the tracked CV under `docs/Portfolio Design/uploads` | Phase 2a | what may be public; whether to remove the file (and history) |
| Lead retention period | Phase 2b | the period |

## 14. Summary table

| # | Area | Size | Phase | Blocked on owner |
|---|---|---|---|---|
| 1 | `/work/[slug]` | L | 2a | project facts, client consent |
| 2 | `/lab` | L | 3 | experiment choice |
| 3 | `/about` | S–M | 2a | narrative, photo |
| 4 | `/resume` | S | 2a | PDF, PII boundary |
| 5 | View perf | M | 2a / Lane B | none |
| 6 | Writing feed | M | 2b | Medium handle, optional article URLs |
| 7 | Testimonials | S | 2a | quotes with consent |
| 8 | AR, youth-care, angelo-crown | S each | 2a | project facts |
| 9 | Earlier roles | S | 2a | roles or drop |
| 10 | Two KPIs | S | 2a | numbers or replacements |
| 11 | Sitemap | S | 2a | none |
| 12 | Contact pipeline | L | 2b | Resend, retention, domain |
| 13 | Cross-cutting security | — | 2b–5 | five decisions above |
