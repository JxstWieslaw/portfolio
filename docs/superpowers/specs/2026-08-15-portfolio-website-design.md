# Portfolio Website — Architecture & Design Specification

| | |
|---|---|
| **Owner** | Wieslaw Samushonga — Tech Lead @ Data Age · Senior Software Engineer @ Rapidev Labs |
| **Date** | 2026-08-15 |
| **Status** | Approved design, pre-implementation |
| **Companion docs** | [`2026-08-15-api-service-design.md`](2026-08-15-api-service-design.md) (the backend service) · [`docs/claude-design-brief.md`](../../claude-design-brief.md) (paste into Claude Design) · [`docs/3d-asset-sourcing.md`](../../3d-asset-sourcing.md) |
| **Revised** | 2026-08-15 — frontend and backend separated into two deployables (see §4.1, §4.2, §4.10, §8, §11) |
| **Repo location** | `JxstWieslaw/portfolio/` (greenfield) |

---

## 0. Executive summary

A single-page-first portfolio with deep pages, built in the stack it advertises (TypeScript · Next.js · React Three Fiber), whose signature is a **persistent, scroll-driven WebGL layer** — "The Assembly" — one instanced-mesh system that morphs between section-specific formations as the visitor scrolls. The page remains a normal, indexable, accessible HTML document; the 3D is a layer behind it, never a gate in front of it.

The site's job is to make Wieslaw **marketable to three audiences at once** — hiring managers/CTOs skimming on a phone, clients evaluating a consultant, and engineers judging craft — by leading with **leadership + delivery** (named production platforms across eight domains, architecture decisions, how he runs a team) and using **real-time 3D/AR as the differentiating proof of craft**. The site itself is that proof: it must hold 60 fps on a mid-range phone.

**The system is two independently deployed applications**, not one: `apps/web` (Next.js on
Vercel) and `apps/api` (NestJS on Google Cloud Run, with Neon Postgres), joined by a shared
typed contract in a Turborepo. The backend is not decorative — it owns a lead pipeline,
first-party cookieless analytics, a 3D asset transcoding pipeline, and a writing cache, and it
publishes its own OpenAPI documentation at `api.<domain>/docs` as a portfolio artifact in its
own right. Its full design is a companion document,
[`2026-08-15-api-service-design.md`](2026-08-15-api-service-design.md).

The rule that makes the split safe rather than costly: **content stays git-first, so a cold
visitor's page render never touches the API.** That single constraint preserves every
performance budget in §6 while letting Cloud Run idle at zero instances and zero cost, and it
means the site remains fully functional with the backend entirely offline — a property enforced
by a CI suite that runs the whole E2E pass with the API blackholed.

Three non-negotiables from the brief, translated:

| Brief said | Spec means |
|---|---|
| "3D elements very much on point / prominent" | The Assembly is present on every section of `/`, and every deep page has a 3D moment — but always behind real content, always with a fallback. |
| "Filler elements for everything, nothing out of place" | Every slot ships with written copy or a designed fallback (poster, gradient+monogram, skeleton). Unknown facts are placeholder copy flagged `placeholder: true` in content and listed by a lint step — never blank. |
| "Mobile, tablets, desktop, even wide screens" | Six breakpoints from 360 px to 2560 px+ (21:9 / 32:9), fluid type, canvas that re-frames the formation by aspect ratio so it never looks lost or cramped. |

---

## 1. Goals, audiences, success criteria

### 1.1 Goals
1. Present Wieslaw as **a Tech Lead who ships production platforms** — leadership and delivery first, WebGL/AR as specialism (his stated preference; not a "creative engineer hybrid" framing).
2. Show the **breadth**: healthcare, education, creator economy, procurement/ERP, social services, developer tooling, interactive 3D, AR/XR.
3. Be a **resume touchpoint**: recruiter-fast on a phone, deep on request, printable.
4. Be a **credential in itself**: performance budget met, accessible, engineered.

### 1.2 Audiences and what each needs in the first 10 seconds
| Audience | Needs | Where they get it |
|---|---|---|
| Hiring manager / CTO | Title, seniority, domains, evidence of leadership | Hero + Proof strip + How I Lead |
| Client / founder (consulting) | Domains, outcomes, availability, how to reach | Selected Work + Contact |
| Engineer / peer | Craft, architecture, code, perf discipline | Case studies + Lab + colophon/perf HUD |

### 1.3 Success criteria (measurable)
- Lighthouse (mobile) ≥ 95 in Performance, Accessibility, Best Practices, SEO on `/` and one case study.
- Core Web Vitals on 4G / mid-range Android (Moto G-class): **LCP ≤ 2.0 s, INP ≤ 200 ms, CLS ≤ 0.05**.
- Assembly holds **≥ 55 fps on desktop tier 3, ≥ 30 fps on tier 1 mobile** with its reduced instance count.
- Zero content slots empty at any breakpoint, WebGL on or off, reduced motion on or off (verified by Playwright visual snapshots).
- Every route has correct title/description/OG image; JSON-LD validates.
- Keyboard-only navigation reaches every interactive element; axe reports 0 serious/critical.
- **With the API origin blackholed, every route still renders, the contact form falls back to `mailto:`, and no unhandled rejection reaches the console** (Playwright, every CI run).
- `apps/api` and `apps/web` each deploy independently without touching the other; a breaking contract change fails CI at typecheck rather than at runtime.
- The public OpenAPI document at `api.<domain>/docs` is complete enough to be usable by a third party without reading source.

### 1.4 Non-goals (v1)
- Light theme (tokens are structured for it; not shipped).
- **Content CMS** — content stays typed MDX/JSON in the repo and ships through pull requests. The admin surface (M4) manages *leads, analytics and 3D assets*, not case-study copy.
- Blog engine (writing links out to Medium; RSS-fed cards only).
- Modelled/commissioned 3D assets (procedural v1; modelled artefact is an optional v2 — see §5.8).
- Fully immersive "walk-through" 3D world (explicitly rejected during design).

---

## 2. Positioning & narrative

**Headline:** *I lead teams that ship production software — and I make the web move.*

**Narrative arc down the page:** Who (Hero) → Proof of breadth (Proof strip) → Proof of delivery (Selected Work) → Proof of leadership (How I Lead) → Proof of craft (Craft/3D & AR) → Tools (Stack) → History (Timeline) → Voice (Writing) → Action (Contact).

**Semantic accent system** (both colours already exist in the GitHub brand):
- **Violet `#7C3AED` / `#A78BFA` = leadership, direction, architecture.**
- **Cyan `#22D3EE` = craft, motion, 3D.**
- The Assembly is coloured along the violet→cyan gradient; sections lean to one end (How I Lead is violet-led, Craft is cyan-led).

**Rules of voice** (from the existing README, keep consistent):
- Concrete over adjectival: "reversible migrations — dry-run, apply, rollback" beats "robust".
- Never lead with public GitHub stats (they under-represent private production work). Stats appear only as texture and always with `count_private=true&include_all_commits=true` semantics.
- Leadership described as "technical direction, code review and mentorship" — no headcounts.
- Availability: "Open to consulting & collaboration" — not job-hunting.
- Private/client codebases are stated plainly and turned into a CTA: "Client codebase — code isn't public; happy to walk through the architecture."

---

## 3. Information architecture & routes

```
/                      Flagship scroll experience (all sections, deep-linkable by #id)
/work                  All case studies, filterable by domain (?domain=healthcare)
/work/[slug]           Case study
/lab                   3D & AR experiments (where the AR work is demonstrated)
/about                 Long-form narrative, timeline, values, how I work
/resume                Print-optimised CV + PDF download
/admin                 Leads inbox, analytics, asset manager (Firebase Auth, noindex, M4)
/opengraph-image       Default OG (route-level generators for /work/[slug])
/sitemap.xml, /robots.txt
```

`/admin` is the only authenticated surface in the system and is excluded from the sitemap,
`robots.txt` and all OG generation. Everything else is public and static.

### 3.1 `/` sections (in order, each with `id`, its Assembly formation, and its content)

| # | id | Section | Assembly formation | Content (v1) |
|---|---|---|---|---|
| 1 | `hero` | Hero (100 svh) | **monolith** — assembles on load | Eyebrow (roles · Harare, Zimbabwe), H1, sub, CTAs "See the work" / "Let's talk", KPI trio, scroll cue |
| 2 | `proof` | Proof strip | **stream** | 8 domain chips (marquee on mobile), 4 KPI tiles |
| 3 | `work` | Selected Work | **lattice** (+ card attractors) | Bento of 6 featured case-study cards + "All work →" |
| 4 | `lead` | How I Lead | **orbit** | 3 pillars with concrete practices, "how I run a project" 5-step strip, optional testimonials block (renders only with real quotes) |
| 5 | `craft` | Craft: 3D & AR | **scatter-physics** | Statement, interactive physics toggle, "View in AR" (WebXR-capable devices), perf HUD toggle, "Open the lab →" |
| 6 | `stack` | Stack | **grid** | 6 skill groups as chip clusters + "how I choose" note |
| 7 | `timeline` | Experience | (grid persists, dims) | Vertical timeline: Data Age, Rapidev Labs, earlier roles (placeholder) |
| 8 | `writing` | Writing & elsewhere | (dims further) | 3 latest Medium posts (build-time RSS) with designed fallback cards; social links |
| 9 | `contact` | Contact | **ring** | "Open to consulting & collaboration", form, direct links |
| — | — | Footer | ring persists | Nav, socials, colophon ("Built with Next.js · R3F · Rapier — 60 fps on a mid-range phone"), perf stats |

### 3.2 `/work/[slug]` — case study template
Header (domain, name, role, period, visibility badge, stack chips, compact Assembly **badge** formation top-right or poster) → sticky TOC (desktop) → **Context → Problem → My role → Architecture** (diagram slot: Mermaid rendered at build, or SVG; a designed placeholder diagram ships) **→ Key decisions** (table: decision · why · trade-off) **→ Outcome** (metrics; placeholders flagged) **→ Stack → What I'd do differently** → Prev/Next project → Contact CTA.

Private projects show: *"Client / internal codebase. The code isn't public — I'm happy to walk through the architecture on a call."* with a "Book a walkthrough" CTA (contact form prefilled).

### 3.3 `/lab`
The persistent canvas remains the **single GL context** for the whole app; on `/lab` the Assembly unmounts (its formation state is preserved in the store for when the visitor navigates back) and each experiment renders into a viewport of that same canvas via drei `View` — one `View` per card, never a second `<Canvas>`. Experiments (v1):
1. **Assembly sandbox** — the formation system with a control panel (Leva, prod-visible on this page only).
2. **Physics playground** — Rapier rigid bodies, flick/throw, mobile joystick (nod to *gabar*).
3. **Shader study** — the monolith's noise/transmission material isolated with sliders.
4. **AR: place the artefact** — WebXR (`@react-three/xr`) on Android Chrome; iOS fallback via USDZ Quick Look (`<a rel="ar">`). Both the GLB and the USDZ come from the same source upload via the transcoder service (§5.8), so the two AR paths can never drift apart. Non-capable devices see a poster + "How AR works here" note.
5. Placeholder cards ("Next experiment") — designed, not empty.

### 3.4 `/about`, `/resume`
`/about`: narrative (300–500 words), photo slot (gradient+monogram fallback), values, "how I work", full timeline. `/resume`: same content model rendered for print (`@media print`), "Download PDF" (static `public/resume.pdf` supplied by owner; if absent, the button triggers `window.print()`).

### 3.5 Navigation
Sticky top bar that condenses on scroll: monogram → section links (desktop) → "Let's talk" CTA. Mobile: bottom-sheet menu (thumb-reachable) with section links + socials. `⌘K` command palette (`cmdk`) for sections/projects/links — v1.5, not blocking.

---

## 4. Technical architecture

### 4.1 Stack (decision: Approach A, split into two deployables)

The system is **two independently deployed applications in one Turborepo**, joined by a shared
typed contract:

| App | Runs on | Owns |
|---|---|---|
| `apps/web` | **Vercel** (SSG/ISR) | Rendering, routing, SEO/OG, the 3D layer, content presentation |
| `apps/api` | **Google Cloud Run** (Docker, NestJS) | Leads, first-party analytics, 3D asset registry/transcoding, writing cache, admin |

The full backend design is its own document:
[`2026-08-15-api-service-design.md`](2026-08-15-api-service-design.md). The load-bearing rule
that governs the boundary is stated in §4.10: **a cold visitor's page render never touches the
API.**

**Frontend stack (`apps/web`):**

| Concern | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router), TypeScript strict** | Persistent canvas in root layout; MDX/ISR case studies; `next/og`; the advertised stack |
| Styling | **Tailwind CSS v4** + CSS custom-property tokens | Tokens shared by DOM and shader uniforms |
| 3D | **three · @react-three/fiber · @react-three/drei · @react-three/rapier · @react-three/postprocessing · maath · detect-gpu** | Owner's proven toolchain (gabar) |
| State | **Zustand** — one `scrollStore` is the single source of truth for DOM and WebGL | Avoids DOM/GL drift |
| DOM motion | **Motion** (`motion/react`) — one animation library only | Scroll-linked reveals; no GSAP duplication |
| Smooth scroll | **Lenis** (pointer devices only; native on touch; off under reduced motion) | Coupled camera feel without hijacking scroll |
| Content | **Velite** (MDX + JSON → typed, Zod-validated) reading `content/` from the repo root | Maintained; build-time schema; **no network in the render path** |
| API client | Typed `fetch` wrapper generated from `packages/contracts` | One schema definition shared by both apps |
| Forms | Client submit → `POST /v1/contact` on the API (Zod, honeypot, idempotency key) | Leads are persisted and workable, not just emailed; `mailto:` fallback if the API is unreachable |
| Hosting | **Vercel** — Speed Insights, OG image route | Owner's platform |
| Observability | **Sentry** (browser + server, `tracesSampleRate 0.1`, replay off) with `traceparent` propagated into the API | One trace spans both deployables |
| Testing | Vitest · React Testing Library · **Playwright** (e2e + visual) · **Lighthouse CI** · `size-limit` | Budgets enforced in CI |
| Tooling | Turborepo · pnpm workspaces · ESLint · Prettier · Husky + conventional commits · GitHub Actions | Owner's practice |

**Backend stack (`apps/api`)** — summarised here, specified in the companion doc:
**NestJS** (modules/DI/guards; `@nestjs/swagger` publishes a public OpenAPI surface at
`api.<domain>/docs`, which is itself a portfolio artifact) · **Drizzle** + **Neon Postgres**
(scale-to-zero, branch-per-PR) · **Google Cloud Run** (two services: API and an asset
transcoder) · **GCS** + **Cloud Tasks** + **Cloud Scheduler** + **Secret Manager** ·
**Firebase Auth** for the single admin identity · **Pino** structured logs into Cloud Logging.

**Shared:** `packages/contracts` — Zod schemas, inferred types, and the generated OpenAPI
document. `apps/api` derives its DTOs from it via `nestjs-zod`; `apps/web` derives its client
types from it. A breaking API change therefore fails the *frontend* typecheck in CI.

Alternatives rejected: **Astro + islands** (persistent canvas across routes fights view
transitions; not the advertised stack) · **Vite SPA** (weak SEO/OG for case studies) ·
**Next.js API routes / Server Actions as the backend** (no separation; nothing to show) ·
**Fastify / Hono** (leaner, but weaker architecture signal and no free Swagger artifact) ·
**Two separate repositories** (type sharing would require publishing a package on every
contract change — real friction for a solo operator).

### 4.2 Repository layout (Turborepo monorepo, two deployables)
```
portfolio/
  apps/
    web/                         # ──► Vercel
      app/
        layout.tsx               # fonts, tokens, <PersistentCanvas/>, <Nav/>, <Footer/>
        page.tsx                 # / — sections
        work/page.tsx            # /work index
        work/[slug]/page.tsx     # case study (MDX)
        work/[slug]/opengraph-image.tsx
        lab/  about/  resume/
        admin/                   # leads inbox + analytics (Firebase Auth, noindex)
        opengraph-image.tsx  sitemap.ts  robots.ts
      components/
        layout/    Nav, Footer, Section, Container, SkipLink, BottomSheet
        sections/  Hero, ProofStrip, SelectedWork, HowILead, Craft, Stack, Timeline, Writing, Contact
        ui/        Button, Chip, Badge, Card, KpiTile, Pillar, TimelineItem, Toc, PrevNext, Form*, Skeleton, Poster
        admin/     LeadsTable, LeadDetail, AnalyticsPanel, AssetManager
        three/
          PersistentCanvas.tsx   # fixed, aria-hidden, tiering, frameloop control
          assembly/   Assembly.tsx, assemblyMaterial.ts (shader), useFormation.ts
          formations/ monolith.ts, stream.ts, lattice.ts, orbit.ts, scatter.ts, grid.ts, ring.ts, badge.ts, index.ts
          rig/        CameraRig.ts, keyframes.ts
          physics/    PhysicsSubset.tsx (lazy)
          post/       Effects.tsx (tier 3 only)
          fallbacks/  PosterLayer.tsx, ContextLostBoundary.tsx
          lab/        View-based experiment components
      lib/
        scroll-store.ts  gpu-tier.ts  dom-to-world.ts  seo.ts  placeholders.ts
        api-client.ts            # typed, generated from packages/contracts
        formations/generators.ts
      public/  posters/  fonts/  resume.pdf  default-asset-manifest.json

    api/                         # ──► Google Cloud Run
      src/
        main.ts  app.module.ts
        modules/   content/ leads/ analytics/ assets/ writing/ admin/ health/
        common/    guards/ filters/ interceptors/ decorators/ pipes/
        db/        schema/ migrations/ seed/ migrate-cli.ts
        integrations/ resend/ gcs/ tasks/ firebase/
      test/        unit/ integration/ e2e/
      Dockerfile

    transcoder/                  # ──► Google Cloud Run (internal ingress only)
      src/  (gltf-transform, toktx, USDZ, poster render)
      Dockerfile

  packages/
    contracts/                   # Zod schemas → types → OpenAPI. Imported by BOTH apps.
    config/                      # eslint, tsconfig, tailwind presets

  content/                       # SOURCE OF TRUTH for content, read by web at build,
    profile.json  experience.json  skills.json  domains.json  lab.json
    projects/*.mdx               # and seeded into Postgres by CI

  infra/
    cloudrun/  api.yaml  transcoder.yaml
    github/    deploy-web.yml  deploy-api.yml  seed-content.yml   (Workload Identity Federation)
    docker-compose.dev.yml      # local Postgres + GCS emulator

  tests/e2e-cross/               # web ↔ api integration (contact, events, manifest)
  docs/                          # specs, design brief, asset guide
  turbo.json  pnpm-workspace.yaml
```

**Why a monorepo rather than two repos:** `packages/contracts` is imported by both apps, so a
breaking API change fails `apps/web`'s typecheck in CI *before* it can ship. Two repos would
require publishing a package on every contract change — real friction for a solo operator, and
it buys a boundary that `turbo`'s task graph already enforces.

### 4.3 Runtime data flow
```
Lenis / native scroll ──► scrollStore { y, velocity, sectionId, sectionProgress, globalProgress }
                                │                        │
              (Motion values, IO reveals) DOM   R3F useFrame reads store.getState() (no React re-render)
                                                          │
                              CameraRig keyframes ◄───────┴──────► Assembly: formation A/B + mix uniform
                                                                    │
                       DOM card rects ─► dom-to-world ─► attractor uniforms (≤ 8)
```
- Section registry: each `<Section id formation>` registers its element; an `IntersectionObserver` + `scrollY` derive `sectionId` and `sectionProgress ∈ [0,1]`.
- **Formation transition rule:** while inside section *i*, `A = formation(i)`, `B = formation(next section that declares a formation)`, `mix = smoothstep(0.65, 1.0, progress across the span)` — the morph happens in the last third of the span so each formation "holds" while its content is read. Sections that declare no formation (`timeline`, `writing`) inherit the previous one, so grid → ring morphs across timeline + writing + contact.
- Lenis is enabled only when `(pointer: fine)` matches and reduced motion is off; touch devices use native scroll. Hash links (`#work`) route through `lenis.scrollTo` when Lenis is active.

### 4.4 The Assembly — rendering design
- **Geometry:** one `InstancedMesh`; base mesh a low-poly rounded cube (≤ 24 tris) at tiers 2–3; tier 1 uses `Points` with a circular sprite shader (same attributes, cheaper).
- **Instance counts by tier:** T1 2 000 · T2 6 000 · T3 16 000. Counts are compile-time constants per tier; the store picks one at mount and never re-allocates upward at runtime.
- **Formations = attribute sets.** Each formation is a `Float32Array` bundle `{ position(3), rotation(4 quat), scale(1), color(1: gradient t) }` for N instances, generated deterministically (seeded PRNG) in a **Web Worker** on first load and cached in memory (and `Cache Storage` keyed by tier+version). Generators are pure functions in `lib/formations/generators.ts` (unit-tested via checksum snapshots).
- **GPU morphing.** The material extends `MeshStandardMaterial` via `three-custom-shader-material`: attributes `aPosA/aPosB`, `aRotA/aRotB`, `aScaleA/aScaleB`, `aColA/aColB`; uniforms `uMix`, `uTime`, `uNoiseAmp`, `uPointer(vec3)`, `uRepel`, `uAttractors[8](vec4 xyz+strength)`, `uPalette(violet, cyan)`. Vertex shader lerps/slerps A→B, adds curl-noise breathing, applies pointer repulsion and attractor pull. **Swapping formations = writing the next target into the "B" attribute buffer once (one `needsUpdate`), not per frame.** Cost per frame: one draw call + uniform updates.
- **Colour:** instance colour = gradient sample by `t` (violet→cyan) with per-section bias; emissive term drives bloom at tier 3.
- **Lighting:** drei `Lightformer` rig (no HDRI download) + a low-cost `Environment` from a 256 px generated cubemap; ACES tonemapping. Optional Poly Haven 1k HDRI (KTX2) at tier 3 only.
- **Post (tier 3 only):** Bloom (mipmap, threshold 0.8, intensity 0.6) + Vignette 0.3 + SMAA; MSAA off when post is on.
- **Physics subset (Craft section / lab):** on user opt-in, up to 300 instances are "promoted" to `@react-three/rapier` rigid bodies (a separate small `InstancedRigidBodies`); the WASM (~1 MB) loads **only then**. Reset returns them to the formation.
- **Camera rig:** perspective; vFOV 35° landscape / 45° portrait; distance `d = r / tan(vFov/2) · 1.15` from formation bounding radius `r`; for aspect > 2.2 (ultrawide) the formation's `spreadX` is scaled ×1.4 instead of pulling the camera back (keeps instances readable). Pointer parallax ±3° on pointer devices; gyroscope opt-in on touch (button; iOS permission gesture); damping via `maath/easing.damp3`.
- **Frame loop policy:** `frameloop="demand"`; `invalidate()` on scroll/pointer/resize; when idle > 2 s an interval invalidates at 30 fps for breathing; `document.hidden` or canvas off-screen → no invalidation. Tab return resumes.
- **DPR:** clamp `[1, 1.5]` on touch, `[1, 2]` on desktop; drei `PerformanceMonitor` lowers DPR (never raises above clamp) on sustained drops.
- **Tier detection:** `detect-gpu` (async, cached); default T2 until resolved; `?tier=1|2|3` override for testing; `?nogl=1` forces posters.
- **Context loss:** `webglcontextlost` → poster layer fades in, `webglcontextrestored` → re-init once; second loss → stay on posters for the session (Sentry breadcrumb).

### 4.5 Fallback ladder ("nothing empty")
| Condition | Rendered |
|---|---|
| WebGL unsupported · `?nogl=1` · GPU tier 0 · context lost twice | **Poster layer**: pre-rendered WebP/AVIF of each formation, cross-faded per section (CSS), inside the same fixed layer |
| `prefers-reduced-motion: reduce` | Poster layer, static (no cross-fade), no Lenis, no parallax; DOM reveals become instant/opacity-only |
| JS disabled | `<noscript>` poster of the monolith behind fully rendered HTML |
| Image missing (avatar, project media) | Gradient + monogram/initials tile generated in CSS |
| Data missing (metrics, quotes, earlier roles) | Content marked `placeholder: true` renders realistic copy; `pnpm lint:content` lists all placeholders; testimonials block is the one exception — it hides unless at least one real quote exists |
| Slow network | Skeletons match final layout dimensions (zero CLS); canvas fades in when ready, DOM never waits |
| Medium RSS unavailable | The API serves the last-good `writing_cache` rows; if the API is also unreachable, three designed "writing" cards link to the Medium profile |
| **API unreachable** | Nothing visible changes. Content is static, so every page renders in full; the contact form swaps its submit button for a copyable `mailto:` link; the analytics beacon fails silently; the asset manifest falls back to the committed `default-asset-manifest.json`; public view counts are omitted rather than shown as zero |

Posters are produced by a build script (`scripts/render-posters.ts`, Playwright headless → screenshots of each formation at 1600×1000 and 800×1200) and committed to `public/posters/`. They are also the OG image backgrounds.

### 4.6 Content model (Velite + Zod)

These schemas live in `packages/contracts` and are the **single definition** used three ways:
`apps/web` validates and types `content/` through Velite at build time; `apps/api` derives its
DTOs and OpenAPI document from the same schemas via `nestjs-zod`; and the CI seed job validates
against them before writing to Postgres. A field added in one place cannot silently diverge in
the others.

```ts
Profile     { name, headline, sub, roles: {org,title,url}[], location, email, links: {label,url,kind}[], availability, kpis: {label,value,placeholder?}[] }
Project     { slug, name, domain: DomainId, role, period: {from,to?}, summary, problem, approach, architecture (mdx), decisions: {decision,why,tradeoff}[], outcome: {label,value,placeholder?}[], stack: string[], visibility: 'public'|'private'|'client', links?: {label,url}[], media?: {src,alt,kind}[], featured: boolean, order: number, formation: 'badge'|FormationId, placeholder?: boolean }
Experience  { org, title, period, location?, highlights: string[], placeholder?: boolean }
Domain      { id, label, blurb, accent: 'violet'|'cyan' }
SkillGroup  { id, label, items: {name, level?: 'core'|'working'|'familiar'}[] }
LabExperiment { slug, title, kind: '3d'|'physics'|'shader'|'ar', blurb, minTier: 1|2|3, component: string, placeholder?: boolean }
Writing     { title, url, date, source: 'medium'|'other', placeholder?: boolean }
```
KPIs such as "Domains shipped" are **derived** (count of distinct domains across non-placeholder projects) so numbers never drift from content.

### 4.7 Contact pipeline (now a lead pipeline, owned by the API)
Client form (name, email, message, honeypot `company_website`) → `POST /v1/contact` on the API
with an `Idempotency-Key` → Zod validation from the shared contract → honeypot and
submission-timing check → spam score → rate limit (5 per 10 min per IP hash) → **persisted to
`leads`** → Resend to the owner's public address → success state.

Two properties this buys over the previous Server Action design: the enquiry is **durable and
workable** (an inbox with status, notes and an audit trail, rather than an email that can be
lost), and if Resend is down the visitor still sees success — because the message genuinely was
received. Delivery retries in the background.

Failure handling: any API failure falls back to a copyable `mailto:` link, so the contact path
never dead-ends. Sentry captures failures with the message body redacted. The visitor's IP is
hashed for rate limiting and never stored.

### 4.8 SEO & sharing
Metadata API on every route; `generateMetadata` for case studies; OG images via `ImageResponse` composited on formation posters; JSON-LD `Person` (name, jobTitle[], worksFor[], sameAs[] for LinkedIn/GitHub/X/Medium) on `/`, `CreativeWork` per case study; `sitemap.ts`, `robots.ts`; canonical URLs; `lang="en"`.

### 4.9 Security & privacy
Strict CSP — `connect-src` allows exactly the API origin, Sentry ingest and Firebase Auth, and
nothing else. No third-party trackers; analytics are first-party and cookieless, so there is no
consent banner to design. `Referrer-Policy: strict-origin-when-cross-origin`;
`Permissions-Policy` allowing `xr-spatial-tracking` and `gyroscope` on self only.

Across the boundary: the API enforces a strict CORS origin allowlist (production origin, preview
deploys by regex, localhost in dev) with credentials off. The web app holds **no** API secrets —
every public endpoint is unauthenticated by design, and the admin surface authenticates with a
Firebase ID token obtained in the browser. Backend secrets live in Secret Manager; CI
authenticates to GCP by Workload Identity Federation, so no service-account key exists to leak.

### 4.10 The frontend ↔ backend contract

**The load-bearing rule: a cold visitor's page render never touches the API.** Everything a
first-time visitor sees is statically generated from `content/` at build time. This is what
keeps LCP ≤ 2.0 s while the API runs at `min-instances=0` — a cold Cloud Run container is never
in front of a human being.

| Call | When | If it fails |
|---|---|---|
| `POST /v1/contact` | User submits the form | Falls back to a copyable `mailto:` link |
| `POST /v1/events` | Analytics beacon, batched, `sendBeacon`/`keepalive` | Fails silently; never awaited |
| `GET /v1/assets/manifest` | Once, after hydration, before loading any GLB | Uses the committed `default-asset-manifest.json` |
| `GET /v1/projects/:slug/stats` | Optional view count on case studies | Element is omitted |
| Admin endpoints | `/admin` only, behind Firebase Auth | Error state in the admin UI |

**Type safety.** `packages/contracts` holds Zod schemas as the single definition. `apps/api`
generates its DTOs and OpenAPI document from them via `nestjs-zod`; `apps/web` generates its
typed client from the same schemas. A breaking change fails `apps/web`'s typecheck in CI, and
the committed OpenAPI snapshot makes the break visible as a diff in the PR.

**Content flow.** `content/` in git is the source of truth. `apps/web` reads it directly at
build (no network). CI separately seeds it into Postgres (`--dry-run` then `--apply`) so the
API can serve it as a public, documented, ETagged read API for the admin UI and third parties.
Content therefore ships through pull requests and code review — which is both safer and a
better story than a CMS.

**Independent deployability.** `apps/web` and `apps/api` deploy on separate pipelines to
separate platforms. Either can ship without the other. The web app is designed to be fully
functional with the API completely offline — verified by a Playwright suite that runs with the
API origin blackholed.

---

## 5. Experience design

### 5.1 Breakpoints & layout system
| Token | Min width | Layout |
|---|---|---|
| `xs` | 360 | Single column; bottom-sheet nav; hero text bottom-anchored under the formation; bento stacks |
| `sm` | 640 | Same, larger type |
| `md` | 768 (tablet) | 2-col bento and pillars; TOC hidden |
| `lg` | 1024 | Desktop nav; 12-col grid; sticky TOC on case studies |
| `xl` | 1280 | Bento asymmetric 2-col |
| `2xl` | 1536 | Content max-width 1440 (bento 1600) |
| `3xl` | 1920 | Same widths, larger section padding, formation spread ×1.2 |
| `4xl` | 2560+ (21:9 / 32:9) | Content stays centred; canvas fills; formation spread ×1.4; hero splits text-left / artefact-right |

Fluid type via `clamp()`; prose measure 65–75 ch; section padding `clamp(4rem, 10vw, 10rem)`; `100svh/dvh` units; `env(safe-area-inset-*)`; tap targets ≥ 44 px; no hover-only affordances (every hover has a tap/focus equivalent).

### 5.2 Motion principles
- 3D and reveals are **scroll-linked**, not time-linked. The only time-based motion is (a) the one-off load-in where the monolith assembles from a scattered cloud (≈ 1.2 s, skipped under reduced motion) and (b) the Assembly's idle breathing (30 fps when idle).
- UI durations 120 / 200 / 320 / 560 ms; ease-out `cubic-bezier(.2,.8,.2,1)`.
- No splash/loader screen: DOM paints instantly, canvas fades in ≤ 1 s later; a 2 px progress hairline at the top while formations generate.
- Reduced motion honoured globally (see §4.5).

### 5.3 Accessibility
Canvas `aria-hidden="true"` with a one-time visually-hidden note ("Decorative 3D visualisation; all content is available as text"). Skip link, visible focus rings (cyan, 2 px, offset 2 px), AA contrast on all text over dark and over glass surfaces, semantic landmarks, headings in order, form labels + errors announced, keyboard-operable bottom sheet and command palette, `prefers-reduced-motion` and `prefers-contrast` respected, physics/AR controls are real buttons with state.

### 5.4 Interaction inventory (v1)
Hover/focus a project card → nearby instances drift toward it (≤ 8 attractors) · Craft "Enable physics" / "Reset" · "View in AR" (feature-detected) · Perf HUD toggle (`?debug=1` or footer link) · Domain filter on `/work` (URL-synced) · Copy-email button · Bottom-sheet nav · Gyro opt-in button (touch) · Command palette (v1.5).

**Silent interactions** (no UI, never block anything): a batched analytics beacon fires on
section reach, case-study scroll depth and outbound link clicks, via `sendBeacon`/`keepalive` so
it survives page unload. It is never awaited, never shows a spinner, and its failure is
invisible. `navigator.doNotTrack` suppresses it entirely.

### 5.5 Copy deck v1 (real facts from the public profile; placeholders flagged)
- **Eyebrow:** Tech Lead @ Data Age · Senior Software Engineer @ Rapidev Labs · Harare, Zimbabwe
- **H1:** I lead teams that ship production software — and I make the web move.
- **Sub:** Hospital operations, learning platforms, creator-discovery tooling, procurement systems. Technical direction, code review and mentorship by day; real-time 3D on the web that holds frame rate on a mid-range phone.
- **KPI trio (hero):** 5+ years · 8 domains shipped (derived — renders **7** until the AR case study is real, because placeholder projects are excluded from the count) · WebGL / real-time 3D specialism
- **Proof-strip KPI tiles:** Production platforms led/shipped: 10 `[placeholder — confirm]` · Domains: derived · Roles: Tech Lead + Senior SWE · Concurrent production systems monitored: `[placeholder]`
- **How I Lead pillars:** *Technical direction* (architecture standards, reversible migrations — dry-run/apply/rollback, honest error handling) · *Code review & standards* (typed backends, enforced security rules, conventional commits, staged builds) · *Mentorship & delivery* (engineers growing through review, accountable for how it's built not just that it ships).
- **Craft statement:** The thing that surprises people: WebGL that runs at 60 fps on a mid-range phone. Rigid-body physics, spatial audio, mobile joystick controls — and the performance budgets that make it viable.
- **Contact:** Open to consulting & collaboration. Leading a build, untangling an architecture, or making something run at 60 fps — if it's an interesting problem, I'd like to hear about it.
- **Colophon:** Built with Next.js, React Three Fiber and Rapier. One draw call. Holds 60 fps on a mid-range phone.

### 5.6 Case-study roster v1
| Featured on `/` | Project | Domain | Visibility | Status |
|---|---|---|---|---|
| ✔ | heycreator | Creator economy | private | real |
| ✔ | Vantage Health System | Healthcare | private | real |
| ✔ | gabar | Interactive 3D | private/unlisted | real |
| ✔ | learnx | Education | private | real |
| ✔ | AR project | AR/XR | — | **placeholder — owner input required** |
| ✔ | PR-Pulse | Developer tooling | public (github.com/JxstWieslaw/PR-Pulse) | real |
| | we-assist-you | Social services | private | real |
| | purchase-requisition | Procurement / ERP | private | real |
| | youth-care | Social services `[confirm]` | private | placeholder details |
| | angelo-crown | `[confirm domain]` | private | placeholder details |

### 5.7 Placeholder policy
Placeholders are **realistic, on-voice copy** (never "lorem ipsum", never blank) carrying `placeholder: true`. `pnpm lint:content` prints them; CI warns (does not fail) so the site is always shippable. The only hidden-when-missing block is testimonials (fabricated quotes are not acceptable on a resume site).

### 5.8 3D assets
v1 needs **no external 3D assets** — the Assembly is procedural. Optional: a modelled hero
artefact (GLB ≤ 50 k tris, ≤ 2 textures at 2048) that replaces or sits inside the monolith
formation, and a USDZ for iOS AR.

From **M4 this stops being a manual step**: the owner uploads a raw GLB through the admin
surface, and the transcoder service produces the Meshopt-compressed GLB, per-tier LODs, KTX2
textures, the USDZ and a render poster automatically. `GET /v1/assets/manifest` then serves each
visitor exactly the variant their GPU tier and codec support call for. Before M4, the same
transformations run by hand with the commands in `docs/3d-asset-sourcing.md` — that document
also covers sourcing and licensing, which the pipeline does not automate (licence is a required
field at upload and feeds the site colophon).

---

## 6. Performance budget (CI-enforced)

| Metric | Budget |
|---|---|
| HTML (`/`) | ≤ 30 KB gz |
| Critical CSS | inline ≤ 14 KB |
| Fonts | 2 variable families, subset latin, ≤ 90 KB total, `display: swap` + `size-adjust` fallbacks |
| JS initial (non-3D) | ≤ 120 KB gz |
| three + R3F + drei chunk | ≤ 200 KB gz, loaded after hydration via dynamic import; posters visible until then |
| Rapier WASM | on demand only (Craft opt-in / lab) |
| Total transfer `/` | ≤ 900 KB desktop T3 · ≤ 600 KB mobile T2 |
| LCP / INP / CLS | ≤ 2.0 s / ≤ 200 ms / ≤ 0.05 (4G, Moto G-class) |
| Frame time | ≤ 16.6 ms desktop T3 · ≤ 33 ms mobile T1 |
| Lighthouse mobile | ≥ 95 ×4 |

Enforcement: `size-limit` on chunks, Lighthouse CI on every preview deploy with the budgets above, `next/bundle-analyzer` report artefact in CI.

**These budgets are unchanged by the backend split, and that is the point.** No API call sits in
the render path, so nothing here depends on Cloud Run's latency or cold-start behaviour. The
API carries its own budgets (p95 ≤ 80 ms cached GET, ≤ 400 ms `POST /v1/contact`, cold start
≤ 2 s, ≤ $10/month) in the [API service spec §11](2026-08-15-api-service-design.md).

---

## 7. Testing strategy
- **Unit (Vitest):** formation generators (deterministic seed → checksum snapshots per tier), `dom-to-world` projection, scroll-store section/progress derivation, content schemas, placeholder linter.
- **Component (RTL):** every section renders all slots with (a) real content, (b) placeholder content, (c) missing media → fallbacks present, no empty containers.
- **E2E (Playwright, Chromium + WebKit + Android emulation):** routes render; nav & hash links; contact validation + honeypot; `?nogl=1` shows posters; reduced-motion shows static posters and no Lenis; AR/physics buttons feature-detect correctly; canvas mounts and reports ≥ 1 frame via a test hook (`window.__portfolioPerf` in test mode).
- **Visual regression:** Playwright `toHaveScreenshot` for DOM at 390 / 834 / 1440 / 2560 with the canvas masked; posters snapshot separately.
- **Perf:** Lighthouse CI budgets; a manual device pass on a mid-range Android before launch.
- **A11y:** `@axe-core/playwright` on every route; keyboard walkthrough checklist.
- **API-offline suite (cross-cutting):** the full E2E run repeated with the API origin blackholed — every route must render, the contact form must fall back to `mailto:`, the asset manifest must fall back to the committed default, and no unhandled rejection may reach the console. This is the test that keeps the separation honest.
- **Contract:** the OpenAPI document generated from `packages/contracts` is snapshot-committed, so a breaking change shows up as a reviewable diff; both apps typecheck against the same schemas in one `turbo run typecheck`.
- **Backend testing** (unit, integration on a real Neon branch, E2E, load, security) is specified in the [API service spec §10](2026-08-15-api-service-design.md).

---

## 8. Delivery plan (milestones for the implementation plan)
| Milestone | Outcome | Ship-able? |
|---|---|---|
| **M0 Foundations** | Turborepo + pnpm workspaces, `packages/contracts` and `packages/config`, tokens, fonts, content schema + v1 content, layout, nav, footer, all `/` sections in DOM with **posters** (no WebGL, no API yet), a11y baseline, CI with budgets | **Yes** — a complete 2D site with 3D posters |
| **M1 API service** | NestJS scaffold, Neon, Drizzle + reversible migration CLI (dry-run/apply/rollback), content seed from git, public read endpoints, OpenAPI + Swagger published, Cloud Run deploy via Workload Identity Federation, health/readiness | Yes — web unchanged; the API is purely additive |
| **M2 The Assembly** | Instanced system, 7 formations, worker generation, scroll store, camera rig, tiering, fallback ladder, context-loss handling | Yes |
| **M3 Depth & dynamic** | `/work` + case-study template + MDX content, `/lab` (View-based), `/about`, `/resume`, OG/SEO/JSON-LD, **lead pipeline wired to the API**, analytics beacon + ingestion, writing cache | Yes |
| **M4 Admin & assets** | Firebase Auth admin, leads inbox, analytics dashboard, GCS signed uploads, Cloud Tasks transcoder (LODs, KTX2, USDZ, posters), asset manifest negotiation, AR in the lab | Yes |
| **M5 Polish & launch** | Card attractors, physics opt-in, post at T3, device perf pass, visual regression, a11y audit, API-offline suite, domains (`<domain>` + `api.<domain>`), Search Console, colophon numbers | Launch |

Two properties of this ordering are deliberate. **M0 ships before a single shader or endpoint
exists**, so both the 3D work and the backend are additive risk rather than blocking risk. And
**M1 lands the API before anything depends on it** — the service is deployed, documented and
observable while the site is still entirely static, so the first thing that depends on it (M3's
lead pipeline) is talking to something already proven in production.

---

## 9. Risks & mitigations
| Risk | Mitigation |
|---|---|
| Mobile GPU thermal throttling → frame drops | Tiering + `PerformanceMonitor` DPR step-down + 30 fps idle policy |
| iOS Safari memory limits / context loss | Small textures, no MSAA when post is on, DPR ≤ 1.5 on touch, context-loss ladder |
| Lenis vs. native anchors / a11y | Lenis on pointer devices only; hash routing via `scrollTo`; off under reduced motion |
| Font FOUT / CLS | `next/font`, `size-adjust` fallbacks; canvas is out-of-flow (fixed) so CLS = 0 |
| Scope creep in 3D | Procedural v1; modelled artefact only as v2; each formation is a pure function so adding/removing one is local |
| Placeholder copy leaking to production as fact | `lint:content` report in CI; placeholders visually identical but listed; owner sign-off gate at M5 |
| Public GitHub stats mis-representing seniority | Stats not shown on `/`; footer colophon uses build-time numbers from content, not GitHub API |
| **Splitting the stack adds a second failure domain** | The web app is designed to work with the API entirely offline; the API-offline Playwright suite enforces it on every CI run |
| **Cloud Run cold start in front of a user** | Content is git-first, so no page render waits on the API; the only callers are a form submit (pending state), a fire-and-forget beacon, and a post-hydration manifest. `min-instances=1` is a ~$6/month switch if the admin feels slow |
| **Two deployables drift out of contract** | `packages/contracts` is imported by both; a break fails the web typecheck in CI, and the committed OpenAPI snapshot surfaces it as a PR diff |
| **The separation reads as over-engineering** | The API owns four real jobs (leads, analytics, asset pipeline, writing cache) and publishes its own OpenAPI docs; the decision log states plainly what was rejected and why. Endpoint count stays deliberately lean |
| **GCP cost creep** | Scale-to-zero on both Cloud Run services, Neon launch tier, GCS lifecycle rules, and a billing budget alert; target ≤ $10/month |

---

## 10. Inputs required from the owner (with defaults so nothing blocks)
| Input | Default until supplied |
|---|---|
| AR project details (name, platform — ARKit/ARCore/WebXR/8th Wall/Unity/Vuforia — role, outcome, media) | Placeholder case study "AR product visualiser" flagged `placeholder` |
| youth-care & angelo-crown domains, roles, outcomes | Placeholder details, listed under "All work" only |
| Per-project metrics | Qualitative outcomes; metric tiles flagged `placeholder` |
| Earlier roles 2020 → Data Age/Rapidev | Timeline shows current roles + one placeholder "Earlier engineering roles (2020–)" |
| Photo / avatar | Gradient + "WS" monogram |
| Domain name | Vercel preview domain; suggestions to check: `wieslaw.dev`, `samushonga.dev`, `wieslawsamushonga.com` |
| Public contact email for the site | The address on the GitHub README |
| `resume.pdf` | Print stylesheet + `window.print()` |
| Optional GLB hero artefact / USDZ | Procedural monolith |
| **GCP project** (or approval for me to create one) + billing account | Blocks M1 deploy only; the API runs locally against Docker Postgres until then |
| **Neon project** — I have Neon tooling in-session and can provision on request | Local Postgres via `docker-compose.dev.yml` |
| **Firebase project** for admin auth | Blocks M4 admin only; M0–M3 need no auth |
| Admin email address for the Firebase account | The public contact address |

---

## 11. Decision log
| Decision | Chosen | Rejected | Reason |
|---|---|---|---|
| 3D ambition | Persistent scroll-driven layer | Hero-only accents · Immersive world | Prominent everywhere, still SEO/a11y-first; no modelled assets required |
| Framework | Next.js App Router | Astro · Vite SPA | Persistent canvas + MDX/OG + advertised stack |
| 3D concept | "The Assembly" — one instanced system morphing per section | Multiple bespoke scenes | One draw call, coherent narrative ("someone who builds"), zero assets |
| Morph execution | GPU (attribute A/B + mix uniform) | CPU per-instance lerp | Frame cost independent of N |
| Scroll | Native + Lenis (pointer only) + Zustand store | drei `ScrollControls` | Keeps document scroll, a11y, deep links |
| Animation lib | Motion only | Motion + GSAP | One dependency, one mental model |
| Content | Velite (MDX/JSON + Zod) | Contentlayer · CMS | Maintained; typed; no runtime |
| Theme | Dark-first, tokens light-ready | Dual theme in v1 | Brand is dark; light is a token swap later |
| Testimonials | Hidden unless real | Placeholder quotes | Fabricated praise is unacceptable on a resume site |
| Loader | None (DOM-first, canvas fades in) | Splash with progress | LCP and honesty |
| **System topology** | Two deployables: `apps/web` on Vercel, `apps/api` on Cloud Run | Single Next.js app with Server Actions | The backend owns four real jobs and publishes its own OpenAPI docs — a separation worth showing rather than a cosmetic one |
| **Backend scope** | Dynamic state only; content stays git-first | Content in Postgres, web as pure presentation | Keeps the API out of the render path so LCP ≤ 2.0 s survives; content ships through code review |
| **Repo topology** | Turborepo monorepo | Two repositories | Shared Zod contracts fail the web typecheck on a break, in CI, before shipping |
| **Backend framework** | NestJS | Fastify+Zod · Hono · Express | Modules/DI/guards read as deliberate architecture; `@nestjs/swagger` turns the API into a publishable artifact |
| **API host** | Google Cloud Run + Neon Postgres | Vercel Functions · Render · Fly · Railway · Cloud SQL | A genuinely separate platform makes the separation real; scale-to-zero costs nothing idle; Neon adds branch-per-PR |
| **Admin auth** | Firebase Auth + `admins` table | Hand-rolled JWT with refresh rotation | Choosing managed identity is the better engineering call *and* the better signal than rolling auth |
| **Firestore** | Not used | Firestore alongside Postgres | Two databases for one small service is indecision, not architecture |
| **Analytics** | First-party, cookieless, no IP stored | GA4 / third-party | Privacy is a values signal on a site selling judgement — and no consent banner to design |
