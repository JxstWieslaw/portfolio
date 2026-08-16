# Design Brief — Wieslaw Samushonga Portfolio

> **How to use:** paste this whole document into Claude Design as the opening prompt. It is self-contained. Sections marked **FIXED** are architectural decisions already made — design within them. Sections marked **OPEN** are yours to decide; propose and justify.

---

## 1. What this is

A personal portfolio / resume site for **Wieslaw Samushonga** — Tech Lead at Data Age and Senior Software Engineer at Rapidev Labs, based in Harare, Zimbabwe. He leads technical teams and ships production platforms across eight domains (healthcare, education, creator economy, procurement/ERP, social services, developer tooling, interactive 3D, AR/XR). His differentiating specialism is **real-time 3D on the web (WebGL / React Three Fiber) that holds 60 fps on a mid-range phone**.

**Positioning (FIXED):** leadership and delivery first; 3D/AR as proof of craft — *not* a "creative developer" site. Think: the calm confidence of a senior architect's document, with one extraordinary moving thing behind it.

**Headline (FIXED):** *I lead teams that ship production software — and I make the web move.*

**Audiences:** (1) hiring managers/CTOs skimming on a phone — need title, seniority, domains, leadership evidence in 10 s; (2) clients evaluating a consultant — need domains, outcomes, availability, contact; (3) engineers — need craft, architecture, perf discipline.

**Tone:** precise, concrete, unhurried. Concrete nouns over adjectives ("reversible migrations — dry-run, apply, rollback", not "robust"). Never lead with GitHub star counts.

---

## 2. The one big idea you are designing around (FIXED)

A **persistent WebGL layer** sits *behind* the whole home page: **"The Assembly"** — thousands of small cubes (one instanced mesh) that **morph between formations as the visitor scrolls**:

| Section | Formation | Feeling |
|---|---|---|
| Hero | **Monolith** — cubes assemble from a scattered cloud into a tall faceted form on load; breathes; repelled by the pointer | "someone who builds" |
| Proof strip | **Stream** — a thin horizontal river of cubes | breadth, flow |
| Selected Work | **Lattice** — a floating grid; cubes drift toward the project card you hover | the system responds to you |
| How I Lead | **Orbit** — a dense core with three tilted rings of satellites | a team around a centre |
| Craft (3D & AR) | **Scatter/physics** — cubes drop under real physics; you can flick them | play, proof |
| Stack | **Grid** — a slowly rotating cubic lattice | order |
| Contact | **Ring** — a calm torus | resolution |

Colours run along a **violet → cyan gradient**. The layer is decorative: all content is real HTML in front of it. It has a complete fallback ladder — pre-rendered **posters** of each formation for no-WebGL / low-end GPU / reduced-motion. **You will design the posters' art direction and how content sits on top of the layer** (contrast, glass surfaces, spacing) — you will not design the 3D itself.

Deep pages (case studies, lab, about, resume) have a compact 3D "badge" or poster in the header only.

---

## 3. Brand tokens (FIXED base — extend, don't replace)

### Colour (dark theme; light theme is out of scope but keep tokens semantic)
```
--bg-0        #0D1117   page
--bg-1        #11161D   raised
--bg-2        #161B22   surface / card
--line-1      #1F2937   subtle border
--line-2      #30363D   strong border
--fg-0        #F0F6FC   headings
--fg-1        #C9D1D9   body
--fg-2        #8B949E   muted
--fg-3        #6E7681   faint / dates
--violet-500  #7C3AED   leadership / direction accent
--violet-400  #A78BFA   leadership accent (text-safe on dark)
--violet-300  #C4B5FD
--cyan-400    #22D3EE   craft / motion accent
--cyan-300    #67E8F9
--gradient    linear-gradient(90deg, #7C3AED 0%, #22D3EE 100%)
--success #3FB950  --warning #D29922  --danger #F85149
```
**Semantic rule (FIXED):** violet = leadership/architecture (How I Lead is violet-led); cyan = craft/3D (Craft and Lab are cyan-led). Gradient only on the Assembly, hero display text (optional clip), and primary CTA hover.

**Surfaces over the 3D layer:** glass — `--bg-1` at ~72% + `backdrop-blur 12px` + 1 px `--line-1` + 1 px inner top highlight at 6% white. No drop shadows on dark; elevation = border + soft accent glow (10–20% at 24 px blur) on hover/focus only.

### Typography (OPEN within these constraints)
- Two families max + one mono. **Do not use Inter/Roboto/Arial.**
- Recommended: **Bricolage Grotesque** (display; variable, has width/optical axes — distinctive) + **Geist** (body) + **JetBrains Mono** (labels/code). Acceptable alternative: **Clash Display + Satoshi** (Fontshare) + **Geist Mono**. Propose one pairing and show it.
- Fluid scale (FIXED shape, tune values):
  - display-1 `clamp(2.75rem, 1.5rem + 5vw, 6.5rem)` / 1.0 / −0.02em
  - display-2 `clamp(2rem, 1.2rem + 3vw, 4rem)` / 1.05 / −0.015em
  - h2 `clamp(1.75rem, 1.3rem + 1.6vw, 2.75rem)` / 1.15
  - h3 1.375rem / 1.25 · body-lg 1.125rem / 1.6 · body 1rem / 1.65 · small 0.875rem / 1.5
  - label 0.75rem mono, uppercase, tracking 0.12em
- Prose measure 65–75 ch. Headings `--fg-0`, body `--fg-1`, meta `--fg-2`.

### Spacing, radii, grid (FIXED)
- 4 px base: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128 / 192. Section padding `clamp(4rem, 10vw, 10rem)`.
- Radii 6 (chips) / 12 (cards) / 20 (large panels) / full (pills). Borders 1 px.
- 12-column grid, gutter 24 (16 on mobile), page margins `clamp(1rem, 4vw, 4rem)`. Content max-width **1440**; bento/work grid max **1600**. On ultra-wide, content stays centred and the 3D layer fills the rest.
- Icons: Lucide, 1.5 px stroke, 20/24 px.

### Motion (FIXED principles)
- Durations 120 / 200 / 320 / 560 ms; ease-out `cubic-bezier(.2,.8,.2,1)`.
- Reveals are scroll-linked; nothing autoplays except the Assembly's idle breathing. No loader/splash. Everything has a `prefers-reduced-motion` state (instant/opacity-only).

---

## 4. Breakpoints & responsive behaviour (FIXED)

Design at **390 (mobile), 834 (tablet), 1440 (desktop), 2560 (ultrawide 21:9)**; the build also targets 360, 640, 1024, 1280, 1536, 1920 and 32:9.

| Width | Behaviour |
|---|---|
| ≤ 767 | Single column. Bottom-sheet navigation (thumb-reachable) instead of a top menu. Hero: formation occupies the upper ~55%, text bottom-anchored. Domain chips become a marquee. Bento stacks. Tap targets ≥ 44 px; no hover-only affordances. |
| 768–1023 | 2-column bento and pillars. Top nav condensed. Case-study TOC hidden. |
| 1024–1535 | Full desktop nav; asymmetric 2-col bento; sticky TOC on case studies. |
| 1536–2559 | Same, more air; larger section padding. |
| ≥ 2560 | Hero splits: text left third, formation right two-thirds. Content centred at 1440/1600; the 3D layer spreads horizontally. Nothing stretches to full width. |

Also design: safe-area insets (notch), `100dvh` hero, print stylesheet for `/resume`.

---

## 5. Pages & sections to design

### 5.1 `/` — the flagship scroll (design every section at all four widths)

1. **Nav** — sticky; monogram "WS" → section links → "Let's talk" CTA. Condenses on scroll (height 72 → 56). Mobile: monogram + CTA + menu button opening a bottom sheet with links + socials.
2. **Hero** (100 dvh) — eyebrow (mono label): *Tech Lead @ Data Age · Senior Software Engineer @ Rapidev Labs · Harare, Zimbabwe* · H1 (display-1) · sub (body-lg, 2 lines) · CTAs: primary "See the work", secondary "Let's talk" · KPI trio (mono label + value): 5+ years · 8 domains shipped · WebGL / real-time 3D · scroll cue. Behind: Monolith formation. Design the text so it reads over a bright cyan-violet object (glass panel? gradient scrim? offset composition?) — propose.
3. **Proof strip** — 8 domain chips (Healthcare · Education · Creator economy · Procurement / ERP · Social services · Developer tooling · Interactive 3D · AR / XR) + 4 KPI tiles. Compact; a band, not a section.
4. **Selected Work** — H2 *Selected work* + short lede + **bento of 6 cards** (2 large "featured" cards, 4 standard) + "All work →". Card anatomy: domain tag (accent by domain), project name, one-line outcome, 3–5 stack chips, visibility badge ("Public" / "Client codebase"), arrow. Hover/focus: border→accent, soft glow, arrow shifts, (the 3D lattice drifts toward it — you don't design that, but leave the card edges clean).
5. **How I Lead** — H2 + three **pillar cards** (violet-led): *Technical direction* · *Code review & standards* · *Mentorship & delivery*, each with 3 concrete practices as a bulleted list; below, a 5-step horizontal strip "How I run a project": Discovery → Architecture → Delivery cadence → Launch → Operate. An optional testimonial block (design it; it renders only when real quotes exist).
6. **Craft: 3D & AR** — cyan-led. Statement (h2 + body): *The thing that surprises people: WebGL that runs at 60 fps on a mid-range phone.* Controls row: **Enable physics** (toggle), **Reset**, **View in AR** (only on capable devices; design a disabled/unsupported state), **Perf HUD** (small mono toggle). "Open the lab →". This section is the one place the 3D layer comes forward and content steps back — design the content as a slim glass rail/edge, not a full-width block.
7. **Stack** — six groups as chip clusters: Languages · Frontend · Backend & Data · Cloud & DevOps · 3D & Creative · Tooling & Practice. Chip states: core (filled subtle) / working (outline) / familiar (ghost). A short "How I choose" note (default stack: TypeScript, Next.js, Node, Postgres/Firebase; when I deviate and why).
8. **Experience** — vertical timeline: Data Age — Tech Lead · Rapidev Labs — Senior Software Engineer · Earlier engineering roles (2020–). Each item: org, title, period (mono), 2–3 highlights.
9. **Writing & elsewhere** — 3 article cards (Medium) + social row (LinkedIn, GitHub, X, Medium, Instagram, Discord, Reddit, Pinterest — first four prominent, rest small).
10. **Contact** — *Open to consulting & collaboration.* Lede: *Leading a build, untangling an architecture, or making something run at 60 fps — if it's an interesting problem, I'd like to hear about it.* Form (name, email, message, send) + direct links (Email — copyable, LinkedIn, Rapidev Labs). Success, error and rate-limited states.
11. **Footer** — nav, socials, colophon: *Built with Next.js, React Three Fiber and Rapier. One draw call. Holds 60 fps on a mid-range phone.* + "View perf" link.

### 5.2 `/work/[slug]` — case-study template
Header (domain tag, name, role, period, visibility badge, stack chips, compact 3D badge/poster top-right) → body with sticky TOC on desktop: Context · Problem · My role · Architecture (**diagram slot** — design a placeholder diagram style: dark, line-based, accent nodes) · Key decisions (**table**: decision · why · trade-off) · Outcome (metric tiles) · Stack · What I'd do differently → Prev/Next → contact CTA. Private projects show a callout: *Client / internal codebase. The code isn't public — I'm happy to walk through the architecture on a call.* + "Book a walkthrough".

### 5.3 `/work` index — filter chips by domain (URL-synced) + card grid (same card).

### 5.4 `/lab` — grid of experiment cards, each with a live viewport area (16:10), title, kind tag (3D / Physics / Shader / AR), blurb, "Open". Include a designed **"Next experiment"** placeholder card and an **"AR not supported here"** state.

### 5.5 `/about` — narrative (300–500 words), photo slot with **gradient + "WS" monogram fallback**, values, "how I work", full timeline.

### 5.6 `/resume` — print-first layout (A4/Letter), "Download PDF" button; on-screen version uses the same tokens.

### 5.7 `/admin` — private operator surface (design at 390 and 1440)
Authenticated (Firebase), `noindex`, never linked from public navigation. This is a **working
tool, not a showpiece** — favour density and legibility over atmosphere: no 3D layer, no glass,
flat `--bg-1` surfaces, tighter spacing scale, mono for all numerics. It should feel like the
calm back-office of the public site, obviously the same design system, obviously a different job.

Three screens:
1. **Leads inbox** — table (received, name, email, first line of message, status, spam score) with status filter chips (New / Read / Replied / Spam / Archived), row selection, and a detail pane showing the full message, source page, referrer, and a notes thread. Actions: mark replied, archive, mark spam. Needs empty, loading and error states.
2. **Analytics** — date-range picker, KPI row (visits, unique sessions, contact conversions), a per-case-study table ranked by reads with average scroll depth, a referrer breakdown, and a device/GPU-tier split. Charts are line and bar only, using the violet→cyan accents; no pie charts.
3. **Asset manager** — grid of 3D assets with thumbnail, name, licence, and per-variant status chips (GLB / KTX2 / USDZ / poster, each pending / ready / failed). Upload flow with progress, a transcode-job panel showing retries and errors, and a licence field that is required on upload.

Also design: a minimal **sign-in screen** (email, password, TOTP code) and a "not authorised" state for a valid Firebase user whose UID is not on the admin list.

---

## 6. Component inventory (design each with states)

Nav (default / condensed / mobile sheet) · Button (primary gradient-hover, secondary outline, ghost, icon; hover/focus/active/disabled/loading) · Chip (domain-accent, stack core/working/familiar, filter selected) · Badge (Public / Client codebase / Placeholder-in-dev) · KPI tile · Project card (featured / standard; hover / focus / no-image fallback) · Pillar card · Process step strip · Timeline item · Article card (+ fallback when RSS unavailable) · Contact form (idle / validating / error / sending / success / rate-limited / **offline — falls back to a mailto: link**) · Toast · TOC (sticky, active state) · Prev/Next · Callout (private codebase) · Decision table · Metric tile (+ placeholder styling) · Diagram placeholder · Lab card (+ unsupported state) · Poster layer (how a static poster looks behind content when WebGL is off) · Skeletons (must match final dimensions) · Skip link & focus ring · Bottom sheet · Command palette (v1.5) · Perf HUD (tiny mono panel).

**Admin-only components:** data table (sortable header, row hover, selected row, empty, loading, error) · status pill (New / Read / Replied / Spam / Archived) · detail pane · notes thread · date-range picker · chart frame (line, bar) · asset tile with per-variant status chips · upload dropzone (idle / uploading with progress / complete / failed) · job row (queued / running / retrying / failed with error) · sign-in form · not-authorised state.

**Every image slot** needs a designed fallback (gradient + monogram/initials). **Every data slot** needs a placeholder style that looks finished but is subtly identifiable in dev (e.g., a dotted underline that is removed in production).

---

## 7. Accessibility (FIXED)
AA contrast for all text over dark and over glass; visible focus rings (cyan 2 px, 2 px offset); ≥ 44 px targets; headings in order; the 3D layer is decorative (`aria-hidden`); reduced-motion variants for every animated element; form errors adjacent and announced.

---

## 8. Deliverables requested from Claude Design
1. **Moodboard + one type pairing** (with rationale) — 1 page.
2. **High-fidelity mockups of `/`** at 390 / 834 / 1440 / 2560, showing the Assembly as posters behind content.
3. **Case study, `/work` index, `/lab`, `/about`, `/resume`** at 390 and 1440, plus the three **`/admin`** screens (§5.7) at 390 and 1440.
4. **Component sheet** with all states listed in §6.
5. **Poster art direction**: how each of the seven formations should look as a still (framing, exposure, bloom, background gradient) — 7 stills.
6. **Motion notes**: reveal choreography per section, nav condensing, card hover, form states — as annotated frames.
7. **Token export**: final colour/type/space tokens as CSS custom properties.

---

## 9. Fixed vs. open — summary
| FIXED | OPEN |
|---|---|
| Positioning, headline, tone | Type pairing (within constraints) |
| Dark theme, base palette, violet/cyan semantics | Exact hero composition over the monolith |
| Persistent 3D layer concept + formations | Poster art direction |
| Information architecture, sections, order | Bento arrangement (which two cards are large) |
| Breakpoints, grid, spacing scale, radii | Iconography accents, illustration style for the diagram placeholder |
| Component list and required states | Micro-interaction details |
| Accessibility rules | Mobile bottom-sheet styling |
| Copy deck v1 (below) | Editorial rhythm / where to add pull-quotes |

---

## 10. Copy deck v1 (use verbatim; placeholders in brackets)
- Eyebrow: Tech Lead @ Data Age · Senior Software Engineer @ Rapidev Labs · Harare, Zimbabwe
- H1: I lead teams that ship production software — and I make the web move.
- Sub: Hospital operations, learning platforms, creator-discovery tooling, procurement systems. Technical direction, code review and mentorship by day; real-time 3D on the web that holds frame rate on a mid-range phone.
- KPIs: 5+ years · 8 domains shipped (design for a two-digit value; it is computed from content and shows 7 until the AR case study is supplied) · WebGL / real-time 3D specialism · Production platforms led/shipped: 10 [placeholder]
- Projects (name — domain — one-liner — stack):
  - heycreator — Creator economy — Creator-discovery platform with automated enrichment pipelines and reversible data migrations (dry-run, apply, rollback). — Next.js · TypeScript · Firebase · Apify · Puppeteer · Playwright
  - Vantage Health System — Healthcare — Hospital operations platform: containerised services, structured logging, QR-coded records, generated reporting decks. — Node · Express · Docker · Winston · PptxGenJS
  - learnx — Education — LMS with rich-text authoring: drag-and-drop curriculum building, tables, code blocks, inline media. — React · Express · Firebase Admin · TipTap · dnd-kit · Zustand
  - gabar — Interactive 3D — Real-time 3D web experience: rigid-body physics, spatial audio, mobile joystick controls, tuned to hold frame rate on mid-range devices. — Three.js · React Three Fiber · drei · Rapier · Howler
  - [AR project name] — AR / XR — [One-line outcome — owner to supply] — [stack]
  - PR-Pulse — Developer tooling — Pull-request performance and review-signal tooling. Public. — TypeScript · Next.js · Vercel Blob · Motion
  - we-assist-you — Social services — Assistance platform on a typed backend with enforced security rules, conventional commits, staged builds; monitored in production. — TypeScript · Firestore · React · TanStack Query · Zod · Sentry
  - purchase-requisition — Procurement / ERP — Procurement workflow with approval chains and generated PDF documentation. — Next.js · Supabase · jsPDF
- How I Lead pillars: Technical direction (architecture standards · reversible migrations · honest error handling) · Code review & standards (typed backends · enforced security rules · conventional commits, staged builds) · Mentorship & delivery (engineers grow through review · accountable for how it's built, not just that it ships)
- Craft: The thing that surprises people: WebGL that runs at 60 fps on a mid-range phone. Rigid-body physics, spatial audio, mobile joystick controls — and the performance budgets that make it viable.
- Contact: Open to consulting & collaboration. Leading a build, untangling an architecture, or making something run at 60 fps — if it's an interesting problem, I'd like to hear about it.
- Colophon: Built with Next.js, React Three Fiber and Rapier. One draw call. Holds 60 fps on a mid-range phone.
