# Design System Reconciliation — the build authority for `/`

| | |
|---|---|
| **Date** | 2026-08-16 |
| **Status** | Approved by owner; governs the M0 visual build |
| **Supersedes** | Nothing. It *resolves* conflicts between existing documents. |
| **Inputs** | [`Foundations.dc.html`](../../Portfolio%20Design/Foundations.dc.html) · [`Home.dc.html`](../../Portfolio%20Design/Home.dc.html) · [portfolio website spec](2026-08-15-portfolio-website-design.md) · [design brief](../../claude-design-brief.md) · [M0 plan](../plans/2026-08-15-m0-foundations.md) |
| **Verbatim values** | [`docs/design-extraction/`](../../design-extraction/) — full extractions of every source. This document records *decisions*; that directory records *measurements*. Do not re-derive values here. |

---

## 0. The governing rule

> **Visual design comes from the Claude Design export. Copy and identity come from the approved
> spec.**

The export is authoritative for how the site *looks*: tokens, glass surfaces, hairline grids,
bento spans, canvas formations, the reveal system, every measurement. The spec §5.5 copy deck
and brief §10 are authoritative for what it *says*.

This rule exists because `Home.dc.html` contains a late editorial pivot — it reframes Wieslaw
from Tech Lead to hands-on engineer and rewrites the employment history. The owner has confirmed
that pivot is **not** to be built. Its *visual* work is excellent and is kept in full.

**When in doubt:** if the disagreement is about a pixel, the export wins. If it is about a word,
the spec wins.

---

## 1. Copy reconciliation — what changes back

Every row below is a deliberate reversal of the export. An implementer who copies text out of
`Home.dc.html` without consulting this table will ship the wrong content.

| Slot | ❌ Export says (do not build) | ✅ Build this |
|---|---|---|
| Hero eyebrow | Software Engineer @ Data Age · Full Stack Engineer | `Tech Lead @ Data Age · Senior Software Engineer @ Rapidev Labs · Harare, Zimbabwe` |
| H1 | I build production software, end to end — and I make the web move. | `I lead teams that ship production software — and I make the web move.` |
| Hero KPI 1 | 6+ years | `5+` / `Years shipping` |
| Section 4 id | `#experience` used for timeline; section 4 titled "How I work" | id `#lead`, title **How I Lead**, nav label `How I lead` |
| Section 4 H2 | Tested, typed, and shipped with a rollback plan. | `Accountable for how it's built, not just that it shipped.` |
| Section 4 items | Habit 01/02/03 — Tested by default · Architecture that stays legible · Owned to production | **Pillars** — `Technical direction` · `Code review & standards` · `Mentorship & delivery`, with the spec §5.5 practice bullets |
| Proof tile 1 | Load time cut, Ikarus 3D — 50% | `Production platforms led/shipped` — `10`, `placeholder: true` |
| Proof tile 3 | Frame budget held — 60 fps | `Roles` — `Tech Lead + Senior SWE` |
| Proof tile 4 | Infra cost cut, Virtualize — 30% | `Concurrent production systems monitored` — placeholder |
| Timeline | Data Age · Ikarus 3D · Virtualize Technologies · Baeldung.com · Earlier roles | `Data Age — Tech Lead` · `Rapidev Labs — Senior Software Engineer` · `Earlier engineering roles (2020–)` `placeholder: true` |
| Timeline section id | `#experience` | `#timeline`, heading `Experience` |
| Stack | Java · Kotlin · Spring Boot · Hibernate/JPA · GraphQL · MongoDB · Azure · Nginx · JUnit · Mockito · Jira | The spec's TypeScript-first stack — see §6.6 |
| Email | wieslawsamushonga01@gmail.com | `wieslaw@rapidevlabs.com`, `placeholder: true` (open decision OD-5) |
| Nav items | Work · How I work · Craft · Stack · Experience · Writing | Work · How I lead · Craft · Stack · Experience · Writing |

**Kept from the export unchanged:** the Craft statement, the Contact lede, the colophon, all
eight domain labels, the six project one-liners, and every placeholder convention.

### 1.1 The proof-strip honesty problem

The export replaced a dotted-underlined `Platforms led / shipped: 10` with two hard,
attributable metrics. Reverting to the spec means reverting to a **soft, unverified claim**. It
therefore keeps the placeholder treatment: `placeholder: true`, dotted underline in development,
and it appears in `pnpm lint:content` output. Do not quietly present it as fact.

Two of the four proof tiles are placeholders under this reconciliation. That is a content debt
the owner must settle, not something the build should paper over.

---

## 2. Tokens

Take the complete `:root` block verbatim from
[`design-extraction/design-foundations.md` § "Complete token list"](../../design-extraction/design-foundations.md).
It is the single source. Notes on the gaps that extraction identified:

| Issue | Resolution for this build |
|---|---|
| `--gutter` is 24px only; brief wants 16px on mobile | `--gutter: 16px` below 768, `24px` at and above. Declared once in the breakpoint layer, not per-component. |
| No breakpoint tokens exist | Added here — see §3. |
| Hero H1 clamp is untokenised (`clamp(2.75rem,1.5rem + 3.6vw,4.75rem)`) | Promote to `--display-hero`. It is deliberately smaller than `--display-1` because it sits inside a glass panel; keep it. |
| `--d-*` all collapse to `1ms` under reduced motion, which also kills the poster cross-fade the fallback ladder needs | Add `--d-crossfade: 200ms` **outside** the reduced-motion override. Opacity-only cross-fades are safe under reduced motion; movement is not. |
| `display-2` renders at `wdth 90` but the specimen note claims 88 | Use **`wdth 90`**. The rendered value wins over the prose. |
| `--bg-2` defined, never used | Now used — it is the Writing section's opaque card ground (§6.8). |
| `#E879F9` fuchsia used in the canvas ramp and Habit bullets but absent from the token export | Promote to `--fuchsia-400: #E879F9`. It is load-bearing: the canvas shade ramp is three-stop violet→fuchsia→cyan. |
| Six domain-tint hues used but untokenised | `--accent-emerald #6EE7B7`, `--accent-amber #FCD34D`, `--accent-fuchsia #F0ABFC`, `--accent-iris #C4B5FD`, `--accent-cyan #67E8F9`, `--accent-violet #A78BFA` |
| Focus ring radius fixed at 6px against 12/20/999px components | `:focus-visible` sets `border-radius: inherit`. The global 6px is a defect in the export; do not reproduce it. |

**The gradient rule is FIXED and load-bearing.** `--gradient` appears in exactly three places:
the Assembly/canvas, optional hero display-text clip, and primary-CTA hover. A fourth use is a
bug. This is why the monogram is an **outlined box, not a gradient tile** — the M0 plan's
gradient monogram would have been a fourth placement.

---

## 3. The responsive system — authored here

**The export contains no width media queries.** Not one. Every grid is a fixed track count, so
at 390px the Stack section's left column computes to −86px and a bento card to 103px. The export
is a desktop design with fluid type. This section is new design work, not transcription.

### 3.1 Breakpoints

```css
--bp-xs:  360px;   /* floor — never below */
--bp-sm:  640px;
--bp-md:  768px;   /* tablet */
--bp-lg:  1024px;  /* desktop nav appears */
--bp-xl:  1280px;
--bp-2xl: 1536px;
--bp-3xl: 1920px;
--bp-4xl: 2560px;  /* ultrawide 21:9 / 32:9 */
```

Design targets are **390 · 834 · 1440 · 2560**; the other five must not break.

### 3.2 Principles

1. **Fluid first, breakpoints second.** The export's 24 `clamp()` calls already handle type and
   padding across the whole range. Media queries change *track counts and anchoring* only —
   never re-declare a clamp inside one.
2. **No grid keeps more than two columns below 768.** Fixed track counts are the export's single
   structural flaw; every `repeat(n,1fr)` gets an explicit small-screen value.
3. **Anchoring flips, composition does not.** The hero panel is left-anchored on desktop and
   bottom-anchored on mobile — same panel, same glass recipe, different anchor and scrim axis.
4. **Ultrawide adds air, never width.** Content stays capped at 1440 (1600 for the bento); the
   canvas takes the extra space and the formation spread scales ×1.4 above 2.2 aspect.
5. Tap targets ≥ 44px everywhere. Every hover has a tap/focus equivalent. `env(safe-area-inset-*)`
   on the nav, bottom sheet and footer. Hero uses `100dvh`, never `100vh`.

### 3.3 Per-section responsive matrix

| Section | ≤767 (mobile) | 768–1023 (tablet) | 1024–2559 (desktop) | ≥2560 (ultrawide) |
|---|---|---|---|---|
| **Nav** | Monogram + CTA + menu button → **bottom sheet** | Same as mobile (sheet is thumb-reachable on tablet too) | Full 6 pills + CTA; 72→56px at `scrollY>24` | As desktop, container capped 1440 |
| **Hero** | Panel full-width, **bottom-anchored**, padding 24px; scrim flips to vertical | Panel `min(72%,560px)`, padding 40px | Panel `min(56%,700px)`, left-anchored, radial scrim from 2% | Panel `min(40%,640px)`; canvas spread ×1.4 |
| **Hero KPIs** | `repeat(3,1fr)`, value 1.375rem | `repeat(3,1fr)` | `repeat(3,1fr)`, value 1.75rem | as desktop |
| **Proof chips** | Horizontal scroller, snap, masked edges | Wrap | Wrap | Wrap |
| **Proof tiles** | Hairline grid `repeat(2,1fr)` | `repeat(4,1fr)` | `repeat(4,1fr)` | `repeat(4,1fr)` |
| **Bento** | `1fr`, all cards span 1 | `repeat(2,1fr)`, all span 1 | `repeat(6,1fr)` spans **3,3,4,2,2,3,3** | as desktop, max 1600 |
| **Pillars** | `1fr` | `repeat(3,1fr)`, padding 24px | `repeat(3,1fr)`, padding 32px | as desktop |
| **Process rail** | `1fr` stacked, hairline becomes horizontal rules | `repeat(5,1fr)` | `repeat(5,1fr)` | as desktop |
| **Craft** | Panel full-width, scrim vertical, `min-height:auto` | Panel `min(60%,460px)` | Panel `min(38%,460px)`, right-anchored, `min-height:88vh` | as desktop |
| **Stack** | `1fr`; aside moves **below**, loses sticky; groups `1fr` | `1fr`; aside below; groups `repeat(2,1fr)` | `1fr 380px`, aside `sticky top:120px`; groups `repeat(2,1fr)` | as desktop |
| **Timeline** | `1fr`; period moves **above** the title as a mono label; rail padding 24px, dot at −30px | `1fr 200px` | `1fr 200px`, period right-aligned | as desktop |
| **Writing** | `1fr` | `repeat(2,1fr)` | `repeat(3,1fr)` | as desktop |
| **Contact** | `1fr`, form below channels | `1fr`, form below channels | `1fr clamp(320px,38vw,520px)` | as desktop |
| **Footer** | `1fr`; nav becomes `repeat(2,1fr)` | `1fr auto` | `1fr auto` | as desktop |

### 3.4 Deliberate deviation: the domain chips are a scroller, not a marquee

The brief asks for a marquee on mobile. A marquee autoplays, which contradicts the motion
principle that *nothing autoplays except the Assembly's idle breathing*, and it needs a separate
static variant under `prefers-reduced-motion` anyway. A horizontal scroll-snap row delivers the
same "there are more of these" affordance, is swipeable, is keyboard- and screen-reader-navigable
without extra work, and costs no animation frames. Edge fade is a CSS mask, not motion.

**If the owner wants the literal marquee, it is a contained change** to one component with a
reduced-motion fallback already in place.

### 3.5 Ultrawide formation spread

Spec §4.4 requires that above 2.2 aspect the formation's `spreadX` scales ×1.4 rather than the
camera pulling back — otherwise instances become unreadably small. The canvas layer implements
this as a config multiplier keyed on `canvas.width / canvas.height`, applied at paint time. It is
not a media query.

---

## 4. Typography

Verbatim scale and every `font-variation-settings` value:
[`design-extraction/design-foundations.md` § "Type pairing"](../../design-extraction/design-foundations.md).

**Bricolage Grotesque's `wdth` axis is load-bearing** — display text is set narrow and tall to
echo the Monolith. The M0 plan's `next/font` call pins `weight: ['400','600','700','800']`, which
**kills the variable axes**. Correct configuration:

```ts
Bricolage_Grotesque({ axes: ['opsz', 'wdth'], /* no `weight` key */ })
```

Per-level axis values (`opsz` is only ever 96, and only on display-1-class text):

| Level | `wdth` | `opsz` | Weight |
|---|---|---|---|
| display-1 / hero H1 | 88 | 96 | 600 |
| display-2 | 90 | — | 600 |
| bento large card h3 | 92 | — | 600 |
| section h2 | 95 | — | 600 |
| bento standard h3 | 96 | — | 600 |
| writing card h3 | 98 | — | 600 |
| h3 / monogram | 100 / 90 | — | 600 |

**Fonts are self-hosted, not fetched from Google.** `docs/design-extraction/fonts-raw/` holds 13
woff2 files recovered from the bundle with the axis ranges intact
(`font-weight: 300 800; font-stretch: 75% 100%`). Subset to latin, serve from `public/fonts/`,
`display: swap`, with `size-adjust` fallbacks. This is what keeps the ≤90 KB font budget
reachable and removes a third-party origin from the CSP.

---

## 5. The canvas / poster layer

The export's DOM contract differs from the M0 plan's and **the export's wins**, because M2 will
replace this layer with real WebGL and the per-section structure is what the Assembly needs.

- **Not** one global fixed `<div>` with seven cross-faded variants (the plan's design).
- **Instead**, each section owns:
  `<div aria-hidden absolute inset-0><div sticky top-0 h-100vh><canvas data-f="…"><div scrim>`
- Per-section scrim: hero `radial-gradient(80% 110% at 2% 50%, …)`, craft mirrored at `100% 50%`,
  all others `linear-gradient(180deg, …)`.
- **Seven formations map 1:1 to seven sections.** `#timeline` and `#writing` have **no canvas** —
  flat `--bg-0` and `--bg-1` respectively. The M0 plan's 9-section mapping is wrong; drop it.
- `badge` is dead — seven formations ship, not eight. Remove it from `formationIdSchema` (OD-2).

Renderer, per-formation config table, projection maths and all seven generators are extracted
verbatim in [`design-extraction/design-home.md`](../../design-extraction/design-home.md) and
[`design-foundations.md`](../../design-extraction/design-foundations.md). Reproduce them, do not
reinvent them — the generators are LCG-seeded (`seed = kind.length * 7919 + 12345`) so output is
byte-reproducible, which is what makes the pre-rendered poster assets stable in visual tests.

Only the hero canvas animates, visibility-gated by IntersectionObserver and throttled to ~20 fps.
Everything else paints once.

### 5.1 Fallback ladder

Five rungs, layout never shifting between them: live canvas → reduced instance count → reduced-
motion static poster (opacity cross-fade at `--d-crossfade`) → static poster, no cross-fade →
radial accent wash alone. The last rung covers "images failed to load" and is pure CSS.

---

## 6. Component decisions

Full anatomy and every measured value: [`design-extraction/design-home.md` § "Component
inventory"](../../design-extraction/design-home.md) (33 components). Decisions that override the
M0 plan:

| # | Decision |
|---|---|
| 6.1 | **Buttons are pills** (`999px`), not 6px. Hero CTA `height:48px; padding:0 26px`; nav `44px/22px`. Primary hover is the gradient — one of the three sanctioned placements. Secondary hover adds `0 0 24px rgba(34,211,238,.20)`. |
| 6.2 | **All chips are JetBrains Mono** with a tinted background at 8–10% alpha, `6px` radius, `padding:6px 11px`. The plan's body-font, border-only chip is wrong. |
| 6.3 | **Monogram is an outlined box**, `44px`, `1px solid --line-2`, `12px` radius, Bricolage `wdth 90`, hover `border-color: --violet-400`. **No gradient** — see §2. |
| 6.4 | **`KpiTile` needs a `variant` prop.** Hero is a `<dl>` `repeat(3,1fr)` above a `border-top`, value `1.75rem` `wdth 92`. Proof strip is a 4-cell **hairline grid**, value `2.25rem`. Neither has the plan's left border. |
| 6.5 | **The hairline grid is a primitive**, used three times (proof tiles, process rail, contact channels): `display:grid; gap:1px; background:--line-1; border:1px solid --line-1; border-radius:12px; overflow:hidden` with cells at `rgba(17,22,29,.86)`. It produces dividers with zero per-cell borders. Build it once. |
| 6.6 | **Stack content is the spec's, not the export's.** Six groups — Languages · Frontend · Backend & Data · Cloud & DevOps · 3D & Creative · Tooling & Practice — populated from spec §5.5 and brief §10 (TypeScript, Next.js, Node, Postgres/Firebase). Keep the export's *presentation*: coloured mono headings, three proficiency tiers, the Core/Working/Familiar legend, and the sticky "How I choose" aside. |
| 6.7 | **The testimonial block renders as a dashed placeholder.** The export ships one; the spec and M0 plan say it hides unless a real quote exists. **The spec wins on content, so it stays hidden** — but the *dashed-placeholder pattern* the export invented is adopted for every other unresolved slot. This resolves a direct contradiction between the export and a Global Constraint. |
| 6.8 | **Writing cards are opaque `--bg-2`**, no glass, no backdrop-filter, hover `border-color` only with no glow. The third slot is a designed RSS-failure card, not a third article. |
| 6.9 | **Bento cards are whole-card `<a>`**, radius **20px** (not 12), `rgba(22,27,34,.78)` + lit `border-top`, hover = border-color + `0 0 24px` glow, **no transform**. The tech `<ul>` carries `margin: auto 0 24px` — that `auto` pins tag rows to a common baseline across cards of different heights. Do not remove it. |
| 6.10 | **The AR entry is a non-interactive `<div>`**, dashed border, amber `In preparation` badge, dotted `[AR project name]`, three empty dashed chip ghosts. Not a link, not a normal card. |
| 6.11 | **Badge gains a fourth state:** `In preparation` in `--warning #D29922`, for placeholder work. |
| 6.12 | **Contact ships the full form markup now** with the state machine (`idle / sending / success / error / limited / offline`), but only `offline` is live in M0 — submit falls back to `mailto:`. M3 wires the API without touching the markup. |
| 6.13 | **Keep the plan's `<dialog>` bottom sheet.** The export has no mobile nav at all; the plan's is sound and accessible. |

---

## 7. Reveal system

New in the export, absent from the plan, and buildable in M0 with plain CSS + IntersectionObserver
— **no animation dependency**. Motion stays out of M0 as the plan intends.

- Hidden state `opacity:0; translateY(24px)` → `opacity:1; transform:none`
- `560ms cubic-bezier(.2,.8,.2,1)`, `siblingIndex * 70ms` stagger
- Observer `threshold: 0.12, rootMargin: '0px 0px -4% 0px'`
- **Above-fold guard:** anything with `top <= innerHeight * 0.92` is never hidden — prevents FOUC
- 450ms geometry-poll fallback; **4000ms hard deadline** after which everything reveals regardless
- Bails out entirely under `prefers-reduced-motion`

The deadline and the guard are the parts that matter. Without them a failed observer leaves the
page permanently invisible — an availability bug dressed as an animation.

---

## 8. Accessibility

Spec §5.3 and brief §7 stand unchanged. Two corrections to the export:

1. **`:focus-visible` must use `border-radius: inherit`**, not a fixed 6px. The export's ring
   mismatches every 12px, 20px and 999px component it lands on.
2. **Every canvas is `aria-hidden`** and the layer carries the one-time visually-hidden note
   ("Decorative 3D visualisation; all content is available as text").

Additionally: the AR button's permanently-disabled state is a *designed* graceful degradation
(`cursor:not-allowed`, `title="WebXR is not available in this browser"`, inline `Unsupported`
badge) — it is not a bug to fix, and it must remain focusable and announced.

---

## 9. Out of scope for this pass

Confirmed with the owner: **home page only, but complete.** Not built here — `/work`,
`/work/[slug]`, `/lab`, `/about`, `/resume`, `/admin`. The export never designed them either, so
they need a design pass before an implementation pass.

Footer links to `/lab`, `/about` and `/resume` therefore point at routes that do not yet exist.
They render as disabled with a `Coming soon` affordance rather than as 404 traps.

---

## 10. Open decisions

Tracked live in `.superpowers/coordination.md`. At time of writing: **OD-2** (widen the domain
accent enum — session-A), **OD-5** (which contact email — owner), **OD-6** (content authoring
ownership — session-A).
