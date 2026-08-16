# Survey — `docs/Portfolio Design/Wieslaw Portfolio.html`

Surveyed 2026-08-15. Source: `C:\Users\wiesl\OneDrive\Documents\Github\JxstWieslaw\portfolio\docs\Portfolio Design\Wieslaw Portfolio.html` (693,355 bytes, 403 lines).

## 1. What the file actually is

It is **not a design deck**. It is a *self-unpacking single-file bundle* (Claude Design "bundled page" export)
containing **exactly one screen: the Home page** — the same design as `Home.dc.html`.

Physical structure (403 lines, two of which hold everything):

| Line | Bytes | Content |
|---|---|---|
| 1–43 | ~2 KB | `<head>`, loading chrome, inline **thumbnail SVG** (gradient monolith + "WS") |
| 44–386 | ~18 KB | The bundler's unpack runtime (blob minting, parent-chain postMessage relay for nested pages) |
| **389** | **556,731** | `script[type="__bundler/manifest"]` — JSON of 17 gzip+base64 assets |
| 393 | 237 | `script[type="__bundler/ext_resources"]` — React 18.3.1 + ReactDOM UMD from unpkg |
| 397 | 2 | `script[type="__bundler/page_order"]` — **`[]`** → single page, no nested/framed screens |
| **401** | **116,649** | `script[type="__bundler/template"]` — JSON-escaped string = the real page HTML (111,451 chars) |

### Manifest contents (17 entries, decoded)

| Asset | Size | Note |
|---|---|---|
| `66daae2e-….js` | 67.5 KB | `dc-runtime` — Claude Design's React renderer. **Not design content.** |
| `b777086b-….js` | 10.5 KB | React 18.3.1 UMD |
| `d7f8c5b0-….js` | 128.7 KB | ReactDOM 18.3.1 UMD |
| 13 × `.woff2` | 1.6–128.5 KB (≈341 KB total) | Bricolage Grotesque (variable, wdth+opsz), Geist, JetBrains Mono — Latin/Latin-ext/Cyrillic/Cyrillic-ext/Greek/Vietnamese subsets |

**Embedded imagery: none.** Zero `<img>` tags, zero base64 image payloads. The single `base64` string in the
file is the unpacker's own `toBase64()` helper. The only binary payload is webfonts. The one `<svg>` is the
20-line bundler thumbnail. All "imagery" on the page is **drawn live into 7 `<canvas>` elements** by 2D-canvas
code in the template.

## 2. Relationship to the sibling files — it is a duplicate

Normalized diff (fonts, `<style>` blocks and DC attribute-casing stripped) of the unpacked template against
`Home.dc.html`: **188 differing lines, 100% of them the `@font-face` block, the `<script src>` swap, and the
thumbnail `<svg>`. Zero content, layout, colour, type or copy differences.**

Chain:
- `Home.dc.html` (104,704 B) — the authored source.
- `home-standalone-src.html` (105,791 B) = `Home.dc.html` + 20-line `<template id="__bundler_thumbnail">`. Only diff.
- `Wieslaw Portfolio.html` = `home-standalone-src.html` with fonts self-hosted, Google Fonts `<link>` removed,
  DC attributes normalized (`onClick`→`sc-camel-on-click`, `data-reveal`→`data-reveal=""`), wrapped in the unpacker.

`Home v1.dc.html` (98,103 B) is the **superseded earlier draft** — different H1 and different leadership framing (see §5).

## 3. Deliverable coverage — *this file*

Against §8 of `docs/claude-design-brief.md`:

| # | Deliverable | In this file | Where it actually lives |
|---|---|---|---|
| 1 | Moodboard + type pairing w/ rationale | **No** | `Foundations.dc.html` §"Type pairing" |
| 2 | `/` mockups at 390 / 834 / 1440 / 2560 | **Partial** — the `/` design, as one fluid responsive page, not four frames | this file / `Home.dc.html` |
| 3 | Case study, `/work`, `/lab`, `/about`, `/resume`, 3 × `/admin` (390 + 1440) | **No** | **Missing from the whole export** |
| 4 | Component sheet with all §6 states | **No** (states exist only as live interactions on `/`) | not delivered as a sheet |
| 5 | Poster art direction — 7 stills | **Implemented, not documented** — 7 live canvas configs | prose + separate configs in `Foundations.dc.html` |
| 6 | Motion notes as annotated frames | **Implemented, not annotated** — live reveal/nav/form code | rules in `Foundations.dc.html` §"Motion & spacing rules" |
| 7 | Token export as CSS custom properties | **No** — page uses hard-coded hex inline, no `:root` block | `Foundations.dc.html` §"Token export" |

**Screen inventory of this file: 1 screen.** `/` (Home), 9 sections:
`hero` · `#proof` · `#work` · `#lead` · `#craft` · `#stack` · `#experience` · `#writing` · `#contact`, plus nav and footer.

## 4. Design decisions NOT in `Foundations.dc.html` or `Home.dc.html`

Only two, both packaging-level:

**4.1 Self-hosted variable-font subset (the only substantive new artifact).**
`Home.dc.html` loads fonts from `https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,300..800&family=Geist:wght@300..700&family=JetBrains+Mono:wght@400;500&display=swap`.
This bundle **replaces that with 20 self-hosted `@font-face` rules over 13 woff2 files**, fixing the exact axis
ranges the build must reproduce:

| Family | Axes / weights | Notes |
|---|---|---|
| Bricolage Grotesque | `font-weight: 300 800`, `font-stretch: 75% 100%` | variable; the `wdth` axis is load-bearing — the page sets `font-variation-settings:'wdth' 88…100` per heading level |
| Geist | `font-weight: 300 700` | variable |
| JetBrains Mono | `400`, `500` | two static cuts only |

All with `font-display: swap` and per-subset `unicode-range` (Latin, Latin-ext, Cyrillic, Cyrillic-ext, Greek, Vietnamese).
Actionable: the real site can self-host these and drop the Google Fonts round-trip. Decoded woff2 files are in
`…/scratchpad/unpacked/*.woff2`.

**4.2 Deck cover / OG-image art direction** (in this file + `home-standalone-src.html`; absent from both `.dc.html` files).
A 1200×800 SVG on `#0D1117`: a rounded gradient slab (180×420, r=18) reading as the Monolith, four scattered
cubes (r=6–9) in violet/cyan/fuchsia at 0.6–0.7 opacity, and "WS" at 120px in `#F0F6FC`. Its gradient is
**3-stop, bottom-left→top-right: `#7C3AED` → `#E879F9` (50%) → `#22D3EE`**.

## 5. Cross-cutting notes worth surfacing (from the shared Home design, for context)

These are in `Home.dc.html` too — not new — but they diverge from the brief and matter downstream:

- **Fuchsia `#E879F9` is an undeclared token.** The brief and the Foundations token export both define
  `--gradient` as a **2-stop** `linear-gradient(90deg,#7C3AED,#22D3EE)`. The Home page's canvas `shade()`
  interpolates through a **3-stop violet → fuchsia → cyan** ramp (`A=[124,58,237] M=[232,121,249] C=[34,211,238]`),
  and `#E879F9` is also used as the bullet glyph colour in the "Architecture that stays legible" pillar.
  `#E879F9` appears **0 times in `Foundations.dc.html`** — the token export does not cover it.
  Same for the Stack section's per-group label colours `#F0ABFC`, `#6EE7B7`, `#FCD34D`.
- **Headline and positioning changed from the brief.** Brief/`Home v1`: *"I lead teams that ship production
  software…"*; shipped Home: ***"I build production software, end to end — and I make the web move."***
  The "How I Lead" section became ***"Tested, typed, and shipped with a rollback plan."*** with pillars
  *Tested by default · Architecture that stays legible · Owned to production* (was *Technical direction ·
  Code review & standards · Mentorship & delivery*).
- **Experience list changed.** Brief/`Home v1`: Data Age · Rapidev Labs · Earlier engineering roles.
  Shipped Home: **Data Age (2024–present) · Ikarus 3D (2024) · Virtualize Technologies (2022–2024) ·
  Baeldung.com (2021) · Earlier roles**. Rapidev Labs is gone from the timeline.
- **No width media queries.** The only `@media` in the page is `prefers-reduced-motion: reduce`. Responsiveness
  is entirely `clamp()` + fixed `grid-template-columns` — so the brief's ≤767 / 768–1023 / 1024–1535 / ≥2560
  behaviours (bottom-sheet nav, chip marquee, 2560 hero split) are **not designed anywhere in the export**.
- **Poster configs are tuned twice.** Foundations uses card-framed values; Home uses viewport-framed values with
  extra `fit:'h'` / `anchor:'viewport'` / `bloom` / `wash` / `washA` / `vig` keys. Home's set:

  | Formation | n | rot | tilt | scale | cx / cy | bloom | wash (α) | size | vignette |
  |---|---|---|---|---|---|---|---|---|---|
  | monolith | 2600 | .55 | .10 | .30 | .74 / .55 | 1.25 | `#7C3AED` (.14) | 3.4 | .30 |
  | stream | 1600 | .35 | .06 | .30 | .50 / .50 | 0.50 | `#22D3EE` (.07) | 2.4 | .45 |
  | lattice | 600 | .42 | .55 | .20 | .50 / .30 | 0.35 | `#7C3AED` (.07) | 2.6 | .55 |
  | orbit | 2400 | .30 | .30 | .22 | .50 / .50 | 0.90 | `#7C3AED` (.12) | 2.6 | .50 |
  | scatter | 2000 | .22 | .18 | .26 | .34 / .62 | 1.20 | `#22D3EE` (.12) | 3.2 | .30 |
  | grid | — | .62 | .34 | .22 | .50 / .50 | 0.18 | `#7C3AED` (.05) | 2.4 | .55 |
  | ring | 2200 | .20 | .62 | .24 | .50 / .58 | 0.60 | `#22D3EE` (.08) | 2.5 | .45 |

  Render recipe: `#0D1117` fill → radial wash → two-pass draw (pass 1 `globalCompositeOperation='lighter'`
  halo at `0.030 × bloom × depth`; pass 2 `source-over` cube bodies at `0.88 × depth` plus a
  `rgba(240,246,252,0.20)` top-face highlight) → radial vignette. DPR capped at 2. Hero repaints at ~20 fps
  (`ts - last < 50`) and only while `IntersectionObserver` reports it visible.
- **Live states encoded in the page's `text/x-dc` logic:** nav condense 72→56 px with bg `rgba(13,17,23,.35→.88)`;
  contact form `idle / sending / success / error / limited / offline` with full copy and per-state colours;
  email copy-to-clipboard with a 2 s "Copied"; physics toggle; Perf HUD toggle; scroll reveal at 560 ms with a
  70 ms per-sibling stagger, `translateY(24px)`→none, IntersectionObserver at `threshold 0.12`,
  `rootMargin '0px 0px -4% 0px'`, plus a 450 ms polling fallback that force-reveals everything after 4 s.
  Contact email in the mockup is `wieslawsamushonga01@gmail.com`.

## 6. Other files in the folder

- `.thumbnail` (23 KB) — a **WebP** image, the deck's gallery thumbnail. Not referenced by the HTML.
- `support.js` (69 KB) — the same `dc-runtime`, referenced by `home-standalone-src.html`.
- `uploads/claude-design-brief.md` (20 KB) — copy of the brief fed to Claude Design.
- `uploads/WIESLAW_SAMUSHONGA_Java SE.pdf` (133 KB) — a Java SE resume/certificate uploaded as input.

## 7. Bottom line

`Wieslaw Portfolio.html` adds **no new screens and no new design decisions** beyond `Home.dc.html`. It is a
redistributable, offline-capable copy of the Home page with fonts inlined — useful as a
**self-contained reference build and as the source of self-hostable webfonts**, not as a source of design intent.

The export as a whole delivers **2 of 7** requested deliverables (Foundations covers 1, 5, 6, 7; Home covers 2
at one fluid width). **Deliverable 3 (case study, `/work`, `/lab`, `/about`, `/resume`, 3 × `/admin`) and
deliverable 4 (component sheet) are entirely absent**, as are the four discrete breakpoint mockups.
