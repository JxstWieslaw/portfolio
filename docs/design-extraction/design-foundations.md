# Foundations — complete design-system extraction

Source: `c:\Users\wiesl\OneDrive\Documents\Github\JxstWieslaw\portfolio\docs\Portfolio Design\Foundations.dc.html` (552 lines)
Brief compared against: `c:\Users\wiesl\OneDrive\Documents\Github\JxstWieslaw\portfolio\docs\claude-design-brief.md`

Document self-identifies as **"Wieslaw Samushonga · Portfolio · Deliverable 01 / 05 / 07"** — i.e. it answers brief deliverables 1 (moodboard + type pairing), 5 (poster art direction) and 7 (token export). Its own lede:

> "Type pairing, colour semantics, glass surfaces over the Assembly, poster art direction for all seven formations, motion rules, and the token export. Everything below is the substrate the rest of the site is drawn on."

---

## 0. Document chrome / global base styles

Loaded from Google Fonts (verbatim):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,300..800&family=Geist:wght@300..700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

Global stylesheet (verbatim):

```css
html, body { margin:0; padding:0; background:#0D1117; }
* { box-sizing:border-box; }
a { color:#67E8F9; text-decoration:none; }
a:hover { color:#C4B5FD; }
::selection { background:#7C3AED; color:#F0F6FC; }
```

Root container:

```css
background:#0D1117;
color:#C9D1D9;
font-family:Geist, system-ui, sans-serif;
font-size:16px;
line-height:1.65;
-webkit-font-smoothing:antialiased;
padding:0 clamp(1rem, 4vw, 4rem) 128px;
```

Layout containers used throughout:
- Page header: `max-width:1440px; margin:0 auto; padding:96px 0 64px; border-bottom:1px solid #1F2937;`
- Standard section: `max-width:1440px; margin:0 auto; padding:96px 0 0;`
- Poster section (04) only: `max-width:1600px; margin:0 auto; padding:96px 0 0;`

Section eyebrow numerals — mono `0.75rem`, uppercase, `letter-spacing:0.12em`, sitting in a `display:flex; align-items:baseline; gap:16px; margin-bottom:8px` row with the h2. Colour alternates by subject:

| Section | Eyebrow colour |
|---|---|
| 01 Type pairing | `#A78BFA` (violet-400) |
| 02 Colour & semantics | `#A78BFA` |
| 03 Content over the Assembly | `#A78BFA` |
| 04 Poster art direction | `#22D3EE` (cyan-400) |
| 05 Motion & spacing rules | `#A78BFA` |
| 06 Token export | `#22D3EE` |

Standard card shell used for nearly every panel in the doc:

```css
background:#11161D;
border:1px solid #1F2937;
border-radius:20px;   /* 12px on the smaller info cards */
padding:32px;         /* 48px on the type-scale panel, 24px on info cards */
```

---

## 1. Type pairing

### 1.1 Families and rationale (verbatim)

> "Bricolage Grotesque · Geist · JetBrains Mono. Bricolage carries a width axis, so display text can be set narrow and tall to echo the Monolith without a second family; it has the slightly engineered, un-neutral character the brief asks for and stays legible at 24px on mobile. Geist is a quiet, tall-x-height body face built for screens — it disappears under the display type instead of competing with it. JetBrains Mono handles labels, dates and numerics, which is where the brief already speaks in mono."

| Role | Family | Stack (from token export) |
|---|---|---|
| Display | Bricolage Grotesque | `'Bricolage Grotesque',sans-serif` |
| Body | Geist | `Geist,system-ui,sans-serif` |
| Mono | JetBrains Mono | `'JetBrains Mono',ui-monospace,monospace` |

### 1.2 Axis ranges loaded

- **Bricolage Grotesque** — `wght 300–800 · wdth 75–100 · opsz 12–96` (font URL requests `opsz,wdth,wght@12..96,75..100,300..800`)
- **Geist** — `wght 300–700`; stated measure `65–75ch`
- **JetBrains Mono** — `wght 400;500` only (discrete, not variable in this load)

Stated axis policy (verbatim, from the Bricolage specimen card):
> "display-1 & display-2 at wdth 88, h2 at wdth 95"

### 1.3 Every `font-variation-settings` value actually used

| Where | `font-variation-settings` | weight | Notes |
|---|---|---|---|
| Page H1 "Foundations" (doc chrome) | `'wdth' 95, 'opsz' 96` | 600 | display-1 size but wdth 95, not 88 — doc-chrome exception |
| Bricolage specimen "Aa" | `'wdth' 88, 'opsz' 96` | 600 | 4.5rem |
| Bricolage specimen alphabet line | `'wdth' 92` | 500 | 1.25rem / 1.3 — **wdth 92 appears exactly once** |
| **display-1** (scale row) | `'wdth' 88, 'opsz' 96` | 600 | |
| **display-2** (scale row) | `'wdth' 90` | 600 | no opsz set; **contradicts the "display-2 at wdth 88" note** |
| **h2** (scale row + all live section h2s) | `'wdth' 95` | 600 | no opsz set |
| **h3** (scale row + all poster figcaptions) | `'wdth' 100` | 600 | no opsz set |
| Hero glass-panel headline | `'wdth' 88, 'opsz' 96` | 600 | display-1 axis settings at a hero-specific clamp |

`opsz` is **only ever set to 96**, and only on display-1-class text (page H1, specimen Aa, display-1 row, hero headline). All other Bricolage usages leave `opsz` to the browser's automatic optical sizing.

Bricolage weights used: **500** (specimen alphabet only) and **600** (everything else).

### 1.4 Full type scale — as applied

| Token | Family / axes | Weight | Size | Line-height | Letter-spacing | Colour | Measure |
|---|---|---|---|---|---|---|---|
| `--display-1` | Bricolage `wdth 88, opsz 96` | 600 | `clamp(2.75rem, 1.5rem + 5vw, 6.5rem)` | `1.0` | `-0.02em` | `#F0F6FC` | `text-wrap:balance`; 16ch max on page H1 |
| `--display-2` | Bricolage `wdth 90` | 600 | `clamp(2rem, 1.2rem + 3vw, 4rem)` | `1.05` | `-0.015em` | `#F0F6FC` | — |
| `--h2` | Bricolage `wdth 95` | 600 | `clamp(1.75rem, 1.3rem + 1.6vw, 2.75rem)` | `1.15` | `-0.015em` * | `#F0F6FC` | — |
| `--h3` | Bricolage `wdth 100` | 600 | `1.375rem` | `1.25` | none | `#F0F6FC` | — |
| `--body-lg` | Geist | 400 | `1.125rem` | `1.6` | none | `#C9D1D9` | `70ch` (68ch on header lede, 52ch inside the hero glass panel); `text-wrap:pretty` |
| `--body` | Geist | 400 | `1rem` | `1.65` | none | `#C9D1D9` | `72ch`; `text-wrap:pretty` |
| `--small` | Geist | 400 | `0.875rem` | `1.5` (card body copy) / `1.6` (poster captions, info-card copy) | none | `#8B949E` | — |
| `--label` | JetBrains Mono | 400 | `0.75rem` | — (`1.8` / `1.9` in stacked mono blocks) | `0.12em` | `#8B949E` (`#A78BFA`/`#22D3EE` for accent eyebrows) | `text-transform:uppercase` |

\* `letter-spacing:-0.015em` is applied on every live section h2 but is **not** declared in the h2 row of the specimen table, and is not tokenised.

Sizes used that are **not in the token export**:
- `1.25rem / 1.3` — Bricolage specimen alphabet line
- `4.5rem / 1.0` — the three "Aa" specimen glyphs (Bricolage `ls -0.02em`, Geist `ls -0.02em`, JetBrains Mono no ls)
- `1.125rem / 1.35` — JetBrains Mono specimen alphabet line
- `0.9375rem` (15px) — both hero CTA buttons
- `0.8125rem` (13px) — glass-recipe code block, motion duration table, the token-export `<pre>`
- `0.6875rem` (11px) — poster overlay badges

Scale-row sub-labels in the specimen table are set in `#30363D` (the strong-line colour used as ultra-faint text) — abbreviated forms: `clamp(2.75, 5vw, 6.5rem)`, `clamp(2, 3vw, 4rem)`, `clamp(1.75, 1.6vw, 2.75rem)`, `1.375rem / 1.25`, `1.125rem / 1.6`, `1rem / 1.65`, `0.75rem mono`.

### 1.5 Mono role (verbatim)

> "labels · dates · KPI values · stack chips — 0.75rem, uppercase, tracking 0.12em"

---

## 2. Colour & semantics

### 2.1 Governing rule (verbatim)

> "Violet is leadership and architecture. Cyan is craft and motion. The gradient appears in exactly three places — the Assembly, an optional clip on hero display text, and primary CTA hover — so it never becomes decoration."

### 2.2 Base tokens with stated roles

| Token | Hex | Role label in doc |
|---|---|---|
| `--bg-0` | `#0D1117` | page |
| `--bg-1` | `#11161D` | raised |
| `--bg-2` | `#161B22` | surface |
| `--line-1` | `#1F2937` | subtle |
| `--line-2` | `#30363D` | strong |
| `--fg-0` | `#F0F6FC` | headings |
| `--fg-1` | `#C9D1D9` | body |
| `--fg-2` | `#8B949E` | muted |
| `--fg-3` | `#6E7681` | dates |
| `--gradient` | `linear-gradient(90deg,#7C3AED 0%,#22D3EE 100%)` | 90deg violet→cyan |
| `--violet-500` | `#7C3AED` | — |
| `--violet-400` | `#A78BFA` | — |
| `--violet-300` | `#C4B5FD` | — |
| `--cyan-400` | `#22D3EE` | — |
| `--cyan-300` | `#67E8F9` | — |
| `--success` | `#3FB950` | — |
| `--warning` | `#D29922` | — |
| `--danger` | `#F85149` | — |

### 2.3 Accent family usage notes (verbatim)

**Violet · leadership** — swatches `500 #7C3AED · 400 #A78BFA · 300 #C4B5FD`
> "How I Lead, pillar cards, process strip, timeline markers, architecture diagrams. 400 and 300 only for text on dark."

**Cyan · craft** — swatches `400 #22D3EE · 300 #67E8F9 · 400/16% wash`
> "Craft, Lab, perf HUD, focus rings, links. Cyan is also the only focus colour — so it is never spent on decoration near an interactive element."

**Status** — `success · warning · danger`
> "Form states, admin status pills, transcode jobs. Never used on the public marketing surfaces."

### 2.4 Colours used in the design that are NOT in the base token list

| Value | Where used | Tokenised? |
|---|---|---|
| `rgba(17,22,29,0.72)` | glass panel background | yes — `--glass-bg` |
| `rgba(255,255,255,0.06)` | glass inner top highlight | yes — `--glass-highlight` |
| `rgba(124,58,237,.20)` | violet glow | yes — `--glow-violet` |
| `rgba(34,211,238,.20)` | cyan glow | yes — `--glow-cyan` |
| `rgba(34,211,238,0.16)` | cyan "400/16% wash" swatch | **no** |
| `rgba(167,139,250,0.35)` | violet role-card top border | **no** |
| `rgba(34,211,238,0.35)` | cyan role-card top border | **no** |
| `rgba(13,17,23,0.94)` / `0.62` / `0` | hero radial vignette stops | **no** |
| `rgba(13,17,23,0.6)` | poster overlay badge background | **no** |
| `rgba(13,17,23,0.85)` | poster edge-falloff outer stop (default) | **no** |
| `rgba(13,17,23,0.35)` | poster edge-falloff outer stop (hero override) | **no** |
| `rgba(0,0,0,0.55)` | scatter poster ground contact shadow | **no** |
| `rgba(240,246,252, 0.20 × depth)` | cube top-face highlight in poster render | **no** (derived from `--fg-0`) |
| `#3d4657` | spacing-scale chart bars (steps 16, 24) | **no** — chart-only |
| `#4b5570` | spacing-scale chart bars (steps 32, 48) | **no** — chart-only |
| `#6b5aa8` | spacing-scale chart bar (step 64) | **no** — chart-only |

The three greys `#3d4657`, `#4b5570`, `#6b5aa8` are a ramp invented purely to visualise the spacing scale (grey → violet → cyan). **They are not design tokens and should not be adopted.**

Interactive colour behaviour:
- Links rest `#67E8F9` (cyan-300), hover `#C4B5FD` (violet-300) — a cyan→violet crossover on hover.
- Selection: `background:#7C3AED; color:#F0F6FC`.

---

## 3. Glass surface recipe

Recommendation (verbatim):
> "The recommendation: no full-width scrim. Text sits on a glass panel with a hard left edge and an open right side, so the formation reads past it instead of behind a fog. A radial vignette anchored to the panel does the contrast work locally; the object stays bright where it is not competing with words."

### 3.1 Canonical glass panel (as applied on the hero)

```css
position: relative;
margin: 48px;
width: min(52%, 560px);
min-width: min(100%, 320px);
background: rgba(17,22,29,0.72);
backdrop-filter: blur(12px);
-webkit-backdrop-filter: blur(12px);
border: 1px solid #1F2937;
border-top: 1px solid rgba(255,255,255,0.06);
border-radius: 20px;
padding: 48px;
```

The doc's own summary card states it as:

```
bg rgba(17,22,29,0.72)
backdrop-filter: blur(12px)
border 1px #1F2937
border-top 1px rgba(255,255,255,0.06)
```

### 3.2 Companion radial vignette (anchored to the panel's left edge)

```css
/* absolutely positioned layer, inset:0, sitting between canvas and panel */
background: radial-gradient(85% 110% at 0% 50%,
  rgba(13,17,23,0.94) 0%,
  rgba(13,17,23,0.62) 45%,
  rgba(13,17,23,0)   78%);
```

Hero frame that holds both:

```css
position: relative;
border: 1px solid #1F2937;
border-radius: 20px;
overflow: hidden;
min-height: 520px;
display: flex;
align-items: center;
```

### 3.3 Lightweight glass variant (poster overlay badge)

```css
background: rgba(13,17,23,0.6);
backdrop-filter: blur(8px);
padding: 6px 10px;
border-radius: 6px;
/* type: JetBrains Mono 0.6875rem, uppercase, letter-spacing 0.12em, color #8B949E */
/* position: absolute; left:16px; top:16px; */
```

### 3.4 Elevation (verbatim)

> "No drop shadows on dark. Rest state is border only; hover and focus add an accent glow at 10–20% over 24px blur, plus a border colour shift. Nothing moves more than 2px."

Tokenised at the top of the stated range:
```css
--glow-violet: 0 0 24px rgba(124,58,237,.20);
--glow-cyan:   0 0 24px rgba(34,211,238,.20);
```

### 3.5 Contrast floor (verbatim)

> "Body text only ever sits on glass or on `--bg-0/1/2` — never directly on the formation. The vignette guarantees ≥ 4.5:1 even at the object's brightest frame."

### 3.6 Hero CTA buttons (the only documented button recipes)

Primary:
```css
display: inline-flex;
align-items: center;
white-space: nowrap;
min-height: 44px;
padding: 0 24px;
border-radius: 999px;
background: #F0F6FC;
color: #0D1117;
font-weight: 500;
font-size: 0.9375rem;
/* hover */
background: linear-gradient(90deg,#7C3AED 0%,#22D3EE 100%);
color: #F0F6FC;
```

Secondary:
```css
display: inline-flex;
align-items: center;
white-space: nowrap;
min-height: 44px;
padding: 0 24px;
border-radius: 999px;
border: 1px solid #30363D;
color: #C9D1D9;
font-weight: 500;
font-size: 0.9375rem;
/* hover */
border-color: #22D3EE;
color: #F0F6FC;
```

CTA row: `display:flex; gap:12px; flex-wrap:wrap;`

Hero content inside the glass panel:
- Eyebrow — mono `0.75rem`, uppercase, `0.12em`, `#8B949E`, `margin-bottom:24px`
- Headline — Bricolage `wdth 88, opsz 96`, 600, `clamp(2rem, 1.2rem + 3vw, 3.5rem)`, `lh 1.0`, `ls -0.02em`, `#F0F6FC`, `text-wrap:balance`, `margin-bottom:24px` — **note the 3.5rem ceiling, distinct from `--display-2`'s 4rem**
- Sub — `1.125rem / 1.6`, `#C9D1D9`, `max-width:52ch`, `text-wrap:pretty`, `margin:0 0 32px`

---

## 4. Poster art direction — all seven formations

### 4.1 Common rules (verbatim)

> "Seven stills — what the visitor sees with WebGL off, on a low-tier GPU, or with reduced motion. Common rules: the formation never touches the frame edge; exposure is set so the brightest cube is ~85% white, not blown; background is a single soft radial in the section's accent at 6–10% over `--bg-0`; bloom is a wide, low-alpha halo rather than a hot core. Colour runs violet at the base to cyan at the leading edge."

Poster figure shell:
```css
/* figure */
margin: 0;
background: #11161D;
border: 1px solid #1F2937;
border-radius: 20px;
overflow: hidden;

/* canvas well */
position: relative;
aspect-ratio: 16/10;
background: #0D1117;

/* figcaption */
padding: 24px;
/* h3: Bricolage wdth 100, 600, 1.375rem/1.25, #F0F6FC, margin 0 0 8px */
/* p:  0.875rem/1.6, #8B949E */
```

Grid: `display:grid; grid-template-columns:repeat(auto-fit, minmax(400px, 1fr)); gap:24px;`

### 4.2 Per-formation direction (verbatim descriptions)

**01 · Hero — Monolith**
> "Three-quarter view, object right of centre, base cropped by the lower edge so it reads as taller than frame. Warm violet floor light, cyan rim on the leading facet. Deepest bloom of the set — this is the one image that has to carry the page alone."

**02 · Proof strip — Stream**
> "Near-flat camera, band held to the middle third and bleeding off both sides. Low exposure — this poster sits under chips and must not compete. Violet at the left entry, cyan at the right exit."

**03 · Selected work — Lattice**
> "Shallow perspective on a drifting plane, horizon high so the grid falls away beneath the bento. Even exposure, minimal bloom — the cards are the subject here and the lattice is a floor."

**04 · How I lead — Orbit**
> "Centred and symmetrical — the only symmetrical poster in the set, which is the point. Violet-led: the core is violet-500, the rings fade toward cyan only at their far arcs. Rings tilted so none is edge-on."

**05 · Craft — Scatter**
> "Caught mid-settle, not at rest: a low pile with a few cubes still in the air. Brightest exposure of the set and the only one with a visible contact shadow on the ground plane. Cyan-led."

**06 · Stack — Grid**
> "A cubic lattice rotated a few degrees off axis so the rows never align with the chip rows in front of it. Flattest lighting, no bloom, gradient mapped to depth — order, read literally."

**07 · Contact — Ring**
> "A torus seen from slightly above, low in frame, the form's opening left clear for the contact panel. Softest and dimmest of the seven — the page exhales here. Full violet→cyan sweep around the circumference."

### 4.3 Exact renderer parameters (the numeric art direction)

The posters in the document are drawn live to `<canvas>` by the embedded script. The per-formation config table is the authoritative numeric spec:

```js
const cfg = {
  monolith:        { n: 2200, rot: 0.55, tilt: 0.10, scale: 0.36, cx: 0.63, cy: 0.86, bloom: 1.0,  wash: '#7C3AED', washA: 0.10, size: 3.1 },
  'monolith-hero': { n: 2600, rot: 0.55, tilt: 0.10, scale: 0.40, cx: 0.79, cy: 0.90, bloom: 1.25, wash: '#7C3AED', washA: 0.13, size: 3.3, vignette: 0.35 },
  stream:          { n: 1500, rot: 0.35, tilt: 0.06, scale: 0.24, cx: 0.50, cy: 0.50, bloom: 0.45, wash: '#22D3EE', washA: 0.06, size: 2.4 },
  lattice:         { n: 400,  rot: 0.42, tilt: 0.52, scale: 0.26, cx: 0.50, cy: 0.42, bloom: 0.35, wash: '#7C3AED', washA: 0.07, size: 2.8 },
  orbit:           { n: 2200, rot: 0.30, tilt: 0.30, scale: 0.30, cx: 0.50, cy: 0.50, bloom: 0.85, wash: '#7C3AED', washA: 0.11, size: 2.6 },
  scatter:         { n: 1700, rot: 0.22, tilt: 0.18, scale: 0.32, cx: 0.50, cy: 0.44, bloom: 1.15, wash: '#22D3EE', washA: 0.10, size: 3.2 },
  grid:            { n: 1,    rot: 0.62, tilt: 0.34, scale: 0.30, cx: 0.50, cy: 0.50, bloom: 0.18, wash: '#7C3AED', washA: 0.05, size: 2.6 },
  ring:            { n: 2000, rot: 0.20, tilt: 0.62, scale: 0.30, cx: 0.50, cy: 0.56, bloom: 0.55, wash: '#22D3EE', washA: 0.07, size: 2.5 }
};
```

Reading of each field:
- `n` — cube count (`grid` ignores `n` and builds a 9×9×9 lattice with 42% dropout)
- `rot` — Y-axis rotation (radians)
- `tilt` — X-axis tilt (radians)
- `scale` — object size as fraction of `min(W,H)`
- `cx`, `cy` — framing anchor as fraction of width/height
- `bloom` — bloom multiplier (bloom pass is skipped entirely when `bloom <= 0.2`, so **grid at 0.18 renders with no bloom at all**, matching its written direction)
- `wash` / `washA` — background radial accent colour and alpha
- `size` — base cube edge in px before perspective
- `vignette` — edge-falloff strength; **default 0.85**, hero overrides to `0.35`

Summary of framing / exposure / bias per poster:

| Poster | Anchor (cx, cy) | Rot / tilt | Cubes | Bloom | Background wash | Bias |
|---|---|---|---|---|---|---|
| Monolith (card) | 0.63, 0.86 | 0.55 / 0.10 | 2200 | 1.0 | `#7C3AED` @ 10% | violet |
| Monolith (hero) | 0.79, 0.90 | 0.55 / 0.10 | 2600 | **1.25 (highest)** | `#7C3AED` @ 13% | violet |
| Stream | 0.50, 0.50 | 0.35 / 0.06 | 1500 | 0.45 | `#22D3EE` @ 6% (lowest) | cyan |
| Lattice | 0.50, 0.42 | 0.42 / 0.52 | 400 (fewest) | 0.35 | `#7C3AED` @ 7% | violet |
| Orbit | 0.50, 0.50 | 0.30 / 0.30 | 2200 | 0.85 | `#7C3AED` @ 11% | violet |
| Scatter | 0.50, 0.44 | 0.22 / 0.18 | 1700 | 1.15 | `#22D3EE` @ 10% | cyan |
| Grid | 0.50, 0.50 | 0.62 (most) / 0.34 | 9³ w/ 42% dropout | **0.18 → none** | `#7C3AED` @ 5% | violet |
| Ring | 0.50, 0.56 | 0.20 / **0.62 (most)** | 2000 | 0.55 | `#22D3EE` @ 7% | cyan |

### 4.4 Exact gradient / paint recipes used

**Background accent wash** (`createRadialGradient` centred on the framing anchor, radius `max(W,H) × 0.72`):

```js
ctx.fillStyle = '#0D1117'; ctx.fillRect(0, 0, W, H);
const gr = ctx.createRadialGradient(W*cfg.cx, H*cfg.cy, 0, W*cfg.cx, H*cfg.cy, Math.max(W,H)*0.72);
gr.addColorStop(0, 'rgba(<wash r>,<wash g>,<wash b>,' + cfg.washA + ')');
gr.addColorStop(1, 'rgba(13,17,23,0)');
ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
```

CSS equivalent (e.g. monolith card):
```css
background:
  radial-gradient(circle at 63% 86%, rgba(124,58,237,0.10) 0%, rgba(13,17,23,0) 72%),
  #0D1117;
```

**Edge falloff so the formation never touches the frame** — inner stop starts at `min(W,H)×0.28`:

```js
const vg = ctx.createRadialGradient(W*0.5, H*0.5, Math.min(W,H)*0.28, W*0.5, H*0.5, Math.max(W,H)*0.72);
vg.addColorStop(0, 'rgba(13,17,23,0)');
vg.addColorStop(1, 'rgba(13,17,23,' + (cfg.vignette != null ? cfg.vignette : 0.85) + ')');
ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
```

**Scatter-only ground contact shadow** (the only poster with one):

```js
const sg = ctx.createRadialGradient(W*0.5, H*0.78, 0, W*0.5, H*0.78, W*0.42);
sg.addColorStop(0, 'rgba(0,0,0,0.55)');
sg.addColorStop(1, 'rgba(0,0,0,0)');
```

**Colour ramp — violet base → cyan leading edge** (linear RGB lerp `#7C3AED` → `#22D3EE`):

```js
const shade = (q) => {
  const t = Math.max(0, Math.min(1, q.t));
  return [
    Math.round(124 + (34  - 124) * t),   // R: 124 → 34
    Math.round(58  + (211 - 58 ) * t),   // G:  58 → 211
    Math.round(237 + (238 - 237) * t)    // B: 237 → 238
  ];
};
```

**Bloom pass** — additive, wide, low alpha (only when `bloom > 0.2`):

```js
ctx.globalCompositeOperation = 'lighter';
// per cube:
const depth = Math.max(0.18, Math.min(1, 0.55 + q.d * 0.55));
const s = cfg.size * q.d;
ctx.fillStyle = 'rgba(R,G,B,' + (0.032 * cfg.bloom * depth).toFixed(3) + ')';
ctx.fillRect(q.x - s*2.2, q.y - s*2.2, s*4.4, s*4.4);   // halo is 4.4× the cube
```

**Cube pass + top-face highlight** (the "~85% white brightest cube" exposure rule — core alpha caps at 0.88):

```js
ctx.globalCompositeOperation = 'source-over';
ctx.fillStyle = 'rgba(R,G,B,' + (0.88 * depth).toFixed(3) + ')';
ctx.fillRect(q.x - s/2, q.y - s/2, s, s);
ctx.fillStyle = 'rgba(240,246,252,' + (0.20 * depth).toFixed(3) + ')';   // --fg-0 at 20%
ctx.fillRect(q.x - s/2, q.y - s/2, s, Math.max(0.6, s*0.3));             // top 30% band
```

**Projection** — Y-rotate, X-tilt, weak perspective, painter's-algorithm sort:

```js
const cy = Math.cos(cfg.tilt), sy = Math.sin(cfg.tilt);
const cr = Math.cos(cfg.rot),  sr = Math.sin(cfg.rot);
const S = Math.min(W,H) * cfg.scale * (W / Math.max(H,1) > 1.75 ? 1.05 : 1);  // ultrawide bump

let x1 = x*cr - z*sr,  z1 = x*sr + z*cr;
let y1 = y*cy - z1*sy, z2 = y*sy + z1*cy;
const d = 1 / (1 + z2 * 0.16);
// screen: { x: W*cfg.cx + x1*S*d, y: H*cfg.cy - y1*S*d, z: z2, d, t }
// then .sort((a,b) => b.z - a.z)
```

DPR is capped: `Math.min(window.devicePixelRatio || 1, 2)`.

Deterministic RNG (so posters are reproducible) — LCG seeded from the formation name:

```js
rng(seed) { let s = seed; return () => { s = (s*1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
// seed = kind.length * 7919 + 12345
```

### 4.5 Formation point generators (geometry spec, verbatim)

```js
// monolith — tapering 5-face column, base at y=-1.35, top at y=+1.55
for (let i = 0; i < n; i++) {
  const t = r();
  const y = -1.35 + t * 2.9;
  const taper = 0.40 - 0.17 * t;
  const face = Math.floor(r() * 5);
  let x, z;
  const u = g(-1, 1);
  if (face === 0) { x = -taper; z = u * taper; }
  else if (face === 1) { x = taper; z = u * taper; }
  else if (face === 2) { x = u * taper; z = -taper; }
  else if (face === 3) { x = u * taper; z = taper; }
  else { x = u * taper * 0.9; z = g(-1, 1) * taper * 0.9; }
  const j = 0.055;
  p.push([x + g(-j, j), y + g(-j, j), z + g(-j, j), t]);
}
// a few detached cubes still arriving
for (let i = 0; i < n * 0.06; i++) p.push([g(-2.4, 2.4), g(-1.2, 1.9), g(-1.6, 1.6), r()]);

// stream — sine/cosine river spanning x = -2.6 … +2.6, bleeding off both sides
const t = r();
const x = -2.6 + t * 5.2;
const y = Math.sin(x * 1.15) * 0.20 + g(-0.14, 0.14);
const z = Math.cos(x * 0.75) * 0.32 + g(-0.28, 0.28);
p.push([x, y, z, t]);

// lattice — 26 × 15 plane, 10% dropout, gentle wave
const cols = 26, rows = 15;
if (r() < 0.10) continue;
const x = (i / (cols - 1) - 0.5) * 4.6;
const z = (j / (rows - 1) - 0.5) * 3.4;
const y = Math.sin(x * 0.9 + z * 0.6) * 0.13 + g(-0.05, 0.05);
p.push([x, y, z, (i / cols) * 0.6 + (1 - j / rows) * 0.4]);

// orbit — 22% of cubes in the core, three tilted rings at 19% each
const core = Math.floor(n * 0.22);
const rr = Math.pow(r(), 0.75) * 0.55;              // core radius
const tilts = [[0.28, 0.15], [-0.55, 0.9], [0.75, -0.6]];
const radii = [0.95, 1.25, 1.55];
// per ring k: cnt = Math.floor(n * 0.19), R = radii[k] + g(-0.05, 0.05), y = g(-0.035, 0.035)
// far arc only reaches mid-ramp; rings stay violet-led:
const far = (Math.cos(a) + 1) / 2;
p.push([x2, y2, z2, 0.05 + k * 0.07 + far * 0.34 + r() * 0.04]);

// scatter — 14% still airborne, pile falls off with |x|, ground at y = -0.95
const air = r() < 0.14;
const x = g(-2.0, 2.0);
const pile = Math.max(0, 0.85 - Math.abs(x) * 0.42);
const y = air ? g(0.5, 1.9) : -0.95 + Math.pow(r(), 1.6) * (pile + 0.12);
const z = g(-1.1, 1.1) * (air ? 1 : 0.85);
p.push([x, y, z, air ? 0.35 : 0.58 + (y + 0.95) * 0.42]);

// grid — 9³ cubic lattice, 42% dropout, gradient mapped to depth (k axis)
const s = 9;
if (r() < 0.42) continue;
p.push([(i/(s-1) - 0.5) * 2.5, (j/(s-1) - 0.5) * 2.5, (k/(s-1) - 0.5) * 2.5, k / (s-1)]);

// ring — torus, major R = 1.25, minor t2 ≈ 0.30, gradient = angle around circumference
const a = r() * Math.PI * 2, b = r() * Math.PI * 2;
const R = 1.25, t2 = 0.30 + g(-0.05, 0.05);
const x = (R + t2 * Math.cos(b)) * Math.cos(a);
const z = (R + t2 * Math.cos(b)) * Math.sin(a);
const y = t2 * Math.sin(b);
p.push([x, y, z, (a / (Math.PI * 2))]);
```

Note the ramp value (4th element, `t`) is the colour position — it confirms each poster's stated bias: monolith/stream use height or travel; orbit clamps `t` to ≈0.05–0.46 (never reaching full cyan → "violet-led"); grid maps `t` to depth; ring maps `t` to full 0→1 circumference sweep.

### 4.6 Fallback ladder (verbatim, 5 rungs)

Card style: `background:#11161D; border:1px dashed #30363D; border-radius:20px; padding:32px;`

1. **WebGL + high tier** — live Assembly, full formation morphs.
2. **WebGL + low tier** — reduced instance count, morphs kept, physics off.
3. **Reduced motion** — the poster for the current section, cross-faded on scroll at 200ms opacity only.
4. **No WebGL** — static poster, no cross-fade.
5. **No images** — the section's radial accent wash alone. Layout never shifts; posters are sized to the same box in every rung.

---

## 5. Motion rules

Governing rule (verbatim):
> "Four durations, one easing curve, and a hard rule: the only thing that moves without the visitor is the Assembly's idle breathing."

| Duration | What it drives |
|---|---|
| `120ms` (`--d-1`) | colour, border, chip |
| `200ms` (`--d-2`) | hover, focus, glow |
| `320ms` (`--d-3`) | reveals, nav condense |
| `560ms` (`--d-4`) | sheet, formation cross-fade |

Easing — one curve only:
```css
--ease: cubic-bezier(.2,.8,.2,1);   /* labelled "ease-out", shown in #67E8F9 */
```

Displacement cap (from the Elevation card): **"Nothing moves more than 2px."**

Reduced motion:
```css
@media (prefers-reduced-motion: reduce) {
  :root { --d-1:1ms; --d-2:1ms; --d-3:1ms; --d-4:1ms; }
}
```

Reduced-motion poster behaviour (fallback ladder rung 3): "the poster for the current section, cross-faded on scroll at 200ms opacity only."

---

## 6. Token export — VERBATIM AND COMPLETE

Intro (verbatim): *"Drop-in custom properties. Semantic names only — a light theme can be added later by overriding the same keys."*

```css
:root {
  --bg-0:#0D1117; --bg-1:#11161D; --bg-2:#161B22;
  --line-1:#1F2937; --line-2:#30363D;
  --fg-0:#F0F6FC; --fg-1:#C9D1D9; --fg-2:#8B949E; --fg-3:#6E7681;
  --violet-500:#7C3AED; --violet-400:#A78BFA; --violet-300:#C4B5FD;
  --cyan-400:#22D3EE; --cyan-300:#67E8F9;
  --gradient:linear-gradient(90deg,#7C3AED 0%,#22D3EE 100%);
  --success:#3FB950; --warning:#D29922; --danger:#F85149;

  --glass-bg:rgba(17,22,29,.72);
  --glass-blur:12px;
  --glass-highlight:rgba(255,255,255,.06);
  --glow-violet:0 0 24px rgba(124,58,237,.20);
  --glow-cyan:0 0 24px rgba(34,211,238,.20);

  --font-display:'Bricolage Grotesque',sans-serif;
  --font-body:Geist,system-ui,sans-serif;
  --font-mono:'JetBrains Mono',ui-monospace,monospace;
  --display-1:clamp(2.75rem,1.5rem + 5vw,6.5rem);
  --display-2:clamp(2rem,1.2rem + 3vw,4rem);
  --h2:clamp(1.75rem,1.3rem + 1.6vw,2.75rem);
  --h3:1.375rem; --body-lg:1.125rem; --body:1rem; --small:.875rem;
  --label:.75rem;

  --s-1:4px;  --s-2:8px;   --s-3:12px;  --s-4:16px;  --s-5:24px;
  --s-6:32px; --s-7:48px;  --s-8:64px;  --s-9:96px;  --s-10:128px; --s-11:192px;
  --section-y:clamp(4rem,10vw,10rem);
  --page-x:clamp(1rem,4vw,4rem);
  --max-content:1440px; --max-bento:1600px; --gutter:24px;

  --r-chip:6px; --r-card:12px; --r-panel:20px; --r-pill:999px;
  --d-1:120ms; --d-2:200ms; --d-3:320ms; --d-4:560ms;
  --ease:cubic-bezier(.2,.8,.2,1);
  --focus:0 0 0 2px var(--bg-0), 0 0 0 4px var(--cyan-400);
}

@media (prefers-reduced-motion: reduce) {
  :root { --d-1:1ms; --d-2:1ms; --d-3:1ms; --d-4:1ms; }
}
```

The export block is rendered in a `<pre>` styled: `background:#0D1117; border:1px solid #1F2937; border-radius:20px; padding:32px; overflow-x:auto; font-family:'JetBrains Mono'; font-size:0.8125rem; line-height:1.9; color:#C9D1D9;`

---

## 7. Spacing, radii, grid, breakpoints

### 7.1 Spacing scale (verbatim)

`4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128 · 192`

Tokens `--s-1` … `--s-11`. The visualisation renders only 10 bars (heights 4, 8, 12, 16, 24, 32, 48, 64, 96, 120 within a 120px-tall row) — the 128 bar is clipped to 120 and **192 has no bar**. Chart-only, not a spec change.

Section rhythm: `--section-y:clamp(4rem,10vw,10rem)`. (The document itself uses a literal `96px` top padding for its own sections, and `0 clamp(1rem,4vw,4rem) 128px` on the root.)

Page inset: `--page-x:clamp(1rem,4vw,4rem)`.

### 7.2 Radii (verbatim)

`6 chips · 12 cards · 20 panels · full pills`

```css
--r-chip:6px; --r-card:12px; --r-panel:20px; --r-pill:999px;
```
Demo swatches: 56×56 boxes with `border:1px solid #30363D`; pill demo 88×44.

### 7.3 Grid & container widths

```css
--max-content:1440px;   /* standard sections */
--max-bento:1600px;     /* poster / bento grid section only */
--gutter:24px;
```

The document declares **no explicit breakpoints**. All responsiveness is container-driven via `auto-fit` minmax thresholds:

| Grid | Track template |
|---|---|
| Type specimen cards | `repeat(auto-fit, minmax(320px, 1fr))`, gap 24 |
| Colour swatch rows | `repeat(auto-fit, minmax(150px, 1fr))`, gap 12 |
| Colour role cards | `repeat(auto-fit, minmax(240px, 1fr))`, gap 24 |
| Info cards / motion cards | `repeat(auto-fit, minmax(280px, 1fr))`, gap 24 |
| Poster grid | `repeat(auto-fit, minmax(400px, 1fr))`, gap 24 |
| Type-scale rows | `grid-template-columns:180px 1fr`, gap 24, `align-items:baseline` |

Glass panel responsive rule: `width:min(52%, 560px); min-width:min(100%, 320px);` — collapses to full width below ~1077px container width.

### 7.4 Focus ring (verbatim)

> "Focus ring: 2px `#22D3EE` at 2px offset, on every focusable element, never removed on mouse."

Implemented as a double box-shadow (inner ring in page background acts as the offset):
```css
--focus: 0 0 0 2px var(--bg-0), 0 0 0 4px var(--cyan-400);
```

### 7.5 Touch targets

Both hero CTAs set `min-height:44px` — the brief's ≥44px rule, honoured.

---

## 8. Deviations & extensions vs `docs/claude-design-brief.md`

### 8.1 Answers to OPEN questions

- **Type pairing** — the design adopts the brief's *recommended* pairing (Bricolage Grotesque + Geist + JetBrains Mono) rather than the Clash Display + Satoshi + Geist Mono alternative, with the stated rationale that Bricolage's width axis lets display text "echo the Monolith without a second family."
- **Hero composition over the Monolith** — the brief offered three options ("glass panel? gradient scrim? offset composition?"). The design **explicitly rejects a full-width scrim** and answers: glass panel with hard left edge + open right side, plus a *locally anchored* radial vignette (`radial-gradient(85% 110% at 0% 50%, …)`). It is effectively "glass panel + partial scrim + offset composition" combined.
- **Poster art direction** — fully specified, with numeric renderer parameters that go well beyond the brief's request for "framing, exposure, bloom, background gradient."

### 8.2 Extensions (new material the brief did not specify)

1. **Per-level Bricolage width axis** — `wdth 88 / 90 / 95 / 100` mapped to display-1 / display-2 / h2 / h3, and `opsz 96` locked on display-1-class text only. The brief said only "has width/optical axes — distinctive."
2. **h2 `letter-spacing:-0.015em`** — applied on every live h2 but not in the brief (brief specified only `lh 1.15` for h2) and not in the specimen row or the token export.
3. **Glow values pinned to the top of the brief's range** — brief said "soft accent glow (10–20% at 24px blur)"; design fixes both `--glow-violet` and `--glow-cyan` at exactly **20%** / 24px.
4. **"Nothing moves more than 2px"** — a hard displacement cap on hover/focus, not in the brief.
5. **Contrast-floor rule** — "Body text only ever sits on glass or on `--bg-0/1/2` — never directly on the formation. The vignette guarantees ≥ 4.5:1 even at the object's brightest frame." A concrete mechanism for the brief's generic AA requirement.
6. **Exposure rule** — "brightest cube is ~85% white, not blown" (implemented as core alpha 0.88 × depth). Not in the brief.
7. **Five-rung fallback ladder** — the brief mentioned three fallback conditions; the design adds a "no images" rung (radial accent wash alone) and the layout-stability guarantee "posters are sized to the same box in every rung."
8. **Per-poster background wash assignment** — violet for Monolith/Lattice/Orbit/Grid, cyan for Stream/Scatter/Ring, at 5–13% alpha. The brief only established violet=leadership / cyan=craft for *sections*; extending it to Lattice (Selected Work), Grid (Stack), Stream (Proof strip) and Ring (Contact) is a new mapping the brief does not declare.
9. **Link hover colour crossover** — `a` rest `#67E8F9` (cyan-300) → hover `#C4B5FD` (violet-300). Not specified in the brief.
10. **Selection styling** — `::selection { background:#7C3AED; color:#F0F6FC; }`. Not in the brief.
11. **Focus ring as a two-layer box-shadow** rather than `outline` + `outline-offset` — `--focus:0 0 0 2px var(--bg-0), 0 0 0 4px var(--cyan-400)`. Functionally matches "cyan 2px at 2px offset" but constrains implementation (it won't follow non-rectangular outlines and needs `border-radius` to match).
12. **Extra tokenised primitives not asked for** — `--glass-bg`, `--glass-blur`, `--glass-highlight`, `--font-*`, `--section-y`, `--page-x`, `--max-content`, `--max-bento`, `--gutter`, `--r-*`, `--d-*`, `--ease`, `--focus`.
13. **Secondary lightweight glass** — `rgba(13,17,23,0.6)` + `blur(8px)` for overlay badges, a second glass tier the brief never defined.
14. **Poster aspect ratio 16/10** applied to all seven stills (the brief only specified 16:10 for `/lab` viewports).
15. **Deterministic seeded rendering** — LCG seeded on formation name, so posters are byte-reproducible. Useful for pre-rendering the static poster assets.

### 8.3 Genuine deviations / conflicts to resolve

1. **Internal contradiction on display-2's width axis.** The specimen card states *"display-1 & display-2 at wdth 88"*, but the display-2 scale row renders at **`wdth 90`**. Pick one — the applied CSS (90) is likely the intent since it was typed deliberately per-element.
2. **The document's own H1 uses `wdth 95`** at display-1 size, contradicting the wdth-88 rule for display-1. This is document chrome, not a rule change — do not propagate.
3. **Hero headline clamp ceiling is 3.5rem, not 4rem.** The in-hero display uses `clamp(2rem, 1.2rem + 3vw, 3.5rem)`, which matches neither `--display-1` (6.5rem) nor `--display-2` (4rem). Because it sits inside a `min(52%, 560px)` glass panel it needs its own token — currently untokenised.
4. **Reduced-motion conflict.** The fallback ladder says posters "cross-fade on scroll at 200ms opacity only" under reduced motion, but `@media (prefers-reduced-motion: reduce)` sets `--d-2:1ms`. If the cross-fade uses `--d-2` it will be crushed to 1ms. The 200ms opacity cross-fade needs its own token that survives the reduced-motion override.
5. **Prose measure below the brief's floor.** Brief fixes measure at 65–75ch. Applied measures: 70ch, 72ch, 68ch — all in range — but the **hero sub is 52ch** and the display H1 caps at **16ch**. The 52ch is a deliberate consequence of the narrow glass panel; call it an accepted exception, not an error.
6. **Type sizes used but not tokenised** — `0.9375rem` (both CTA buttons), `0.6875rem` (poster badges), `0.8125rem` (code/data blocks), `1.25rem`, `1.35`-lh mono. The export jumps `--small:.875rem` → `--body:1rem` with nothing between, so the 15px button size has no token.
7. **`--small` line-height is inconsistent.** Brief specifies `small 0.875rem / 1.5`. The document uses **1.5** on the colour role-card paragraphs and **1.6** on poster captions and info-card copy. Line-heights are not tokenised at all.
8. **Mobile gutter missing.** Brief: "gutter 24 (16 on mobile)". Token export has only `--gutter:24px` — no mobile override.
9. **12-column grid not expressed.** The brief fixes a 12-column grid; the token export and the document express only max-widths, gutter and `auto-fit` minmax tracks. No column token exists.
10. **Breakpoints absent.** Brief fixes 390 / 834 / 1440 / 2560 (plus 360, 640, 1024, 1280, 1536, 1920, 32:9). This document defines **no breakpoints**; the only ultrawide accommodation is inside the poster renderer (`W/H > 1.75 → scale × 1.05`). Breakpoint tokens must come from another deliverable.
11. **Icons undocumented.** Brief fixes Lucide, 1.5px stroke, 20/24px. The Foundations document says nothing about icons — a gap, not a contradiction.
12. **Off-token chart greys.** `#3d4657`, `#4b5570`, `#6b5aa8` appear in the spacing-scale visualisation only. They are not tokens and must not enter the system.
13. **`rgba(34,211,238,0.16)` cyan wash and the two `0.35` accent border tints** are shown as system values in the colour section but are absent from the token export — they should be tokenised (`--cyan-wash`, `--accent-edge-violet`, `--accent-edge-cyan`) if used in the build.
14. **`--bg-2` (`#161B22`) is documented but never used** anywhere in the document's own rendering; every raised surface uses `--bg-1` (`#11161D`).
15. **`--success` / `--warning` / `--danger` are shown but explicitly scoped out of the public site** — "Never used on the public marketing surfaces." Admin-only.

---

## 9. Quick-reference index of every literal value in the file

**Hex:** `#0D1117` `#11161D` `#161B22` `#1F2937` `#30363D` `#3d4657` `#4b5570` `#6b5aa8` `#F0F6FC` `#C9D1D9` `#8B949E` `#6E7681` `#7C3AED` `#A78BFA` `#C4B5FD` `#22D3EE` `#67E8F9` `#3FB950` `#D29922` `#F85149`

**RGBA:** `rgba(17,22,29,.72)` `rgba(255,255,255,.06)` `rgba(124,58,237,.20)` `rgba(34,211,238,.20)` `rgba(34,211,238,0.16)` `rgba(167,139,250,0.35)` `rgba(34,211,238,0.35)` `rgba(13,17,23,0.94)` `rgba(13,17,23,0.62)` `rgba(13,17,23,0.6)` `rgba(13,17,23,0)` `rgba(0,0,0,0.55)` `rgba(0,0,0,0)` `rgba(240,246,252,·)`

**Clamps:** `clamp(2.75rem,1.5rem + 5vw,6.5rem)` `clamp(2rem,1.2rem + 3vw,4rem)` `clamp(2rem,1.2rem + 3vw,3.5rem)` `clamp(1.75rem,1.3rem + 1.6vw,2.75rem)` `clamp(4rem,10vw,10rem)` `clamp(1rem,4vw,4rem)`

**Radii:** `6px` `12px` `20px` `999px` `2px` (chart bars)

**Durations:** `120ms` `200ms` `320ms` `560ms` `1ms` (reduced) · `150ms` (resize debounce in the renderer)

**Easing:** `cubic-bezier(.2,.8,.2,1)`

**Spacing:** `4 8 12 16 24 32 48 64 96 128 192`

**Blur:** `12px` (panel glass) · `8px` (badge glass)
