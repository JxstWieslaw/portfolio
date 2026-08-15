# Portfolio Website — Architecture & Design Specification

| | |
|---|---|
| **Owner** | Wieslaw Samushonga — Tech Lead @ Data Age · Senior Software Engineer @ Rapidev Labs |
| **Date** | 2026-08-15 |
| **Status** | Approved design, pre-implementation |
| **Companion docs** | [`docs/claude-design-brief.md`](../../claude-design-brief.md) (paste into Claude Design) · [`docs/3d-asset-sourcing.md`](../../3d-asset-sourcing.md) |
| **Repo location** | `JxstWieslaw/portfolio/` (greenfield) |

---

## 0. Executive summary

A single-page-first portfolio with deep pages, built in the stack it advertises (TypeScript · Next.js · React Three Fiber), whose signature is a **persistent, scroll-driven WebGL layer** — "The Assembly" — one instanced-mesh system that morphs between section-specific formations as the visitor scrolls. The page remains a normal, indexable, accessible HTML document; the 3D is a layer behind it, never a gate in front of it.

The site's job is to make Wieslaw **marketable to three audiences at once** — hiring managers/CTOs skimming on a phone, clients evaluating a consultant, and engineers judging craft — by leading with **leadership + delivery** (named production platforms across eight domains, architecture decisions, how he runs a team) and using **real-time 3D/AR as the differentiating proof of craft**. The site itself is that proof: it must hold 60 fps on a mid-range phone.

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

### 1.4 Non-goals (v1)
- Light theme (tokens are structured for it; not shipped).
- CMS / admin UI (content is typed MDX/JSON in the repo).
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
/opengraph-image       Default OG (route-level generators for /work/[slug])
/sitemap.xml, /robots.txt
```

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
4. **AR: place the artefact** — WebXR (`@react-three/xr`) on Android Chrome; iOS fallback via USDZ Quick Look (`<a rel="ar">`) using a converted GLB (see asset guide). Non-capable devices see a poster + "How AR works here" note.
5. Placeholder cards ("Next experiment") — designed, not empty.

### 3.4 `/about`, `/resume`
`/about`: narrative (300–500 words), photo slot (gradient+monogram fallback), values, "how I work", full timeline. `/resume`: same content model rendered for print (`@media print`), "Download PDF" (static `public/resume.pdf` supplied by owner; if absent, the button triggers `window.print()`).

### 3.5 Navigation
Sticky top bar that condenses on scroll: monogram → section links (desktop) → "Let's talk" CTA. Mobile: bottom-sheet menu (thumb-reachable) with section links + socials. `⌘K` command palette (`cmdk`) for sections/projects/links — v1.5, not blocking.

---

## 4. Technical architecture

### 4.1 Stack (decision: Approach A)
| Concern | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router), TypeScript strict** | Persistent canvas in root layout; MDX/ISR case studies; `next/og`; the advertised stack |
| Styling | **Tailwind CSS v4** + CSS custom-property tokens | Tokens shared by DOM and shader uniforms |
| 3D | **three · @react-three/fiber · @react-three/drei · @react-three/rapier · @react-three/postprocessing · maath · detect-gpu** | Owner's proven toolchain (gabar) |
| State | **Zustand** — one `scrollStore` is the single source of truth for DOM and WebGL | Avoids DOM/GL drift |
| DOM motion | **Motion** (`motion/react`) — one animation library only | Scroll-linked reveals; no GSAP duplication |
| Smooth scroll | **Lenis** (pointer devices only; native on touch; off under reduced motion) | Coupled camera feel without hijacking scroll |
| Content | **Velite** (MDX + JSON → typed, Zod-validated) | Maintained; build-time schema |
| Forms | Server Action + Zod + honeypot + rate limit + **Resend** | No client secrets; `mailto:` fallback |
| Hosting | **Vercel** — Analytics, Speed Insights, Firewall rate-limit rule, OG image route | Owner's platform |
| Observability | **Sentry** (browser+server, `tracesSampleRate 0.1`, replay off) | Owner already uses Sentry |
| Testing | Vitest · React Testing Library · **Playwright** (e2e + visual) · **Lighthouse CI** · `size-limit` | Budgets enforced in CI |
| Tooling | ESLint, Prettier, Husky + conventional commits, GitHub Actions | Owner's practice |

Alternatives rejected: **Astro + islands** (persistent canvas across routes fights view transitions; not the advertised stack) · **Vite SPA** (weak SEO/OG for case studies).

### 4.2 Repository layout
```
portfolio/
  app/
    layout.tsx                # fonts, tokens, <PersistentCanvas/>, <Nav/>, <Footer/>
    page.tsx                  # / — sections
    work/page.tsx             # /work index
    work/[slug]/page.tsx      # case study (MDX)
    work/[slug]/opengraph-image.tsx
    lab/page.tsx
    about/page.tsx
    resume/page.tsx
    opengraph-image.tsx
    sitemap.ts  robots.ts
    actions/contact.ts        # server action
  components/
    layout/   Nav, Footer, Section, Container, SkipLink, BottomSheet
    sections/ Hero, ProofStrip, SelectedWork, HowILead, Craft, Stack, Timeline, Writing, Contact
    ui/       Button, Chip, Badge, Card, KpiTile, Pillar, TimelineItem, Toc, PrevNext, Form*, Skeleton, Poster
    three/
      PersistentCanvas.tsx    # fixed, aria-hidden, tiering, frameloop control
      assembly/  Assembly.tsx, assemblyMaterial.ts (shader), useFormation.ts
      formations/ monolith.ts, stream.ts, lattice.ts, orbit.ts, scatter.ts, grid.ts, ring.ts, badge.ts, index.ts
      rig/       CameraRig.ts, keyframes.ts
      physics/   PhysicsSubset.tsx (lazy)
      post/      Effects.tsx (tier 3 only)
      fallbacks/ PosterLayer.tsx, ContextLostBoundary.tsx
      lab/       View-based experiment components
  content/
    profile.json  experience.json  skills.json  domains.json  lab.json  writing.json
    projects/*.mdx
  lib/
    scroll-store.ts  gpu-tier.ts  dom-to-world.ts  seo.ts  placeholders.ts  formations/generators.ts
  public/  posters/  models/  fonts/  resume.pdf
  tests/   unit/  e2e/  visual/
  docs/    (this spec, claude-design-brief.md, 3d-asset-sourcing.md)
```

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
| Medium RSS unavailable at build | Three designed "writing" cards linking to the Medium profile |

Posters are produced by a build script (`scripts/render-posters.ts`, Playwright headless → screenshots of each formation at 1600×1000 and 800×1200) and committed to `public/posters/`. They are also the OG image backgrounds.

### 4.6 Content model (Velite + Zod)
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

### 4.7 Contact pipeline
Client form (name, email, message, honeypot `company_website`) → Server Action `sendMessage` → Zod validation → honeypot check → rate limit (Vercel Firewall rule: 5/10 min per IP; fallback in-memory limiter for local) → Resend to the owner's public address (`content/profile.json → email`) → success state with a copyable `mailto:` fallback on any failure. No PII persisted. Sentry captures failures with the message body redacted.

### 4.8 SEO & sharing
Metadata API on every route; `generateMetadata` for case studies; OG images via `ImageResponse` composited on formation posters; JSON-LD `Person` (name, jobTitle[], worksFor[], sameAs[] for LinkedIn/GitHub/X/Medium) on `/`, `CreativeWork` per case study; `sitemap.ts`, `robots.ts`; canonical URLs; `lang="en"`.

### 4.9 Security & privacy
Strict CSP (self + Vercel Analytics + Sentry ingest), no third-party trackers, cookieless analytics, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` allowing `xr-spatial-tracking` and `gyroscope` on self only. Secrets (Resend, Sentry DSN) server-side / Vercel env.

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
v1 needs **no external 3D assets**. Optional v2: a modelled hero artefact (GLB ≤ 50 k tris, ≤ 2 textures at 2048, Draco/Meshopt via `gltf-transform`, KTX2 textures) that replaces or sits inside the monolith formation, and a USDZ for iOS AR. Sourcing, licensing and pipeline rules are in `docs/3d-asset-sourcing.md`.

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

---

## 7. Testing strategy
- **Unit (Vitest):** formation generators (deterministic seed → checksum snapshots per tier), `dom-to-world` projection, scroll-store section/progress derivation, content schemas, placeholder linter.
- **Component (RTL):** every section renders all slots with (a) real content, (b) placeholder content, (c) missing media → fallbacks present, no empty containers.
- **E2E (Playwright, Chromium + WebKit + Android emulation):** routes render; nav & hash links; contact validation + honeypot; `?nogl=1` shows posters; reduced-motion shows static posters and no Lenis; AR/physics buttons feature-detect correctly; canvas mounts and reports ≥ 1 frame via a test hook (`window.__portfolioPerf` in test mode).
- **Visual regression:** Playwright `toHaveScreenshot` for DOM at 390 / 834 / 1440 / 2560 with the canvas masked; posters snapshot separately.
- **Perf:** Lighthouse CI budgets; a manual device pass on a mid-range Android before launch.
- **A11y:** `@axe-core/playwright` on every route; keyboard walkthrough checklist.

---

## 8. Delivery plan (milestones for the implementation plan)
| Milestone | Outcome | Ship-able? |
|---|---|---|
| **M0 Foundations** | Scaffold, tokens, fonts, content schema + v1 content, layout, nav, footer, all `/` sections in DOM with **posters** (no WebGL yet), a11y baseline, CI with budgets | **Yes** — a complete 2D site with 3D posters |
| **M1 The Assembly** | Instanced system, 7 formations, worker generation, scroll store, camera rig, tiering, fallback ladder, context-loss handling | Yes |
| **M2 Depth** | `/work` + case-study template + MDX content, `/lab` (View-based), `/about`, `/resume`, contact pipeline, OG/SEO/JSON-LD | Yes |
| **M3 Polish** | Card attractors, physics opt-in, AR in lab, post at T3, perf tuning on devices, visual regression, a11y audit | Yes |
| **M4 Launch** | Domain, analytics, Search Console, poster regeneration, colophon numbers, README | Launch |

M0 first is deliberate: the site is publishable before a single shader is written, so the 3D work is additive risk, not blocking risk.

---

## 9. Risks & mitigations
| Risk | Mitigation |
|---|---|
| Mobile GPU thermal throttling → frame drops | Tiering + `PerformanceMonitor` DPR step-down + 30 fps idle policy |
| iOS Safari memory limits / context loss | Small textures, no MSAA when post is on, DPR ≤ 1.5 on touch, context-loss ladder |
| Lenis vs. native anchors / a11y | Lenis on pointer devices only; hash routing via `scrollTo`; off under reduced motion |
| Font FOUT / CLS | `next/font`, `size-adjust` fallbacks; canvas is out-of-flow (fixed) so CLS = 0 |
| Scope creep in 3D | Procedural v1; modelled artefact only as v2; each formation is a pure function so adding/removing one is local |
| Placeholder copy leaking to production as fact | `lint:content` report in CI; placeholders visually identical but listed; owner sign-off gate at M4 |
| Public GitHub stats mis-representing seniority | Stats not shown on `/`; footer colophon uses build-time numbers from content, not GitHub API |

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
