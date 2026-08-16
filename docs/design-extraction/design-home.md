# Home page — complete design extraction

Source of truth for a React + Tailwind v4 rebuild.

Files read in full:

| File | Lines | Bytes | Role |
|---|---|---|---|
| `docs/Portfolio Design/Home.dc.html` | 911 | 104,704 | **Current** home page design (canonical) |
| `docs/Portfolio Design/Home v1.dc.html` | 893 | 98,103 | Earlier version |
| `docs/Portfolio Design/home-standalone-src.html` | 931 | 105,791 | Byte-identical to `Home.dc.html` + a 20-line thumbnail `<template>` |

Sibling files in the same directory (not requested, noted for context): `Foundations.dc.html` (552 lines — the design-token / component foundations page), `support.js` (1,911 lines — the Claude Design runtime), `Wieslaw Portfolio.html` (403 lines — the fully-bundled single-file export with inlined `@font-face`), `.thumbnail`, `uploads/`.

---

## 0. Global / document level

### 0.1 Head

```html
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="./support.js"></script>
```

### 0.2 `<helmet>` block — fonts + global stylesheet (verbatim)

```html
<helmet>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,300..800&family=Geist:wght@300..700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  html, body { margin:0; padding:0; background:#0D1117; }
  * { box-sizing:border-box; }
  a { color:#C9D1D9; text-decoration:none; }
  a:hover { color:#F0F6FC; }
  :focus-visible { outline:2px solid #22D3EE; outline-offset:2px; border-radius:6px; }
  ::selection { background:#7C3AED; color:#F0F6FC; }
  input, textarea, button { font:inherit; }
  @keyframes wsScrollCue { 0%,100% { transform:translateY(0); opacity:.5 } 50% { transform:translateY(6px); opacity:1 } }
  @media (prefers-reduced-motion: reduce) { * { animation-duration:.001ms !important; transition-duration:.001ms !important } }
</style>
</helmet>
```

Three families, all variable:
- **Bricolage Grotesque** — axes `opsz 12..96`, `wdth 75..100`, `wght 300..800`. Display face. Every use sets `font-variation-settings` explicitly.
- **Geist** — `wght 300..700`. Body face, set on the root as `font-family:Geist, system-ui, sans-serif`.
- **JetBrains Mono** — `wght 400;500`. All eyebrows, labels, chips, metadata.

### 0.3 Root wrapper

```html
<div ref="{{ rootRef }}" style="background:#0D1117; color:#C9D1D9; font-family:Geist, system-ui, sans-serif; font-size:16px; line-height:1.65; -webkit-font-smoothing:antialiased;">
```

`font-size:16px` on the root means **1rem = 16px throughout**; all the rem values below are literal 16px multiples.

`ref="{{ rootRef }}"` binds the DOM node into the component instance (`this.root`) and schedules the first canvas paint on the next animation frame.

### 0.4 Colour tokens (every distinct value used on the page)

| Token role | Hex / rgba | Where |
|---|---|---|
| Page background | `#0D1117` | html/body, root, experience section, footer |
| Raised surface | `#161B22` | skip link, writing article cards |
| Writing section bg | `#11161D` | `#writing` section |
| Glass panel (hero/craft/stat/process) | `rgba(17,22,29,0.72)` / `0.76` / `0.78` / `0.86` / `0.88` / `0.62` | see per-section |
| Glass panel (work/habit/stack aside) | `rgba(22,27,34,0.78)` / `0.80` / `0.5` / `0.95` | see per-section |
| Hairline / subtle border | `#1F2937` | section rules, card borders, grid gap fill |
| Border, standard | `#30363D` | buttons, inputs, chips, dashed placeholders |
| Body text | `#C9D1D9` | paragraphs, links default |
| Muted text | `#8B949E` | eyebrow labels, secondary copy, nav idle |
| Primary text | `#F0F6FC` | headings, emphasis |
| Violet 500 | `#7C3AED` | selection bg, bullet glyphs (Habit 01), canvas wash, glows |
| Violet 400 | `#A78BFA` | section eyebrow numbers, hover borders, timeline dot 1 |
| Violet 300 | `#C4B5FD` | process step 02, stack "Languages" label, social-services chip |
| Fuchsia 400 | `#E879F9` | Habit 02 bullets, canvas gradient midpoint |
| Fuchsia 300 | `#F0ABFC` | Habit 02 eyebrow, "Creator economy" chip, Ikarus 3D timeline |
| Cyan 400 | `#22D3EE` | focus ring, primary accent, Habit 03 bullets, craft eyebrow |
| Cyan 300 | `#67E8F9` | "Interactive 3D" chip, "Read the case study" on cyan cards |
| Emerald 300 | `#6EE7B7` | "Healthcare" chip, Cloud & DevOps label, Baeldung timeline |
| Amber 300 | `#FCD34D` | "Education" / "Procurement / ERP" chips, Tooling label |
| Warning | `#D29922` | "In preparation" badge, rate-limited form state |
| Success | `#3FB950` | HUD fps readout, form success state |
| Danger | `#F85149` | email validation error, form error state |

### 0.5 Motion tokens

| Purpose | Value |
|---|---|
| Standard ease | `cubic-bezier(.2,.8,.2,1)` |
| Card hover | `200ms cubic-bezier(.2,.8,.2,1)` on `border-color, box-shadow` |
| Nav condense | `320ms cubic-bezier(.2,.8,.2,1)` on `height, background, border-color` |
| Reveal | `opacity 560ms cubic-bezier(.2,.8,.2,1)` + `transform 560ms …`, stagger `index * 70ms` |
| Scroll cue | `wsScrollCue 2.4s ease-in-out infinite` |
| Glow (cyan) | `box-shadow:0 0 24px rgba(34,211,238,0.20)` |
| Glow (violet) | `box-shadow:0 0 24px rgba(124,58,237,0.20)` |
| Reduced motion | all animation/transition durations forced to `.001ms` |

### 0.6 Templating syntax and what it implies

| Syntax | Meaning | React equivalent |
|---|---|---|
| `<x-dc>` | Component root marker (Claude Design wrapper). `support.js` sets `x-dc{display:none!important}` until hydrated. | Nothing — it is the component boundary |
| `<helmet>` | Head injection block (rewritten to `<sc-helmet>` internally) | `next/head` / root layout `<head>` |
| `{{ expr }}` | One-way binding into a value returned by `renderVals()` | Prop / state expression |
| `ref="{{ rootRef }}"` | Callback ref | `ref={rootRef}` |
| `style="{{ navStyle }}"` | Whole style string computed in JS — **derived, stateful styling** | `style={navStyle}` or a `data-*` + CSS variant |
| `style-hover="…"` | `:hover` overlay declarations. 41 occurrences. Not handled by `support.js` — an authoring convention consumed by the Design renderer. | Tailwind `hover:` utilities |
| `style-focus="…"` | `:focus` / `:focus-visible` overlay declarations. 3 occurrences (skip link, name input, message textarea) | `focus:` / `focus-visible:` utilities |
| `<sc-if value="{{ x }}" hint-placeholder-val="{{ bool }}">` | Conditional render; `hint-placeholder-val` is the value the *design canvas* previews with (so the designer can see the branch). 3 occurrences. | `{x && <…/>}` |
| `onClick="{{ fn }}"`, `onSubmit="{{ fn }}"` | Event handlers from `renderVals()` | `onClick={fn}` |
| `disabled="{{ true }}"`, `noValidate="{{ true }}"`, `aria-pressed="{{ physicsOn }}"` | Boolean/dynamic attributes | same |
| `data-reveal` | Marks an element for the IntersectionObserver stagger-reveal. 25 elements on the page (+4 selector references in JS = 29 raw string hits). | A `<Reveal>` wrapper component |
| `data-f="<kind>"` | Names which generative canvas formation to paint into this `<canvas>` | prop on a `<FieldCanvas kind="…">` |

### 0.7 THE RESPONSIVE FINDING — read this first

**There is not a single width-based media query in the file.** The only `@media` rule in `Home.dc.html` is `@media (prefers-reduced-motion: reduce)` at line 23. `Home v1.dc.html` and `home-standalone-src.html` are the same.

All fluidity is achieved with:
- `clamp()` — 24 occurrences in `Home.dc.html` (26 in v1, 24 in standalone)
- `min()` — hero panel `min(56%, 700px)`, craft panel `min(38%, 460px)`
- `ch` / `%` / `vw` / `dvh` / `vh` units
- `flex-wrap:wrap` on chip rows and the work-section header

Every multi-column grid is a **fixed track count** (`repeat(6,1fr)`, `repeat(4,1fr)`, `repeat(3,1fr)`, `repeat(5,1fr)`, `repeat(2,1fr)`, `1fr 380px`, `1fr 200px`, `1fr auto`, `1fr clamp(320px,38vw,520px)`). **None of them collapse.** At 390px the design is structurally broken as authored (see per-section "at 390" notes below).

**Implication for the rebuild:** the engineer must author the mobile and tablet breakpoints. The `.dc.html` is a *desktop* specification with fluid type and spacing. Recommended reading: treat 1440 as the design width, 2560 as "already handled by max-width", and 834/390 as work to be added.

#### Clamp evaluation table (1rem = 16px)

| Declaration | Used by | @390 | @834 | @1440 | @2560 |
|---|---|---|---|---|---|
| `clamp(1rem, 4vw, 4rem)` | horizontal page padding, hero scroll-cue `left` | **16px** (floor) | 33.36px | 57.6px | **64px** (cap) |
| `clamp(4rem, 10vw, 10rem)` | vertical section padding | **64px** (floor) | 83.4px | 144px | **160px** (cap) |
| `clamp(2.75rem, 1.5rem + 3.6vw, 4.75rem)` | hero `h1` | **44px** (floor) | 54.02px | 75.84px | **76px** (cap; reached at 1444px) |
| `clamp(1.75rem, 1.3rem + 1.6vw, 2.75rem)` | section `h2` (work, lead, stack, exp, writing) | **28px** (floor) | 34.14px | 43.84px | **44px** (cap; reached at 1450px) |
| `clamp(2rem, 1.2rem + 2vw, 3.25rem)` | contact `h2` | **32px** (floor) | 35.88px | 48px | **52px** (cap; reached at 1640px) |
| `clamp(320px, 38vw, 520px)` | contact right column | **320px** (floor) | **320px** (floor; 38vw=316.9) | 520px (cap; 38vw=547.2) | **520px** (cap) |
| `clamp(24px, 4vw, 64px)` | contact grid gap | **24px** (floor) | 33.36px | 57.6px | **64px** (cap) |

#### Container widths at the four breakpoints

| Container | max-width | @390 inner | @834 inner | @1440 inner | @2560 inner |
|---|---|---|---|---|---|
| Header / most sections | 1440px | 358px | 767.28px | 1324.8px | 1312px |
| Selected work | **1600px** | 358px | 767.28px | 1324.8px | 1472px |

("inner" = container width minus the two horizontal paddings.)

---

## 1. Skip link

### DOM

```html
<a href="#main"
   style="position:absolute; left:-9999px; top:16px; z-index:100; background:#161B22; border:1px solid #22D3EE; border-radius:6px; padding:12px 20px; color:#F0F6FC;"
   style-focus="left:24px;">Skip to content</a>
```

**Copy:** `Skip to content`

**States:** off-screen at `left:-9999px`; on `:focus` snaps to `left:24px`. Also picks up the global `:focus-visible { outline:2px solid #22D3EE; outline-offset:2px; border-radius:6px; }`.

**Responsive:** none — fixed offsets at every width.

---

## 2. Nav / header

### DOM

```html
<header style="{{ navStyle }}">
  <div style="max-width:1440px; margin:0 auto; padding:0 clamp(1rem, 4vw, 4rem); height:100%; display:flex; align-items:center; justify-content:space-between; gap:32px;">
    <a href="#main" aria-label="Wieslaw Samushonga — home" style="…">WS</a>
    <nav aria-label="Sections" style="display:flex; align-items:center; gap:4px; font-family:'JetBrains Mono', monospace; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.12em;">
      <a href="#work">Work</a>
      <a href="#lead">How I work</a>
      <a href="#craft">Craft</a>
      <a href="#stack">Stack</a>
      <a href="#experience">Experience</a>
      <a href="#writing">Writing</a>
    </nav>
    <a href="#contact" style="…">Let's talk</a>
  </div>
</header>
```

Semantics: `<header>` (no explicit role), inner `<nav aria-label="Sections">`, logo link carries `aria-label="Wieslaw Samushonga — home"`. Header is **outside** `<main>`.

### The `{{ navStyle }}` binding — the scroll-condense behaviour

Computed in `renderVals()` from `state.scrolled` (`const h = s.scrolled ? 56 : 72;`):

```js
navStyle: 'position:sticky; top:0; z-index:50; height:' + h + 'px; '
  + 'background:rgba(13,17,23,' + (s.scrolled ? '0.88' : '0.35') + '); '
  + 'backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); '
  + 'border-bottom:1px solid ' + (s.scrolled ? '#1F2937' : 'transparent') + '; '
  + 'transition:height 320ms cubic-bezier(.2,.8,.2,1), background 320ms cubic-bezier(.2,.8,.2,1), border-color 320ms cubic-bezier(.2,.8,.2,1);'
```

| Property | Top (`scrolled:false`) | Condensed (`scrolled:true`) |
|---|---|---|
| `height` | `72px` | `56px` |
| `background` | `rgba(13,17,23,0.35)` | `rgba(13,17,23,0.88)` |
| `border-bottom` | `1px solid transparent` | `1px solid #1F2937` |
| `backdrop-filter` | `blur(12px)` (both) | `blur(12px)` |
| `position` / `top` / `z-index` | `sticky` / `0` / `50` | same |

Trigger (from `componentDidMount`):

```js
this._onScroll = () => {
  const next = window.scrollY > 24;
  if (next !== this.state.scrolled) this.setState({ scrolled: next });
};
window.addEventListener('scroll', this._onScroll, { passive: true });
```

**Threshold: `window.scrollY > 24`.** Listener is passive and guarded against redundant `setState`.

### Logo mark

```html
<a href="#main" aria-label="Wieslaw Samushonga — home"
   style="display:flex; align-items:center; justify-content:center; width:44px; height:44px; border:1px solid #30363D; border-radius:12px; font-family:'Bricolage Grotesque', sans-serif; font-variation-settings:'wdth' 90; font-weight:600; font-size:0.9375rem; letter-spacing:0.02em; color:#F0F6FC; flex:none;"
   style-hover="border-color:#A78BFA;">WS</a>
```

44×44px, radius 12px, `wdth 90`, 15px, `flex:none`. Hover → `border-color:#A78BFA`.

### Nav links (×6, identical)

```html
<a href="#work"
   style="display:inline-flex; align-items:center; min-height:44px; padding:0 14px; border-radius:999px; color:#8B949E;"
   style-hover="color:#F0F6FC; background:rgba(255,255,255,0.04);">Work</a>
```

Inherited from the `<nav>`: JetBrains Mono, `0.75rem` (12px), uppercase, `letter-spacing:0.12em`. Each link: `min-height:44px` (touch target), `padding:0 14px`, pill radius, idle `#8B949E`. Hover → `color:#F0F6FC; background:rgba(255,255,255,0.04)`. Gap between links: `4px`.

**Note:** at `height:56px` (condensed) the 44px `min-height` links still fit; the header's `align-items:center` keeps them centred.

### CTA

```html
<a href="#contact"
   style="display:inline-flex; align-items:center; white-space:nowrap; height:44px; padding:0 22px; border-radius:999px; border:1px solid #30363D; color:#F0F6FC; font-size:0.9375rem; font-weight:500; flex:none;"
   style-hover="border-color:#22D3EE; box-shadow:0 0 24px rgba(34,211,238,0.20);">Let's talk</a>
```

**Copy (verbatim, in order):** `WS` · `Work` · `How I work` · `Craft` · `Stack` · `Experience` · `Writing` · `Let's talk`

### Responsive

- Inner row: `max-width:1440px`, `padding:0 clamp(1rem,4vw,4rem)`, `justify-content:space-between`, `gap:32px`.
- **@390:** logo 44 + CTA (~103px) + 6 nav pills ≈ 480px of content into 358px available. **Overflows.** No hamburger, no `flex-wrap`, no media query. A mobile nav must be designed.
- **@834:** 767.28px inner; content fits with slack.
- **@1440:** 1324.8px inner.
- **@2560:** capped at 1440px, padding 64px → 1312px inner, centred.

---

## 3. Hero

### DOM

```html
<section aria-labelledby="hero-h" style="position:relative; min-height:100dvh; display:flex; align-items:center;">
  <div aria-hidden="true" style="position:absolute; inset:0;">
    <div style="position:sticky; top:0; height:100vh; max-height:100%; width:100%; overflow:hidden;">
      <canvas data-f="monolith" style="position:absolute; inset:0; width:100%; height:100%; display:block;"></canvas>
      <div style="position:absolute; inset:0; background:radial-gradient(80% 110% at 2% 50%, rgba(13,17,23,0.96) 0%, rgba(13,17,23,0.70) 42%, rgba(13,17,23,0) 76%);"></div>
    </div>
  </div>
  <div style="position:relative; width:100%; max-width:1440px; margin:0 auto; padding:160px clamp(1rem, 4vw, 4rem) 96px;">
    <div data-reveal style="…glass panel…"> … </div>
  </div>
  <a href="#proof" aria-label="Scroll to content" style="…">…Scroll</a>
</section>
```

Note the section has **no `id`** — it is targeted only by `#main` on `<main>`. Heading id is `hero-h`.

### Backdrop pattern (repeated in 5 more sections)

```html
<div aria-hidden="true" style="position:absolute; inset:0;">
  <div style="position:sticky; top:0; height:100vh; max-height:100%; width:100%; overflow:hidden;">
    <canvas data-f="<kind>" style="position:absolute; inset:0; width:100%; height:100%; display:block;"></canvas>
    <div style="position:absolute; inset:0; background:<scrim>;"></div>
  </div>
</div>
```

The sticky inner div is what makes the generative field appear to hold still while the section scrolls past. Hero scrim: `radial-gradient(80% 110% at 2% 50%, rgba(13,17,23,0.96) 0%, rgba(13,17,23,0.70) 42%, rgba(13,17,23,0) 76%)` — darkest at the left edge, so the left-aligned panel stays readable while the `monolith` formation (painted at `cx:0.74`) shows on the right.

### Glass panel

```html
<div data-reveal style="width:min(56%, 700px); background:rgba(17,22,29,0.72); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); border:1px solid #1F2937; border-top:1px solid rgba(255,255,255,0.06); border-radius:20px; padding:48px;">
```

The `border-top:1px solid rgba(255,255,255,0.06)` overriding the 4-sided `#1F2937` border is the signature "lit top edge" treatment — it recurs on every glass card.

### Contents, in order

**Eyebrow**
```html
<p style="font-family:'JetBrains Mono', monospace; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.12em; color:#8B949E; margin:0 0 24px; line-height:1.8;">Software Engineer @ Data Age · Full Stack Engineer · Harare, Zimbabwe</p>
```

**H1**
```html
<h1 id="hero-h" style="font-family:'Bricolage Grotesque', sans-serif; font-variation-settings:'wdth' 88, 'opsz' 96; font-weight:600; font-size:clamp(2.75rem, 1.5rem + 3.6vw, 4.75rem); line-height:1.0; letter-spacing:-0.02em; color:#F0F6FC; margin:0 0 24px; text-wrap:balance;">I build production software, end to end — and I make the web move.</h1>
```
The only place `opsz 96` is used, and the narrowest `wdth` on the page (88).

**Sub**
```html
<p style="font-size:1.125rem; line-height:1.6; color:#C9D1D9; margin:0 0 32px; max-width:60ch; text-wrap:pretty;">Spring Boot microservices, ERP platforms, secure authentication, React front ends. Tested, containerised systems by day; real-time 3D on the web that holds frame rate on a mid-range phone.</p>
```

**Button row** — `display:flex; gap:12px; flex-wrap:wrap; margin-bottom:48px;`

```html
<a href="#work" style="display:inline-flex; align-items:center; white-space:nowrap; height:48px; padding:0 26px; border-radius:999px; background:#F0F6FC; color:#0D1117; font-weight:500;"
   style-hover="background:linear-gradient(90deg,#7C3AED 0%,#22D3EE 100%); color:#F0F6FC;">See the work</a>
<a href="#contact" style="display:inline-flex; align-items:center; white-space:nowrap; height:48px; padding:0 26px; border-radius:999px; border:1px solid #30363D; color:#C9D1D9; font-weight:500;"
   style-hover="border-color:#22D3EE; color:#F0F6FC;">Let's talk</a>
```

The primary hover — solid white → `linear-gradient(90deg,#7C3AED 0%,#22D3EE 100%)` with the label inverting to `#F0F6FC` — is the single most distinctive interaction on the page.

**Stats `<dl>`**

```html
<dl style="display:grid; grid-template-columns:repeat(3, 1fr); gap:24px; margin:0; padding-top:32px; border-top:1px solid #1F2937;">
  <div>
    <dt style="font-family:'JetBrains Mono', monospace; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.12em; color:#8B949E; margin-bottom:8px;">Experience</dt>
    <dd style="margin:0; font-family:'Bricolage Grotesque', sans-serif; font-variation-settings:'wdth' 92; font-weight:600; font-size:1.75rem; line-height:1.1; color:#F0F6FC;">6+ years</dd>
  </div>
  … Domains shipped / {{ domainCount }} …
  … Specialism / WebGL …
</dl>
```

`{{ domainCount }}` resolves to **`7`** (`renderVals().domainCount = 7`) — a single source of truth referenced three times on the page (hero stat, proof stat, AR placeholder copy).

### Scroll cue

```html
<a href="#proof" aria-label="Scroll to content"
   style="position:absolute; left:clamp(1rem, 4vw, 4rem); bottom:40px; display:flex; align-items:center; min-height:44px; padding:0 4px; gap:12px; font-family:'JetBrains Mono', monospace; font-size:0.6875rem; text-transform:uppercase; letter-spacing:0.12em; color:#8B949E;"
   style-hover="color:#C9D1D9;">
  <span style="display:inline-block; width:1px; height:32px; background:linear-gradient(180deg,#30363D,transparent); animation:wsScrollCue 2.4s ease-in-out infinite;"></span>Scroll
</a>
```

The 1px×32px gradient rule animates `translateY(0→6px)` and `opacity(.5→1)` on a 2.4s loop.

### Copy (verbatim)

> Software Engineer @ Data Age · Full Stack Engineer · Harare, Zimbabwe
>
> I build production software, end to end — and I make the web move.
>
> Spring Boot microservices, ERP platforms, secure authentication, React front ends. Tested, containerised systems by day; real-time 3D on the web that holds frame rate on a mid-range phone.
>
> See the work · Let's talk
>
> Experience / 6+ years — Domains shipped / 7 — Specialism / WebGL
>
> Scroll

### Responsive

| | @390 | @834 | @1440 | @2560 |
|---|---|---|---|---|
| Section min-height | `100dvh` | `100dvh` | `100dvh` | `100dvh` |
| Container inner | 358px | 767.28px | 1324.8px | 1312px (max-width 1440) |
| Panel `min(56%,700px)` | **200.5px** | 429.68px | **700px** (cap) | **700px** (cap) |
| Panel content (−96px padding) | **104.5px — broken** | 333.68px | 604px | 604px |
| `h1` size | 44px | 54.02px | 75.84px | 76px |
| Top padding | 160px (fixed) | 160px | 160px | 160px |
| Bottom padding | 96px (fixed) | 96px | 96px | 96px |
| Side padding | 16px | 33.36px | 57.6px | 64px |
| Stats grid | still `repeat(3,1fr)` — ~19px per column | 3 cols | 3 cols | 3 cols |

**@390 the panel is unusable as authored.** The rebuild needs `width:100%` (and reduced padding, likely 24–28px) below ~834px, and the stats `<dl>` needs to become 1 column or a wrapped row.

---

## 4. Proof strip

### DOM

```html
<section id="proof" aria-label="Domains and figures" style="position:relative; border-top:1px solid #1F2937; border-bottom:1px solid #1F2937;">
  <!-- backdrop: canvas data-f="stream" -->
  <div style="position:absolute; inset:0; background:linear-gradient(180deg, rgba(13,17,23,0.82) 0%, rgba(13,17,23,0.62) 50%, rgba(13,17,23,0.82) 100%);"></div>
  <div style="position:relative; max-width:1440px; margin:0 auto; padding:48px clamp(1rem, 4vw, 4rem);">
    <ul>…8 domain chips…</ul>
    <dl data-reveal>…4 stat cells…</dl>
  </div>
</section>
```

Uses `aria-label` (not `aria-labelledby`) because there is no visible heading. Fixed `48px` vertical padding — this is the only section that does not use `clamp(4rem,10vw,10rem)`.

### Domain chip row

```html
<ul style="list-style:none; margin:0 0 32px; padding:0; display:flex; flex-wrap:wrap; gap:8px;">
```

Base chip style (repeated on every `<li>`, then overridden per-domain later in the same declaration — later declarations win):

```
font-family:'JetBrains Mono', monospace; font-size:0.75rem; letter-spacing:0.06em;
color:#C9D1D9; border:1px solid #30363D; border-radius:6px; padding:7px 12px;
```

Per-chip colour overrides, in DOM order:

| # | Copy | Effective background | Effective border | Effective colour |
|---|---|---|---|---|
| 1 | `Healthcare` | `rgba(110,231,183,0.08)` | `rgba(110,231,183,0.4)` | `#6EE7B7` |
| 2 | `Education` | `rgba(252,211,77,0.08)` | `rgba(252,211,77,0.4)` | `#FCD34D` |
| 3 | `Creator economy` | `rgba(240,171,252,0.08)` | `rgba(240,171,252,0.4)` | `#F0ABFC` |
| 4 | `Procurement / ERP` | `rgba(252,211,77,0.08)` | `rgba(252,211,77,0.4)` | `#FCD34D` |
| 5 | `Social services` | `rgba(196,181,253,0.08)` | `rgba(196,181,253,0.4)` | `#C4B5FD` |
| 6 | `Developer tooling` | `rgba(34,211,238,0.08)` | `rgba(34,211,238,0.4)` | `#67E8F9` |
| 7 | `Interactive 3D` | `rgba(34,211,238,0.08)` | `rgba(34,211,238,0.35)` | `#67E8F9` |
| 8 | `AR / XR` | `rgba(240,171,252,0.08)` | `rgba(240,171,252,0.4)` | `#F0ABFC` |

Chips 1–6 are written as `base…; background:X; border-color:Y; color:Z` (duplicate `color` declarations — the last wins). Chip 7 declares its cyan values up front; chip 8 declares cyan then overrides to pink. In a clean rebuild this is one `<Chip tone="emerald|amber|fuchsia|violet|cyan">` component.

### Stat grid

```html
<dl data-reveal style="display:grid; grid-template-columns:repeat(4, 1fr); gap:1px; margin:0; background:#1F2937; border:1px solid #1F2937; border-radius:12px; overflow:hidden;">
  <div style="background:rgba(17,22,29,0.86); backdrop-filter:blur(12px); padding:24px;">
    <dt style="font-family:'JetBrains Mono', monospace; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.12em; color:#8B949E; margin-bottom:12px;">Load time cut, Ikarus 3D</dt>
    <dd style="margin:0; font-family:'Bricolage Grotesque', sans-serif; font-variation-settings:'wdth' 92; font-weight:600; font-size:2.25rem; line-height:1; color:#F0F6FC;">50%</dd>
  </div>
  …
</dl>
```

**The `gap:1px` + `background:#1F2937` + `overflow:hidden` trick** produces hairline dividers between cells without any per-cell borders. It is used three times on the page (proof stats, process rail, contact channel list) and should become one `<HairlineGrid>` primitive.

| Cell | `<dt>` | `<dd>` |
|---|---|---|
| 1 | `Load time cut, Ikarus 3D` | `50%` |
| 2 | `Domains shipped` | `{{ domainCount }}` → `7` |
| 3 | `Frame budget held` | `60 fps` |
| 4 | `Infra cost cut, Virtualize` | `30%` |

### Interactive states

None (no hover, no focus). The `<dl>` is `data-reveal` — it fades/slides in as one unit.

### Responsive

| | @390 | @834 | @1440 | @2560 |
|---|---|---|---|---|
| Padding | `48px 16px` | `48px 33.36px` | `48px 57.6px` | `48px 64px` |
| Chip row | wraps freely (`flex-wrap:wrap`, gap 8px) | wraps | likely 1–2 rows | 1 row |
| Stat grid | `repeat(4,1fr)` → **~86px per cell, 24px padding leaves 38px** — the `2.25rem`/36px numbers overflow | ~189px per cell | ~330px | ~327px |

**@390 the 4-up stat grid must become 2×2 or 1-up.**

---

## 5. Selected work — THE BENTO

### DOM

```html
<section id="work" aria-labelledby="work-h" style="position:relative;">
  <!-- backdrop: canvas data-f="lattice" -->
  <div style="position:absolute; inset:0; background:linear-gradient(180deg, rgba(13,17,23,0.90) 0%, rgba(13,17,23,0.80) 30%, rgba(13,17,23,0.92) 100%);"></div>
  <div style="position:relative; max-width:1600px; margin:0 auto; padding:clamp(4rem, 10vw, 10rem) clamp(1rem, 4vw, 4rem);">
    <div>…header row…</div>
    <div style="display:grid; grid-template-columns:repeat(6, 1fr); gap:24px;">…7 cards…</div>
  </div>
</section>
```

**`max-width:1600px` — the only section wider than 1440px.** Deliberate: the bento needs the extra room.

### Header row

```html
<div style="display:flex; align-items:flex-end; justify-content:space-between; gap:48px; margin-bottom:48px; flex-wrap:wrap;">
  <div style="max-width:60ch;">
    <p style="font-family:'JetBrains Mono', monospace; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.12em; color:#A78BFA; margin:0 0 16px;">01 — Selected work</p>
    <h2 id="work-h" style="font-family:'Bricolage Grotesque', sans-serif; font-variation-settings:'wdth' 95; font-weight:600; font-size:clamp(1.75rem, 1.3rem + 1.6vw, 2.75rem); line-height:1.15; letter-spacing:-0.015em; color:#F0F6FC; margin:0 0 16px;">Selected work</h2>
    <p style="color:#8B949E; margin:0; text-wrap:pretty;">Eight domains, one habit: decide the architecture early, make every migration reversible, and leave the next engineer a system they can read.</p>
  </div>
  <a href="/work" style="display:inline-flex; align-items:center; gap:8px; white-space:nowrap; height:44px; padding:0 20px; border-radius:999px; border:1px solid #30363D; color:#C9D1D9; font-size:0.9375rem;" style-hover="border-color:#A78BFA; color:#F0F6FC;">All work <span aria-hidden="true">→</span></a>
</div>
```

This is the reusable **section header** pattern: mono eyebrow `NN — Title` in `#A78BFA`, Bricolage `h2` at `wdth 95`, muted lede, optional pill link on the right (`align-items:flex-end` so the pill sits on the h2/lede baseline; `flex-wrap:wrap` so the pill drops below when cramped).

### THE GRID DEFINITION

```css
display:grid;
grid-template-columns:repeat(6, 1fr);
gap:24px;
```

Seven children, in DOM order:

| # | href / element | `grid-column` | Size class | `min-height` | `padding` | `h3` size | `h3` `wdth` | Accent |
|---|---|---|---|---|---|---|---|---|
| 1 | `/work/gabar` (`<a>`) | `span 3` | **LARGE** | `340px` | `32px` | `2.25rem` | `92` | Cyan `#22D3EE` |
| 2 | `/work/vantage-health-system` (`<a>`) | `span 3` | **LARGE** | `340px` | `32px` | `2.25rem` | `92` | Violet `#A78BFA` |
| 3 | `/work/we-assist-you` (`<a>`) | `span 4` | **WIDE-STANDARD** | — | `28px` | `1.5rem` | `96` | Violet `#A78BFA` |
| 4 | `/work/heycreator` (`<a>`) | `span 2` | **STANDARD** | — | `28px` | `1.5rem` | `96` | Violet `#A78BFA` |
| 5 | `/work/learnx` (`<a>`) | `span 2` | **STANDARD** | — | `28px` | `1.5rem` | `96` | Violet `#A78BFA` |
| 6 | `/work/pr-pulse` (`<a>`) | `span 3` | **STANDARD** | — | `28px` | `1.5rem` | `96` | Cyan `#22D3EE` |
| 7 | AR placeholder (`<div>`) | `span 3` | **PLACEHOLDER** | — | `28px` | `1.5rem` | `96` | none (dashed) |

**Resulting visual rows on a 6-column grid:**

```
Row 1:  [ gabar ........ 3 ][ Vantage Health .. 3 ]      ← two LARGE, min-height 340px
Row 2:  [ we-assist-you .... 4 ][ heycreator . 2 ]
Row 3:  [ learnx . 2 ][ PR-Pulse ..... 3 ]  ← 5 of 6 used; learnx starts col 1
Row 4:  [ AR placeholder .. 3 ]              ← auto-placement: span-3 cannot fit
                                                the 1 remaining col of row 3
```

Auto-placement detail worth encoding explicitly in the rebuild: after `learnx` (span 2) and `PR-Pulse` (span 3) fill columns 1–5 of row 3, the span-3 AR placeholder cannot fit the single remaining column, so it wraps to row 4 leaving **a 1-column gap at the end of row 3 and a 3-column gap at the end of row 4**. That asymmetry is the bento's character — do not "fix" it by rebalancing spans.

### Card anatomy — LARGE (gabar, verbatim)

```html
<a data-reveal href="/work/gabar" style="grid-column:span 3; display:flex; flex-direction:column; min-height:340px; background:rgba(22,27,34,0.78); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); border:1px solid #1F2937; border-top:1px solid rgba(255,255,255,0.06); border-radius:20px; padding:32px; transition:border-color 200ms cubic-bezier(.2,.8,.2,1), box-shadow 200ms cubic-bezier(.2,.8,.2,1);" style-hover="border-color:#22D3EE; box-shadow:0 0 24px rgba(34,211,238,0.20);">
  <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:32px;">
    <span style="font-family:'JetBrains Mono', monospace; font-size:0.6875rem; text-transform:uppercase; letter-spacing:0.12em; color:#67E8F9; border:1px solid rgba(34,211,238,0.35); background:rgba(34,211,238,0.08); border-radius:6px; padding:5px 10px;">Interactive 3D</span>
    <span style="font-family:'JetBrains Mono', monospace; font-size:0.6875rem; text-transform:uppercase; letter-spacing:0.12em; color:#8B949E; border:1px solid #30363D; border-radius:6px; padding:5px 10px;">Public</span>
  </div>
  <h3 style="font-family:'Bricolage Grotesque', sans-serif; font-variation-settings:'wdth' 92; font-weight:600; font-size:2.25rem; line-height:1.05; letter-spacing:-0.015em; color:#F0F6FC; margin:0 0 12px;">gabar</h3>
  <p style="font-size:1.125rem; line-height:1.6; color:#C9D1D9; margin:0 0 24px; max-width:44ch; text-wrap:pretty;">Real-time 3D web experience: rigid-body physics, spatial audio, mobile joystick controls — tuned to hold frame rate on mid-range devices.</p>
  <ul style="list-style:none; margin:auto 0 24px; padding:0; display:flex; flex-wrap:wrap; gap:6px;">
    <li style="font-family:'JetBrains Mono', monospace; font-size:0.6875rem; color:#8B949E; border:1px solid #1F2937; border-radius:6px; padding:4px 9px;">Three.js</li>
    … React Three Fiber / drei / Rapier / Howler …
  </ul>
  <span style="font-family:'JetBrains Mono', monospace; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.12em; color:#67E8F9; display:flex; align-items:center; gap:10px;">Read the case study <span aria-hidden="true">→</span></span>
</a>
```

Structural notes that must survive the rebuild:
- The card is a **link element wrapping everything** (`<a>` with `display:flex; flex-direction:column`) — one hit target, no nested interactives.
- `margin:auto 0 24px` on the tech `<ul>` is the flex spacer that pins the tag row + CTA to the bottom, giving all cards a common baseline.
- The header row is `justify-content:space-between` → domain badge left, status badge right.
- Only the *large* cards use `min-height:340px`, `padding:32px`, `h3` at `2.25rem`/`wdth 92`/`letter-spacing:-0.015em` and `<p>` at `1.125rem`. Standard cards use `padding:28px`, `h3` at `1.5rem`/`wdth 96` with no letter-spacing, and inherit 16px body text.

### Per-card data

| Card | Domain badge (colour) | Status badge | `h3` | Paragraph `max-width` | Tech tags | CTA text | CTA colour | Hover border / glow |
|---|---|---|---|---|---|---|---|---|
| **gabar** | `Interactive 3D` — `#67E8F9` on `rgba(34,211,238,0.08)`, border `rgba(34,211,238,0.35)` | `Public` | `gabar` | `44ch` | Three.js, React Three Fiber, drei, Rapier, Howler | `Read the case study →` | `#67E8F9` | `#22D3EE` / `rgba(34,211,238,0.20)` |
| **Vantage Health System** | `Healthcare` — `#6EE7B7` on `rgba(110,231,183,0.08)`, border `rgba(110,231,183,0.4)` | `Client codebase` | `Vantage Health System` | `44ch` | Node, Express, Docker, Winston, PptxGenJS | `Read the case study →` | `#C4B5FD` | `#A78BFA` / `rgba(124,58,237,0.20)` |
| **we-assist-you** | `Social services` — `#C4B5FD` on `rgba(124,58,237,0.10)`, border `rgba(167,139,250,0.35)` | `Client codebase` | `we-assist-you` | `56ch` | TypeScript, Firestore, TanStack Query, Zod, Sentry | `Read the case study →` | `#8B949E` | `#A78BFA` / `rgba(124,58,237,0.20)` |
| **heycreator** | `Creator economy` — `#F0ABFC` on `rgba(240,171,252,0.08)`, border `rgba(240,171,252,0.4)` | `Client` | `heycreator` | none | Next.js, Firebase, Apify, Playwright | `Read →` | `#8B949E` | `#A78BFA` / `rgba(124,58,237,0.20)` |
| **learnx** | `Education` — `#FCD34D` on `rgba(252,211,77,0.08)`, border `rgba(252,211,77,0.4)` | `Client` | `learnx` | none | React, TipTap, dnd-kit, Zustand | `Read →` | `#8B949E` | `#A78BFA` / `rgba(124,58,237,0.20)` |
| **PR-Pulse** | `Developer tooling` — `#67E8F9` on `rgba(34,211,238,0.08)`, border `rgba(34,211,238,0.35)` | `Public` | `PR-Pulse` | `48ch` | TypeScript, Next.js, Vercel Blob, Motion | `Read →` | `#8B949E` | `#22D3EE` / `rgba(34,211,238,0.20)` |
| **AR placeholder** | `AR / XR` — `#8B949E`, **`border:1px dashed #30363D`** | `In preparation` — `#D29922`, border `rgba(210,153,34,0.35)`, bg `rgba(210,153,34,0.08)` | `[AR project name]` (`color:#8B949E`, `border-bottom:1px dotted #30363D`, `align-self:flex-start`) | `48ch` | 3 empty skeleton spans | none | — | none (not a link) |

Badge sizing is uniform: `font-size:0.6875rem` (11px), uppercase, `letter-spacing:0.12em`, `border-radius:6px`, `padding:5px 10px`. Header-row `gap` is `16px` on large / span-4 cards and `12px` on span-2 / span-3 standard cards. Header `margin-bottom` is `32px` on large cards, `24px` on standard.

### AR placeholder card (verbatim)

```html
<div data-reveal aria-label="AR case study, in preparation" style="grid-column:span 3; display:flex; flex-direction:column; background:rgba(17,22,29,0.62); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); border:1px dashed #30363D; border-radius:20px; padding:28px;">
  …badges…
  <h3 style="… color:#8B949E; margin:0 0 10px; border-bottom:1px dotted #30363D; align-self:flex-start;">[AR project name]</h3>
  <p style="color:#8B949E; margin:0 0 20px; max-width:48ch; text-wrap:pretty;">The eighth domain. Card renders live the moment the case study is supplied — the domain count above reads {{ domainCount }} until then.</p>
  <div style="display:flex; flex-wrap:wrap; gap:6px; margin:auto 0 0;">
    <span style="width:72px; height:26px; border:1px dashed #1F2937; border-radius:6px;"></span>
    <span style="width:88px; height:26px; border:1px dashed #1F2937; border-radius:6px;"></span>
    <span style="width:64px; height:26px; border:1px dashed #1F2937; border-radius:6px;"></span>
  </div>
</div>
```

Not a link. `aria-label="AR case study, in preparation"` on a plain `<div>`. Placeholder convention throughout the page: **`1px dashed #30363D` container + `1px dotted #30363D` underline on unresolved text + `#8B949E` colour**.

### Interactive states

- **Card hover:** `border-color` + `box-shadow` only (no transform, no scale), `200ms cubic-bezier(.2,.8,.2,1)`. Cyan-family cards glow cyan; violet-family cards glow violet.
- **Focus:** global `:focus-visible { outline:2px solid #22D3EE; outline-offset:2px; border-radius:6px; }` — note the global radius is `6px` while cards are `20px`, so the focus ring is squarer than the card. Worth correcting in the rebuild.
- **Reveal:** every card carries `data-reveal`; because they are siblings, the stagger index gives them `0 / 70 / 140 / 210 / 280 / 350 / 420ms` delays.

### Responsive

| | @390 | @834 | @1440 | @2560 |
|---|---|---|---|---|
| Container inner | 358px | 767.28px | 1324.8px | 1472px (max-width 1600) |
| 6-col track width | **39.67px** | 107.88px | 200.8px | 225.33px |
| `span 2` card | **103.3px** | 239.76px | 425.6px | 474.67px |
| `span 3` card | **167px** | 347.64px | 626.4px | 699px |
| `span 4` card | **230.7px** | 455.5px | 827.2px | 923.3px |
| Vertical padding | 64px | 83.4px | 144px | 160px |
| `h2` | 28px | 34.14px | 43.84px | 44px |

**@390 and @834 the bento is unusable as authored** (a `span 2` card at 103px with 28px padding leaves 47px of content). The rebuild must define:
- ≤~640px: `grid-template-columns:1fr`, every card full width, drop `min-height:340px`, reduce padding to ~20–24px, large `h3` down from `2.25rem`.
- ~640–1024px: `repeat(2,1fr)` with spans remapped (large → `span 2`, standard → `span 1`).
- ≥1024px: the authored `repeat(6,1fr)`.

---

## 6. How I work (`#lead`)

### DOM

```html
<section id="lead" aria-labelledby="lead-h" style="position:relative; border-top:1px solid #1F2937;">
  <!-- backdrop: canvas data-f="orbit" -->
  <div style="position:absolute; inset:0; background:linear-gradient(180deg, rgba(13,17,23,0.92) 0%, rgba(13,17,23,0.72) 40%, rgba(13,17,23,0.94) 100%);"></div>
  <div style="position:relative; max-width:1440px; margin:0 auto; padding:clamp(4rem, 10vw, 10rem) clamp(1rem, 4vw, 4rem);">
    <p>02 — How I work</p>
    <h2 id="lead-h">Tested, typed, and shipped with a rollback plan.</h2>
    <p>Three habits that follow me into every codebase.</p>
    <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:24px; margin-bottom:64px;">…3 <article>…</div>
    <h3>How I run a project</h3>
    <ol data-reveal style="…5-step rail…">…</ol>
    <figure data-reveal>…testimonial slot…</figure>
  </div>
</section>
```

### Header

```html
<p style="font-family:'JetBrains Mono', monospace; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.12em; color:#A78BFA; margin:0 0 16px;">02 — How I work</p>
<h2 id="lead-h" style="font-family:'Bricolage Grotesque', sans-serif; font-variation-settings:'wdth' 95; font-weight:600; font-size:clamp(1.75rem, 1.3rem + 1.6vw, 2.75rem); line-height:1.15; letter-spacing:-0.015em; color:#F0F6FC; margin:0 0 16px; max-width:22ch;">Tested, typed, and shipped with a rollback plan.</h2>
<p style="color:#8B949E; margin:0 0 48px; max-width:68ch; text-wrap:pretty;">Three habits that follow me into every codebase.</p>
```

`max-width:22ch` on the h2 forces the two-line break; `max-width:68ch` on the lede.

### Habit cards ×3

```html
<article data-reveal style="background:rgba(22,27,34,0.80); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); border:1px solid #1F2937; border-top:1px solid rgba(167,139,250,0.30); border-radius:20px; padding:32px;">
  <span style="font-family:'JetBrains Mono', monospace; font-size:0.6875rem; text-transform:uppercase; letter-spacing:0.12em; color:#A78BFA;">Habit 01</span>
  <h3 style="font-family:'Bricolage Grotesque', sans-serif; font-variation-settings:'wdth' 100; font-weight:600; font-size:1.375rem; line-height:1.25; color:#F0F6FC; margin:16px 0 20px;">Tested by default</h3>
  <ul style="list-style:none; margin:0; padding:0; display:grid; gap:12px;">
    <li style="display:grid; grid-template-columns:14px 1fr; gap:12px; color:#C9D1D9; font-size:0.9375rem; line-height:1.6;"><span aria-hidden="true" style="color:#7C3AED; line-height:1.6;">▸</span>TDD with JUnit and Mockito — the test written with the feature, not after it.</li>
    …
  </ul>
</article>
```

`wdth 100` (the widest on the page) on card `h3`s — a deliberate contrast against the narrower display headings.

The bullet list is `display:grid; grid-template-columns:14px 1fr; gap:12px` per `<li>` — a **hanging-indent list without `list-style`**, with a `▸` glyph in the accent colour. This pattern recurs in the timeline (with `—` in `#30363D`).

| Card | `border-top` | Eyebrow / colour | `h3` | Bullet glyph colour |
|---|---|---|---|---|
| 1 | `rgba(167,139,250,0.30)` | `Habit 01` / `#A78BFA` | `Tested by default` | `#7C3AED` |
| 2 | `rgba(240,171,252,0.30)` | `Habit 02` / `#F0ABFC` | `Architecture that stays legible` | `#E879F9` |
| 3 | `rgba(34,211,238,0.30)` | `Habit 03` / `#67E8F9` | `Owned to production` | `#22D3EE` |

**Copy — bullets, verbatim:**

*Habit 01 — Tested by default*
1. TDD with JUnit and Mockito — the test written with the feature, not after it.
2. Shift-left: integration tests run on every push, against the contract rather than the implementation.
3. Honest error handling: failures surface with context instead of being swallowed.

*Habit 02 — Architecture that stays legible*
1. Typed backends — the contract lives in the code, not in a document nobody opens.
2. SOLID and the boring patterns — Factory, Strategy, Repository — over cleverness.
3. Migrations reversible by design — dry-run, apply, rollback — so no release is a one-way door.

*Habit 03 — Owned to production*
1. Docker, CI/CD and cloud deployments — Azure, AWS — treated as part of the feature, not a hand-off.
2. Monitoring, alerting and disaster recovery rehearsed before launch, not after an incident.
3. Handover documentation written while the context is still fresh.

### Process rail

```html
<h3 style="font-family:'JetBrains Mono', monospace; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.12em; color:#8B949E; margin:0 0 24px; font-weight:400;">How I run a project</h3>
<ol data-reveal style="list-style:none; margin:0 0 64px; padding:0; display:grid; grid-template-columns:repeat(5, 1fr); gap:1px; background:#1F2937; border:1px solid #1F2937; border-radius:12px; overflow:hidden;">
  <li style="background:rgba(17,22,29,0.88); backdrop-filter:blur(12px); padding:24px;">
    <div style="font-family:'JetBrains Mono', monospace; font-size:0.6875rem; color:#A78BFA; margin-bottom:12px;">01</div>
    <div style="font-family:'Bricolage Grotesque', sans-serif; font-variation-settings:'wdth' 100; font-weight:600; font-size:1.0625rem; color:#F0F6FC; margin-bottom:8px;">Discovery</div>
    <p style="margin:0; font-size:0.875rem; line-height:1.55; color:#8B949E;">Constraints, users, and the one thing that must not break.</p>
  </li>
  …
</ol>
```

Same hairline-grid trick as the proof strip, but `repeat(5,1fr)`.

| Step | Number colour | Title | Body |
|---|---|---|---|
| 01 | `#A78BFA` | `Discovery` | `Constraints, users, and the one thing that must not break.` |
| 02 | `#C4B5FD` | `Architecture` | `Data model, boundaries, migration strategy. Written before code.` |
| 03 | `#A78BFA` | `Delivery cadence` | `Staged builds, weekly demo, review as the default unit of work.` |
| 04 | `#67E8F9` | `Launch` | `Rollback rehearsed, logging in place, on-call agreed.` |
| 05 | `#22D3EE` | `Operate` | `Monitored, measured, and handed over so it outlives me.` |

The number colours walk violet → cyan across the five steps, mirroring the canvas gradient.

### Testimonial slot

```html
<figure data-reveal style="margin:0; background:rgba(17,22,29,0.62); backdrop-filter:blur(12px); border:1px dashed #30363D; border-radius:20px; padding:48px; display:grid; grid-template-columns:1fr auto; gap:48px; align-items:center;">
  <div>
    <span style="font-family:'JetBrains Mono', monospace; font-size:0.6875rem; text-transform:uppercase; letter-spacing:0.12em; color:#8B949E;">Testimonial slot — renders only when a real quote exists</span>
    <blockquote style="margin:16px 0 0; font-family:'Bricolage Grotesque', sans-serif; font-variation-settings:'wdth' 95; font-weight:500; font-size:1.5rem; line-height:1.35; color:#8B949E; max-width:44ch; border-bottom:1px dotted #30363D; padding-bottom:16px;">[Quote from an engineering manager or client — owner to supply]</blockquote>
    <figcaption style="margin-top:16px; font-family:'JetBrains Mono', monospace; font-size:0.75rem; color:#8B949E;">[Name] · [Role, Company]</figcaption>
  </div>
  <div aria-hidden="true" style="width:88px; height:88px; border-radius:999px; border:1px dashed #30363D; display:flex; align-items:center; justify-content:center; font-family:'Bricolage Grotesque', sans-serif; font-weight:600; color:#30363D; flex:none;">—</div>
</figure>
```

The eyebrow text is an **instruction to the implementer** and must not ship: the whole `<figure>` is conditional on real content existing. `font-weight:500` on the blockquote is the only Bricolage medium weight on the page.

### Responsive

| | @390 | @834 | @1440 | @2560 |
|---|---|---|---|---|
| Habit cards `repeat(3,1fr)` | **~103px each** | 239.76px | 425.6px | 421.3px |
| Process `repeat(5,1fr)` | **~71px each** | 152.6px | 264.2px | 261.4px |
| Testimonial `1fr auto` | 358 − 96 padding = 262px content; 88px avatar + 48px gap = 136px → **126px for the quote** | ~535px for the quote | ~1093px | ~1080px |

**All three sub-layouts need breakpoints.** Habit cards → 1 col ≤~700px. Process rail → likely a vertical stack or 2-up ≤~900px. Testimonial → single column with the avatar above ≤~640px.

---

## 7. Craft (`#craft`)

### DOM

```html
<section id="craft" aria-labelledby="craft-h" style="position:relative; border-top:1px solid #1F2937; min-height:88vh; display:flex; align-items:center;">
  <!-- backdrop: canvas data-f="scatter" -->
  <div style="position:absolute; inset:0; background:radial-gradient(70% 100% at 100% 50%, rgba(13,17,23,0.94) 0%, rgba(13,17,23,0.55) 45%, rgba(13,17,23,0) 80%);"></div>
  <div style="position:relative; width:100%; max-width:1440px; margin:0 auto; padding:clamp(4rem, 10vw, 10rem) clamp(1rem, 4vw, 4rem); display:flex; justify-content:flex-end;">
    <div data-reveal style="width:min(38%, 460px); min-width:320px; background:rgba(17,22,29,0.76); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); border:1px solid #1F2937; border-top:1px solid rgba(34,211,238,0.30); border-radius:20px; padding:32px;">
```

**The mirror of the hero.** Hero: panel left, scrim darkest at `2%` (left), formation at `cx:0.74` (right). Craft: `justify-content:flex-end` puts the panel right, scrim darkest at `100%` (right), `scatter` formation painted at `cx:0.34` (left). `min-height:88vh` + `align-items:center`.

### Contents

```html
<p style="font-family:'JetBrains Mono', monospace; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.12em; color:#22D3EE; margin:0 0 16px;">03 — Craft: 3D &amp; AR</p>
<h2 id="craft-h" style="font-family:'Bricolage Grotesque', sans-serif; font-variation-settings:'wdth' 92; font-weight:600; font-size:2rem; line-height:1.1; letter-spacing:-0.015em; color:#F0F6FC; margin:0 0 16px;">The thing that surprises people: WebGL that runs at 60 fps on a mid-range phone.</h2>
<p style="color:#C9D1D9; margin:0 0 32px; text-wrap:pretty;">Rigid-body physics, spatial audio, mobile joystick controls — and the performance budgets that make it viable. One instanced mesh, one draw call, geometry that never reallocates mid-frame.</p>
```

The only section eyebrow in `#22D3EE` rather than `#A78BFA`, and the only `h2` with a **fixed** `font-size:2rem` (not clamped) — because the panel width is already capped at 460px.

### Control row

```html
<div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px;">
  <button type="button" onClick="{{ togglePhysics }}" aria-pressed="{{ physicsOn }}" style="{{ physicsBtnStyle }}">{{ physicsLabel }}</button>
  <button type="button" onClick="{{ resetScene }}" style="display:inline-flex; align-items:center; height:44px; padding:0 18px; border-radius:999px; border:1px solid #30363D; background:transparent; color:#C9D1D9; font-size:0.875rem; cursor:pointer;" style-hover="border-color:#22D3EE; color:#F0F6FC;">Reset</button>
  <button type="button" disabled="{{ true }}" title="WebXR is not available in this browser" style="display:inline-flex; align-items:center; gap:8px; height:44px; padding:0 18px; border-radius:999px; border:1px dashed #30363D; background:transparent; color:#8B949E; font-size:0.875rem; cursor:not-allowed;">View in AR <span style="font-family:'JetBrains Mono', monospace; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.12em; color:#8B949E; border:1px solid #30363D; border-radius:6px; padding:2px 7px;">Unsupported</span></button>
</div>
```

**Physics toggle — the `{{ physicsBtnStyle }}` binding (verbatim from `renderVals`):**

```js
physicsOn: s.physics,
physicsLabel: s.physics ? 'Physics on' : 'Enable physics',
physicsBtnStyle: 'display:inline-flex; align-items:center; gap:8px; height:44px; padding:0 18px; border-radius:999px; font-size:0.875rem; cursor:pointer; transition:all 200ms cubic-bezier(.2,.8,.2,1); ' + (s.physics
  ? 'border:1px solid rgba(34,211,238,0.5); background:rgba(34,211,238,0.12); color:#F0F6FC; box-shadow:0 0 24px rgba(34,211,238,0.20);'
  : 'border:1px solid #30363D; background:transparent; color:#C9D1D9;'),
togglePhysics: () => this.setState((p) => ({ physics: !p.physics })),
resetScene: () => this.setState({ physics: false }),
```

| State | Label | Border | Background | Colour | Shadow |
|---|---|---|---|---|---|
| off (`physics:false`) | `Enable physics` | `1px solid #30363D` | `transparent` | `#C9D1D9` | none |
| on (`physics:true`) | `Physics on` | `1px solid rgba(34,211,238,0.5)` | `rgba(34,211,238,0.12)` | `#F0F6FC` | `0 0 24px rgba(34,211,238,0.20)` |

`aria-pressed` is bound to the same boolean — a proper toggle button. `Reset` sets `physics:false` unconditionally.

**The AR button is the designed *unsupported* state:** permanently `disabled`, `border:1px dashed`, `cursor:not-allowed`, `title="WebXR is not available in this browser"`, with an inline `Unsupported` mono badge. This is a graceful-degradation spec, not a bug — the rebuild should feature-detect WebXR and render an enabled variant when it exists.

### HUD row + panel

```html
<div style="display:flex; align-items:center; justify-content:space-between; gap:16px; padding-top:20px; border-top:1px solid #1F2937;">
  <button type="button" onClick="{{ toggleHud }}" aria-pressed="{{ hudOn }}" style="font-family:'JetBrains Mono', monospace; font-size:0.6875rem; text-transform:uppercase; letter-spacing:0.12em; color:#8B949E; background:none; border:none; display:inline-flex; align-items:center; min-height:44px; padding:0; cursor:pointer;" style-hover="color:#67E8F9;">Perf HUD · {{ hudLabel }}</button>
  <a href="/lab" style="font-family:'JetBrains Mono', monospace; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.12em; color:#67E8F9; display:inline-flex; align-items:center; min-height:44px; gap:8px;">Open the lab <span aria-hidden="true">→</span></a>
</div>

<sc-if value="{{ hudOn }}" hint-placeholder-val="{{ true }}">
  <div style="margin-top:20px; border:1px solid #1F2937; border-radius:12px; background:rgba(13,17,23,0.86); padding:16px; font-family:'JetBrains Mono', monospace; font-size:0.75rem; line-height:1.9; color:#C9D1D9;">
    <div style="display:flex; justify-content:space-between;"><span style="color:#8B949E;">fps</span><span style="color:#3FB950;">60.0</span></div>
    <div style="display:flex; justify-content:space-between;"><span style="color:#8B949E;">frame</span><span>14.2 ms</span></div>
    <div style="display:flex; justify-content:space-between;"><span style="color:#8B949E;">draw calls</span><span>1</span></div>
    <div style="display:flex; justify-content:space-between;"><span style="color:#8B949E;">instances</span><span>12 000</span></div>
    <div style="display:flex; justify-content:space-between;"><span style="color:#8B949E;">gpu tier</span><span style="color:#67E8F9;">2</span></div>
  </div>
</sc-if>
```

`hudLabel` is `'on'` / `'off'`, so the button reads `Perf HUD · off` initially. `hint-placeholder-val="{{ true }}"` means the design canvas previews the HUD **open** while the runtime default (`state.hud = false`) is **closed**. Values shown (`60.0`, `14.2 ms`, `1`, `12 000`, `2`) are design placeholders — the real HUD reads live figures. Note `12 000` uses a non-breaking-style space in the thousands separator position.

### Responsive

| | @390 | @834 | @1440 | @2560 |
|---|---|---|---|---|
| Panel width `min(38%,460px)` w/ `min-width:320px` | **320px** (min-width wins over 38%=136px) | **320px** (38%=291.6 → min-width) | **460px** (cap) | **460px** (cap) |
| Panel content (−64px padding) | 256px | 256px | 396px | 396px |
| Section min-height | `88vh` | `88vh` | `88vh` | `88vh` |
| Vertical padding | 64px | 83.4px | 144px | 160px |

Craft is the **only section that survives 390px structurally** — `min-width:320px` fits inside 358px of available width. But the three control buttons (44px tall, `flex-wrap:wrap`, gap 8px) will wrap to 2–3 rows.

---

## 8. Stack (`#stack`)

### DOM

```html
<section id="stack" aria-labelledby="stack-h" style="position:relative; border-top:1px solid #1F2937;">
  <!-- backdrop: canvas data-f="grid" -->
  <div style="position:absolute; inset:0; background:linear-gradient(180deg, rgba(13,17,23,0.94) 0%, rgba(13,17,23,0.86) 50%, rgba(13,17,23,0.94) 100%);"></div>
  <div style="position:relative; max-width:1440px; margin:0 auto; padding:clamp(4rem, 10vw, 10rem) clamp(1rem, 4vw, 4rem);">
    <p>04 — Stack</p>
    <div style="display:grid; grid-template-columns:1fr 380px; gap:64px; align-items:start;">
      <div>
        <h2 id="stack-h">What I reach for</h2>
        <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:40px 48px;">…6 groups…</div>
        <div>…legend…</div>
      </div>
      <aside data-reveal style="… position:sticky; top:120px;">…How I choose…</aside>
    </div>
  </div>
</section>
```

Note the eyebrow (`04 — Stack`) sits **outside** the two-column grid; the `h2` sits inside the left column.

### Layout

- Outer: `grid-template-columns:1fr 380px; gap:64px; align-items:start`
- Inner group grid: `grid-template-columns:repeat(2, 1fr); gap:40px 48px` (40px row gap, 48px column gap)
- `h2` `margin:0 0 48px`
- `<aside>` is `position:sticky; top:120px` — it tracks the scroll through the six groups. `120px` clears the 72px header with 48px of breathing room.

### Group heading + chips

```html
<h3 style="font-family:'JetBrains Mono', monospace; font-size:0.6875rem; text-transform:uppercase; letter-spacing:0.12em; color:#C4B5FD; margin:0 0 16px; font-weight:400;">Languages</h3>
<ul style="list-style:none; margin:0; padding:0; display:flex; flex-wrap:wrap; gap:6px;">…</ul>
```

Three chip tiers, encoded by style and explained by the legend:

```
CORE:     font-family:'JetBrains Mono', monospace; font-size:0.75rem; color:#F0F6FC;
          background:rgba(255,255,255,0.06); border:1px solid #30363D; border-radius:6px; padding:6px 11px;
WORKING:  font-family:'JetBrains Mono', monospace; font-size:0.75rem; color:#C9D1D9;
          border:1px solid #30363D; border-radius:6px; padding:6px 11px;
FAMILIAR: font-family:'JetBrains Mono', monospace; font-size:0.75rem; color:#8B949E;
          border:1px solid #1F2937; border-radius:6px; padding:6px 11px;
```

Plus a **cyan-highlight** variant used only in "3D & creative":

```
3D CORE:  color:#F0F6FC; background:rgba(34,211,238,0.10); border:1px solid rgba(34,211,238,0.35);
          border-radius:6px; padding:6px 11px;
```

### Full stack inventory

| Group | Heading colour | Core (white/filled) | Working (outline) | Familiar (dim) |
|---|---|---|---|---|
| **Languages** | `#C4B5FD` | Java, TypeScript, JavaScript | — | Kotlin, GLSL |
| **Frontend** | `#F0ABFC` | React, Next.js | TailwindCSS, GSAP | Vite |
| **Backend & data** | `#67E8F9` | Spring Boot, PostgreSQL, Hibernate / JPA | GraphQL, Node, MongoDB | — |
| **Cloud & DevOps** | `#6EE7B7` | Docker, AWS | Azure, Google Cloud | Nginx |
| **3D & creative** | `#22D3EE` | Three.js, React Three Fiber, Rapier *(cyan variant)* | drei, WebXR | Blender |
| **Tooling & practice** | `#FCD34D` | JUnit, Mockito, TDD | Git, Jira · Agile | — |

Groups appear in the 2-column grid in that DOM order → left column: Languages, Backend & data, 3D & creative; right column: Frontend, Cloud & DevOps, Tooling & practice.

### Legend

```html
<div style="display:flex; gap:20px; margin-top:40px; padding-top:24px; border-top:1px solid #1F2937; font-family:'JetBrains Mono', monospace; font-size:0.6875rem; text-transform:uppercase; letter-spacing:0.12em; color:#8B949E;">
  <span style="display:flex; align-items:center; gap:8px;"><span aria-hidden="true" style="width:12px; height:12px; border-radius:3px; background:rgba(255,255,255,0.10); border:1px solid #30363D;"></span>Core</span>
  <span style="display:flex; align-items:center; gap:8px;"><span aria-hidden="true" style="width:12px; height:12px; border-radius:3px; border:1px solid #30363D;"></span>Working</span>
  <span style="display:flex; align-items:center; gap:8px;"><span aria-hidden="true" style="width:12px; height:12px; border-radius:3px; border:1px solid #1F2937;"></span>Familiar</span>
</div>
```

### "How I choose" aside

```html
<aside data-reveal style="background:rgba(22,27,34,0.80); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); border:1px solid #1F2937; border-radius:20px; padding:32px; position:sticky; top:120px;">
  <h3 style="font-family:'Bricolage Grotesque', sans-serif; font-variation-settings:'wdth' 100; font-weight:600; font-size:1.375rem; line-height:1.25; color:#F0F6FC; margin:0 0 16px;">How I choose</h3>
  <p style="color:#C9D1D9; font-size:0.9375rem; line-height:1.6; margin:0 0 16px; text-wrap:pretty;">Default stack: Spring Boot on the JVM, PostgreSQL behind it, and a typed React or Next.js front end.</p>
  <p style="color:#8B949E; font-size:0.9375rem; line-height:1.6; margin:0; text-wrap:pretty;">I deviate when the problem asks for it — Node when the team lives in TypeScript end to end, MongoDB when the data is document-shaped, GraphQL when clients over-fetch, Three.js and React Three Fiber when the interface should move. Not because something is new.</p>
</aside>
```

Note: this is the **only glass card without the lit `border-top`** — a flat `1px solid #1F2937` on all four sides.

### Interactive states

None on the chips (no hover, no links). Only the sticky-scroll behaviour of the aside.

### Responsive

| | @390 | @834 | @1440 | @2560 |
|---|---|---|---|---|
| Outer `1fr 380px` gap 64 | left = 358 − 380 − 64 = **−86px, broken** | left = 767.28 − 444 = 323.28px | left = 1324.8 − 444 = 880.8px | left = 1312 − 444 = 868px |
| Group grid `repeat(2,1fr)` gap 48 | n/a | 137.64px per column | 416.4px | 410px |
| `h2` | 28px | 34.14px | 43.84px | 44px |

**@390 the section overflows badly.** The `380px` track is fixed, not a fraction. Below ~1000px the outer grid must become a single column with the aside stacked (and losing `position:sticky`). Below ~640px the inner `repeat(2,1fr)` must become 1 column.

---

## 9. Experience / timeline (`#experience`)

### DOM

```html
<section id="experience" aria-labelledby="exp-h" style="position:relative; border-top:1px solid #1F2937; background:#0D1117;">
  <div style="max-width:1440px; margin:0 auto; padding:clamp(4rem, 10vw, 10rem) clamp(1rem, 4vw, 4rem);">
    <p>05 — Experience</p>
    <h2 id="exp-h">Where I've done it</h2>
    <ol style="list-style:none; margin:0; padding:0 0 0 32px; border-left:1px solid #1F2937; display:grid; gap:48px;">
      <li data-reveal style="position:relative;">…×5…</li>
    </ol>
  </div>
</section>
```

**No canvas backdrop.** Solid `#0D1117`. Together with `#writing` (`#11161D`) these two form the "quiet zone" between the atmospheric sections and the contact section.

### Timeline mechanics

- `<ol>` is the rail: `border-left:1px solid #1F2937`, `padding-left:32px`, `display:grid; gap:48px`.
- Each `<li>` is `position:relative`.
- The node marker is absolutely positioned **outside** the padding box: `left:-38px` (32px padding + 1px border + 5px to centre the 12px dot on the rail), `top:8px`.

```html
<span aria-hidden="true" style="position:absolute; left:-38px; top:8px; width:12px; height:12px; border-radius:999px; background:#0D1117; border:2px solid #A78BFA; box-shadow:0 0 24px rgba(124,58,237,0.40);"></span>
```

- Each entry body is `display:grid; grid-template-columns:1fr 200px; gap:32px; align-items:baseline` — content left, date right-aligned.

```html
<div style="display:grid; grid-template-columns:1fr 200px; gap:32px; align-items:baseline;">
  <div>
    <h3 style="font-family:'Bricolage Grotesque', sans-serif; font-variation-settings:'wdth' 96; font-weight:600; font-size:1.5rem; line-height:1.2; color:#F0F6FC; margin:0 0 4px;">Data Age</h3>
    <p style="color:#A78BFA; font-size:0.9375rem; margin:0 0 16px;">Software Engineer · Harare, Zimbabwe</p>
    <ul style="list-style:none; margin:0; padding:0; display:grid; gap:8px; max-width:70ch;">
      <li style="display:grid; grid-template-columns:14px 1fr; gap:12px; color:#C9D1D9; font-size:0.9375rem; line-height:1.6;"><span aria-hidden="true" style="color:#30363D;">—</span>…</li>
    </ul>
  </div>
  <span style="font-family:'JetBrains Mono', monospace; font-size:0.75rem; letter-spacing:0.08em; color:#8B949E; text-align:right;">2024 — present</span>
</div>
```

Bullet glyph here is `—` in `#30363D` (vs `▸` in an accent colour in the habit cards). `letter-spacing:0.08em` on the date (not `0.12em`).

### The five entries

| # | Dot border | Dot glow | Company (`h3`) | Role line (colour) | Date | Bullets |
|---|---|---|---|---|---|---|
| 1 | `#A78BFA` | `0 0 24px rgba(124,58,237,0.40)` | `Data Age` | `Software Engineer · Harare, Zimbabwe` (`#A78BFA`) | `2024 — present` | 3 |
| 2 | `#F0ABFC` | `0 0 24px rgba(240,171,252,0.30)` | `Ikarus 3D` | `Software Engineer — Backend & DevOps · Punjab, India` (`#F0ABFC`) | `2024` | 2 |
| 3 | `#67E8F9` | `0 0 24px rgba(34,211,238,0.30)` | `Virtualize Technologies` | `Full Stack Software Developer · Mohali, India` (`#67E8F9`) | `2022 — 2024` | 3 |
| 4 | `#6EE7B7` | `0 0 24px rgba(110,231,183,0.30)` | `Baeldung.com` | `Backend Java Developer · Remote` (`#6EE7B7`) | `2021` | 2 |
| 5 | `#30363D` | **none** | `Earlier roles` | `Allsoft Solutions · Freelance React · APG Shimla · India` (`#30363D`) | `2019 — 2021` | 2 |

The dot colour walks violet → fuchsia → cyan → emerald → grey; the final entry deliberately loses its glow to read as "fading into the past".

### Copy — bullets, verbatim

**Data Age**
- Full product lifecycle: requirements and system design through implementation, testing and deployment.
- Spring Boot microservices — REST and GraphQL — behind core ERP modules: authentication, payments, scheduling, analytics.
- Azure deployments with CI/CD; TDD and shift-left testing as the default feature cycle.

**Ikarus 3D**
- Cut application load times by 50% through performance and architecture work.
- CI/CD pipelines, Docker deployments, monitoring and disaster recovery for a 3D asset platform.

**Virtualize Technologies**
- Spring Boot and React across 10+ client projects; microservices on PostgreSQL and Docker.
- Cut infrastructure costs by 30% with containerised deployment pipelines.
- Managed client engagements end to end — repeat business through delivery, not sales.

**Baeldung.com**
- Secure enterprise microservices: Spring Security, JWT, OAuth2, role-based access control.
- RESTful APIs with comprehensive JUnit and Mockito coverage, written test-first.

**Earlier roles**
- Auth and security modules in Spring Boot; a React analytics dashboard MVP on a two-month deadline.
- Administered 50+ Linux servers — where the uptime, backup and patching discipline came from.

### Interactive states

None. Reveal only (each `<li>` is `data-reveal`, giving a 0/70/140/210/280ms cascade down the timeline).

### Responsive

| | @390 | @834 | @1440 | @2560 |
|---|---|---|---|---|
| Rail offset | 32px padding + `left:-38px` dot | same | same | same |
| Entry `1fr 200px` gap 32 | left col = 358 − 32 − 200 − 32 = **94px** | 503.28px | 1060.8px | 1048px |
| Bullet `max-width:70ch` | not reached | not reached | reached (~700px) | reached |

**@390 the `200px` date column eats more than half the row.** Below ~700px the entry grid should become one column with the date moved above the company name (or inline with it).

---

## 10. Writing & elsewhere (`#writing`)

### DOM

```html
<section id="writing" aria-labelledby="writing-h" style="position:relative; border-top:1px solid #1F2937; background:#11161D;">
  <div style="max-width:1440px; margin:0 auto; padding:clamp(4rem, 10vw, 10rem) clamp(1rem, 4vw, 4rem);">
    <p>06 — Writing &amp; elsewhere</p>
    <h2 id="writing-h">Notes from the build</h2>
    <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:24px; margin-bottom:64px;">…2 cards + 1 fallback…</div>
    <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding-top:32px; border-top:1px solid #1F2937;">…social rail…</div>
  </div>
</section>
```

`background:#11161D` — a distinct lighter panel, the only use of this value.

### Article card ×2

```html
<a data-reveal href="#" style="display:flex; flex-direction:column; background:#161B22; border:1px solid #1F2937; border-radius:20px; padding:28px; transition:border-color 200ms cubic-bezier(.2,.8,.2,1);" style-hover="border-color:#A78BFA;">
  <span style="font-family:'JetBrains Mono', monospace; font-size:0.6875rem; text-transform:uppercase; letter-spacing:0.12em; color:#8B949E; margin-bottom:20px;">Medium · <span style="border-bottom:1px dotted #30363D;">Mar 2026</span></span>
  <h3 style="font-family:'Bricolage Grotesque', sans-serif; font-variation-settings:'wdth' 98; font-weight:600; font-size:1.25rem; line-height:1.25; color:#F0F6FC; margin:0 0 12px; border-bottom:1px dotted #30363D; align-self:flex-start;">[Article title — from RSS]</h3>
  <p style="color:#8B949E; font-size:0.9375rem; line-height:1.6; margin:0 0 24px;">Shift-left in practice: what a Spring Boot service looks like when the tests are written before the endpoint.</p>
  <span style="margin-top:auto; font-family:'JetBrains Mono', monospace; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.12em; color:#8B949E;">Read →</span>
</a>
```

These cards are **opaque `#161B22`, not glass** — no `backdrop-filter`, no lit border-top — because there is no canvas behind this section. Hover transitions `border-color` only (no shadow). `wdth 98` is unique to these `h3`s.

Both the date and the title carry `border-bottom:1px dotted #30363D` — the "unresolved / pulled from RSS at runtime" convention.

| Card | Date | Excerpt |
|---|---|---|
| 1 | `Mar 2026` | `Shift-left in practice: what a Spring Boot service looks like when the tests are written before the endpoint.` |
| 2 | `Jan 2026` | `One draw call: budgeting an instanced mesh so a mid-range Android holds 60 fps with physics on.` |

### RSS-failure card (third grid cell)

```html
<div data-reveal style="display:flex; flex-direction:column; justify-content:center; background:rgba(22,27,34,0.5); border:1px dashed #30363D; border-radius:20px; padding:28px;">
  <span style="font-family:'JetBrains Mono', monospace; font-size:0.6875rem; text-transform:uppercase; letter-spacing:0.12em; color:#8B949E; margin-bottom:16px;">RSS unavailable</span>
  <p style="color:#8B949E; font-size:0.9375rem; line-height:1.6; margin:0 0 20px;">The Medium feed didn't respond. Nothing else on the page depends on it.</p>
  <a href="#" style="font-family:'JetBrains Mono', monospace; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.12em; color:#67E8F9; display:inline-flex; align-items:center; min-height:44px;">Read on Medium →</a>
</div>
```

This is an **explicitly designed error state occupying a grid slot** — when the feed works it is replaced by a third article card. `justify-content:center` (the article cards use default `flex-start`).

### Social rail

```html
<div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding-top:32px; border-top:1px solid #1F2937;">
```

Two tiers separated by a vertical hairline:

**Primary pills** — `display:inline-flex; align-items:center; height:44px; padding:0 20px; border-radius:999px; border:1px solid #30363D; color:#C9D1D9; font-size:0.9375rem;` hover `border-color:#A78BFA; color:#F0F6FC;`

| Label | href |
|---|---|
| `LinkedIn` | `https://linkedin.com/in/wieslaw-samushonga-3b3913154` (`target="_blank" rel="noopener"`) |
| `GitHub` | `https://github.com/JxstWieslaw` (`target="_blank" rel="noopener"`) |
| `X` | `#` |
| `Medium` | `#` |

**Divider** — `<span aria-hidden="true" style="width:1px; height:24px; background:#1F2937; margin:0 8px;"></span>`

**Secondary text links** — `display:inline-flex; align-items:center; height:44px; padding:0 14px; font-family:'JetBrains Mono', monospace; font-size:0.6875rem; text-transform:uppercase; letter-spacing:0.12em; color:#8B949E;` hover `color:#C9D1D9;`

`Instagram` · `Discord` · `Reddit` · `Pinterest` — all `href="#"`.

### Responsive

| | @390 | @834 | @1440 | @2560 |
|---|---|---|---|---|
| `repeat(3,1fr)` gap 24 | **~103px per card** | 239.76px | 425.6px | 421.3px |
| Social rail | wraps (`flex-wrap:wrap`) | wraps | 1–2 rows | 1 row |

Cards → 1 column ≤~640px, 2 columns ≤~1024px.

---

## 11. Contact (`#contact`)

### DOM

```html
<section id="contact" aria-labelledby="contact-h" style="position:relative; border-top:1px solid #1F2937;">
  <!-- backdrop: canvas data-f="ring" -->
  <div style="position:absolute; inset:0; background:linear-gradient(180deg, rgba(13,17,23,0.90) 0%, rgba(13,17,23,0.70) 45%, rgba(13,17,23,0.92) 100%);"></div>
  <div style="position:relative; max-width:1440px; margin:0 auto; padding:clamp(4rem, 10vw, 10rem) clamp(1rem, 4vw, 4rem); display:grid; grid-template-columns:1fr clamp(320px, 38vw, 520px); gap:clamp(24px, 4vw, 64px); align-items:start;">
    <div>…pitch + channel list…</div>
    <form data-reveal>…</form>
  </div>
</section>
```

**The only section whose grid uses `clamp()` on a track** — `grid-template-columns:1fr clamp(320px, 38vw, 520px)` with `gap:clamp(24px, 4vw, 64px)`. This is the design's one gesture toward genuine fluidity.

### Left column

```html
<p style="font-family:'JetBrains Mono', monospace; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.12em; color:#22D3EE; margin:0 0 16px;">07 — Contact</p>
<h2 id="contact-h" style="font-family:'Bricolage Grotesque', sans-serif; font-variation-settings:'wdth' 92; font-weight:600; font-size:clamp(2rem, 1.2rem + 2vw, 3.25rem); line-height:1.05; letter-spacing:-0.015em; color:#F0F6FC; margin:0 0 24px; max-width:16ch;">Open to consulting &amp; collaboration.</h2>
<p style="font-size:1.125rem; line-height:1.6; color:#C9D1D9; margin:0 0 40px; max-width:52ch; text-wrap:pretty;">Leading a build, untangling an architecture, or making something run at 60 fps — if it's an interesting problem, I'd like to hear about it.</p>
```

Second cyan eyebrow (with craft). `max-width:16ch` forces the two-line break. `wdth 92` and its own clamp scale — the largest heading after the hero.

### Channel list

```html
<div style="display:grid; gap:1px; background:#1F2937; border:1px solid #1F2937; border-radius:12px; overflow:hidden; max-width:440px;">
```

Third use of the hairline-grid trick. Three rows, all `background:rgba(17,22,29,0.88); padding:20px 24px; display:flex; align-items:center; justify-content:space-between; gap:16px;` with hover `background:rgba(22,27,34,0.95);`.

**Row 1 — email copy button**

```html
<button type="button" onClick="{{ copyEmail }}" style="… border:none; text-align:left; cursor:pointer; color:#C9D1D9;" style-hover="background:rgba(22,27,34,0.95);">
  <span><span style="display:block; font-family:'JetBrains Mono', monospace; font-size:0.6875rem; text-transform:uppercase; letter-spacing:0.12em; color:#8B949E; margin-bottom:6px;">Email</span><span style="font-family:'JetBrains Mono', monospace; font-size:0.875rem; color:#F0F6FC;">wieslawsamushonga01@gmail.com</span></span>
  <span style="font-family:'JetBrains Mono', monospace; font-size:0.6875rem; text-transform:uppercase; letter-spacing:0.12em; color:#67E8F9; white-space:nowrap;">{{ copyLabel }}</span>
</button>
```

`{{ copyLabel }}` = `'Copied'` when `state.copied`, else `'Copy'`.

```js
copyLabel: s.copied ? 'Copied' : 'Copy',
copyEmail: () => {
  const v = 'wieslawsamushonga01@gmail.com';
  if (navigator.clipboard) navigator.clipboard.writeText(v).catch(() => {});
  this.setState({ copied: true });
  clearTimeout(this._c);
  this._c = setTimeout(() => this.setState({ copied: false }), 2000);
},
```

**2000ms auto-revert**, `clearTimeout` guard against rapid re-clicks, silent `.catch()` if the Clipboard API rejects, and a `navigator.clipboard` feature check.

**Rows 2 & 3 — external links**

| Label | Value | href |
|---|---|---|
| `LinkedIn` | `Wieslaw Samushonga` | `https://linkedin.com/in/wieslaw-samushonga-3b3913154` |
| `GitHub` | `github.com/JxstWieslaw` | `https://github.com/JxstWieslaw` |

Both `target="_blank" rel="noopener"`, both with a trailing `<span aria-hidden="true" style="color:#8B949E;">↗</span>`. Row label uses the mono micro-label; row value uses Geist `0.9375rem` in `#F0F6FC` (unlike the email row, which uses mono `0.875rem`).

### Contact form

```html
<form data-reveal onSubmit="{{ submitForm }}" noValidate="{{ true }}" style="background:rgba(17,22,29,0.78); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); border:1px solid #1F2937; border-top:1px solid rgba(255,255,255,0.06); border-radius:20px; padding:32px; display:grid; gap:20px;">
```

`noValidate` — validation is entirely in JS, so the error state is fully designed rather than browser-default.

**Label style (all three)**
```
display:block; font-family:'JetBrains Mono', monospace; font-size:0.6875rem;
text-transform:uppercase; letter-spacing:0.12em; color:#8B949E; margin-bottom:8px;
```

**Name field**
```html
<label for="c-name">Name</label>
<input id="c-name" type="text" name="name" autocomplete="name"
  style="width:100%; height:48px; background:#0D1117; border:1px solid #30363D; border-radius:12px; padding:0 16px; color:#F0F6FC;"
  style-focus="border-color:#22D3EE;">
```

**Email field** — style is a binding:
```html
<input id="c-email" type="email" name="email" autocomplete="email" aria-describedby="c-email-err" style="{{ emailInputStyle }}">
<sc-if value="{{ emailError }}" hint-placeholder-val="{{ false }}">
  <p id="c-email-err" role="alert" style="margin:8px 0 0; font-size:0.8125rem; color:#F85149;">Enter an email address I can reply to.</p>
</sc-if>
```
```js
emailInputStyle: 'width:100%; height:48px; background:#0D1117; border:1px solid '
  + (s.emailError ? '#F85149' : '#30363D')
  + '; border-radius:12px; padding:0 16px; color:#F0F6FC;',
```
`aria-describedby="c-email-err"` is set unconditionally (points at an element that may not exist — acceptable, but the rebuild should make it conditional). The error `<p>` carries `role="alert"`.

**Message field**
```html
<textarea id="c-msg" name="message" rows="5" placeholder="What are you building?"
  style="width:100%; background:#0D1117; border:1px solid #30363D; border-radius:12px; padding:14px 16px; color:#F0F6FC; resize:vertical; line-height:1.6;"
  style-focus="border-color:#22D3EE;"></textarea>
```

**Submit + status**
```html
<button type="submit" disabled="{{ sending }}" style="{{ submitStyle }}">{{ submitLabel }}</button>
<sc-if value="{{ statusMessage }}" hint-placeholder-val="{{ false }}">
  <div role="status" style="{{ statusStyle }}">{{ statusMessage }}</div>
</sc-if>
<p style="margin:0; font-size:0.8125rem; line-height:1.5; color:#8B949E;">No newsletter, no tracking pixel. Replies usually within a working day, CAT.</p>
```

### The full form state machine (verbatim from `renderVals`)

`state.form` ∈ `'idle' | 'sending' | 'success' | 'error' | 'limited' | 'offline'`; `state.emailError` is an independent boolean.

```js
sending: s.form === 'sending',
submitLabel: { idle: 'Send message', sending: 'Sending…', success: 'Sent', error: 'Try again', limited: 'Send message', offline: 'Send message' }[s.form] || 'Send message',
submitStyle: 'height:48px; border-radius:999px; border:none; font-weight:500; font-size:0.9375rem; transition:all 200ms cubic-bezier(.2,.8,.2,1); ' + (s.form === 'sending'
  ? 'background:#30363D; color:#8B949E; cursor:wait;'
  : 'background:#F0F6FC; color:#0D1117; cursor:pointer;'),

statusMessage: {
  success: 'Thanks — that reached me. I usually reply within a working day.',
  error: 'That didn’t send. Try again, or email wieslawsamushonga01@gmail.com directly.',
  limited: 'A few messages have come from here already. Try again in a few minutes.',
  offline: 'You appear to be offline — this will open your mail app instead.'
}[s.form] || '',
statusStyle: 'border-radius:12px; padding:14px 16px; font-size:0.875rem; line-height:1.5; ' + ({
  success: 'border:1px solid rgba(63,185,80,0.35); background:rgba(63,185,80,0.10); color:#3FB950;',
  error:   'border:1px solid rgba(248,81,73,0.35); background:rgba(248,81,73,0.10); color:#F85149;',
  limited: 'border:1px solid rgba(210,153,34,0.35); background:rgba(210,153,34,0.10); color:#D29922;',
  offline: 'border:1px solid #30363D; background:rgba(22,27,34,0.8); color:#C9D1D9;'
}[s.form] || 'border:1px solid #1F2937;'),

submitForm: (e) => {
  e.preventDefault();
  const email = (e.target.querySelector('#c-email') || {}).value || '';
  const ok = /.+@.+\..+/.test(email);
  if (!ok) { this.setState({ emailError: true, form: 'idle' }); return; }
  if (!navigator.onLine) { this.setState({ emailError: false, form: 'offline' }); return; }
  this.setState({ emailError: false, form: 'sending' });
  clearTimeout(this._f);
  this._f = setTimeout(() => this.setState({ form: 'success' }), 1200);
}
```

| `form` | Button label | Button bg / colour / cursor | Status message | Status chrome |
|---|---|---|---|---|
| `idle` | `Send message` | `#F0F6FC` / `#0D1117` / `pointer` | (none) | — |
| `sending` | `Sending…` | `#30363D` / `#8B949E` / `wait`, `disabled` | (none) | — |
| `success` | `Sent` | `#F0F6FC` / `#0D1117` / `pointer` | `Thanks — that reached me. I usually reply within a working day.` | border `rgba(63,185,80,0.35)`, bg `rgba(63,185,80,0.10)`, text `#3FB950` |
| `error` | `Try again` | `#F0F6FC` / `#0D1117` / `pointer` | `That didn’t send. Try again, or email wieslawsamushonga01@gmail.com directly.` | border `rgba(248,81,73,0.35)`, bg `rgba(248,81,73,0.10)`, text `#F85149` |
| `limited` | `Send message` | `#F0F6FC` / `#0D1117` / `pointer` | `A few messages have come from here already. Try again in a few minutes.` | border `rgba(210,153,34,0.35)`, bg `rgba(210,153,34,0.08→0.10)`, text `#D29922` |
| `offline` | `Send message` | `#F0F6FC` / `#0D1117` / `pointer` | `You appear to be offline — this will open your mail app instead.` | border `#30363D`, bg `rgba(22,27,34,0.8)`, text `#C9D1D9` |

Plus `emailError: true` → email input border `#F85149` + `<p role="alert">Enter an email address I can reply to.</p>`.

Validation regex is deliberately permissive: `/.+@.+\..+/`. The success path is a **1200ms simulated latency** — a design mock; the real implementation wires a POST. `limited` (rate-limit) and `error` are designed states with no code path that reaches them yet.

### Responsive

| | @390 | @834 | @1440 | @2560 |
|---|---|---|---|---|
| Right track | 320px | 320px | 520px | 520px |
| Gap | 24px | 33.36px | 57.6px | 64px |
| Left track (`1fr`) | 358 − 320 − 24 = **14px, broken** | 413.92px | 747.2px | 728px |
| `h2` | 32px | 35.88px | 48px | 52px |
| Channel list | `max-width:440px` → 358px actual | 413.92px | 440px | 440px |

Below ~900px this must become a single column (pitch above, form below).

---

## 12. Footer

### DOM

```html
<footer style="border-top:1px solid #1F2937; background:#0D1117;">
  <div style="max-width:1440px; margin:0 auto; padding:64px clamp(1rem, 4vw, 4rem) 48px; display:grid; grid-template-columns:1fr auto; gap:48px; align-items:start;">
    <div>
      <div style="display:flex; align-items:center; gap:16px; margin-bottom:24px;">
        <span aria-hidden="true" style="display:flex; align-items:center; justify-content:center; width:40px; height:40px; border:1px solid #30363D; border-radius:12px; font-family:'Bricolage Grotesque', sans-serif; font-variation-settings:'wdth' 90; font-weight:600; font-size:0.9375rem; color:#F0F6FC;">WS</span>
        <span style="color:#8B949E; font-size:0.9375rem;">Wieslaw Samushonga · Harare, Zimbabwe</span>
      </div>
      <p style="margin:0 0 12px; font-size:0.875rem; line-height:1.6; color:#8B949E; max-width:60ch;">Built with Next.js, React Three Fiber and Rapier. One draw call. Holds 60 fps on a mid-range phone.</p>
      <a href="#" style="font-family:'JetBrains Mono', monospace; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.12em; color:#67E8F9; display:inline-flex; align-items:center; min-height:44px;">View perf →</a>
    </div>
    <nav aria-label="Footer" style="display:grid; grid-auto-flow:column; gap:64px; align-items:start;">
      <div style="display:grid; gap:4px; font-size:0.9375rem;">…col 1…</div>
      <div style="display:grid; gap:4px; font-size:0.9375rem;">…col 2…</div>
    </nav>
  </div>
  <div style="max-width:1440px; margin:0 auto; padding:0 clamp(1rem, 4vw, 4rem) 48px;">
    <p style="margin:0; padding-top:24px; border-top:1px solid #1F2937; font-family:'JetBrains Mono', monospace; font-size:0.6875rem; text-transform:uppercase; letter-spacing:0.12em; color:#8B949E;">© 2026 Wieslaw Samushonga</p>
  </div>
</footer>
```

The footer mark is a **40×40px `<span aria-hidden="true">`** — visually the same badge as the header logo but one size down and non-interactive.

Two `<div>`s inside `<nav aria-label="Footer">` with `grid-auto-flow:column; gap:64px`. Link style: `display:inline-flex; align-items:center; min-height:44px; color:#8B949E;` hover `color:#F0F6FC;`, `font-size:0.9375rem` inherited from the column, `gap:4px` between rows.

| Column 1 | href | Column 2 | href |
|---|---|---|---|
| `Work` | `#work` | `About` | `/about` |
| `How I work` | `#lead` | `Resume` | `/resume` |
| `Craft` | `#craft` | `Writing` | `#writing` |
| `Lab` | `/lab` | `Contact` | `#contact` |

**Copy:** `WS` · `Wieslaw Samushonga · Harare, Zimbabwe` · `Built with Next.js, React Three Fiber and Rapier. One draw call. Holds 60 fps on a mid-range phone.` · `View perf →` · `© 2026 Wieslaw Samushonga`

Note the footer blurb claims a Next.js + R3F + Rapier build — a target the rebuild is expected to satisfy.

### Responsive

`grid-template-columns:1fr auto` with the nav's two 64px-gapped columns ≈ 220px + 64 gap → at 390px the `1fr` gets ~74px. Needs a stack ≤~700px. The copyright bar is a separate container so the hairline rule spans the full content width.

---

## 13. The generative canvas system

### Mapping

| Section | `data-f` | Scrim |
|---|---|---|
| Hero | `monolith` | `radial-gradient(80% 110% at 2% 50%, rgba(13,17,23,0.96) 0%, rgba(13,17,23,0.70) 42%, rgba(13,17,23,0) 76%)` |
| Proof | `stream` | `linear-gradient(180deg, rgba(13,17,23,0.82) 0%, rgba(13,17,23,0.62) 50%, rgba(13,17,23,0.82) 100%)` |
| Selected work | `lattice` | `linear-gradient(180deg, rgba(13,17,23,0.90) 0%, rgba(13,17,23,0.80) 30%, rgba(13,17,23,0.92) 100%)` |
| How I work | `orbit` | `linear-gradient(180deg, rgba(13,17,23,0.92) 0%, rgba(13,17,23,0.72) 40%, rgba(13,17,23,0.94) 100%)` |
| Craft | `scatter` | `radial-gradient(70% 100% at 100% 50%, rgba(13,17,23,0.94) 0%, rgba(13,17,23,0.55) 45%, rgba(13,17,23,0) 80%)` |
| Stack | `grid` | `linear-gradient(180deg, rgba(13,17,23,0.94) 0%, rgba(13,17,23,0.86) 50%, rgba(13,17,23,0.94) 100%)` |
| Experience | — | none (solid `#0D1117`) |
| Writing | — | none (solid `#11161D`) |
| Contact | `ring` | `linear-gradient(180deg, rgba(13,17,23,0.90) 0%, rgba(13,17,23,0.70) 45%, rgba(13,17,23,0.92) 100%)` |

### Formation config (verbatim)

```js
const cfg = {
  monolith: { n: 2600, fit: 'h', anchor: 'viewport', rot: 0.55, tilt: 0.10, scale: 0.30, cx: 0.74, cy: 0.55, bloom: 1.25, wash: '#7C3AED', washA: 0.14, size: 3.4, vig: 0.30 },
  stream:   { n: 1600, rot: 0.35, tilt: 0.06, scale: 0.30, cx: 0.50, cy: 0.50, bloom: 0.50, wash: '#22D3EE', washA: 0.07, size: 2.4, vig: 0.45 },
  lattice:  { n: 600,  rot: 0.42, tilt: 0.55, scale: 0.20, cx: 0.50, cy: 0.30, bloom: 0.35, wash: '#7C3AED', washA: 0.07, size: 2.6, vig: 0.55 },
  orbit:    { n: 2400, rot: 0.30, tilt: 0.30, scale: 0.22, cx: 0.50, cy: 0.50, bloom: 0.90, wash: '#7C3AED', washA: 0.12, size: 2.6, vig: 0.50 },
  scatter:  { n: 2000, rot: 0.22, tilt: 0.18, scale: 0.26, cx: 0.34, cy: 0.62, bloom: 1.20, wash: '#22D3EE', washA: 0.12, size: 3.2, vig: 0.30 },
  grid:     { n: 1,    rot: 0.62, tilt: 0.34, scale: 0.22, cx: 0.50, cy: 0.50, bloom: 0.18, wash: '#7C3AED', washA: 0.05, size: 2.4, vig: 0.55 },
  ring:     { n: 2200, rot: 0.20, tilt: 0.62, scale: 0.24, cx: 0.50, cy: 0.58, bloom: 0.60, wash: '#22D3EE', washA: 0.08, size: 2.5, vig: 0.45 }
}[kind];
```

`grid` uses `n: 1` because its point generator builds a deterministic 13³ lattice ignoring `n`.

### The colour ramp — three-stop, violet → fuchsia → cyan

```js
const shade = (q) => {
  const t = Math.max(0, Math.min(1, q.t));
  const A = [124, 58, 237], M = [232, 121, 249], C = [34, 211, 238];
  const seg = t < 0.5 ? [A, M, t * 2] : [M, C, (t - 0.5) * 2];
  const u = seg[2];
  return [Math.round(seg[0][0] + (seg[1][0] - seg[0][0]) * u), Math.round(seg[0][1] + (seg[1][1] - seg[0][1]) * u), Math.round(seg[0][2] + (seg[1][2] - seg[0][2]) * u)];
};
```

`#7C3AED` → `#E879F9` → `#22D3EE`.

### Render passes

```js
// Pass 1: additive halo only — glow accumulates, hue does not.
if (cfg.bloom > 0.2) {
  ctx.globalCompositeOperation = 'lighter';
  … ctx.fillRect(q.x - s*2.2, q.y - s*2.2, s*4.4, s*4.4) at alpha 0.030 * cfg.bloom * depth
}
// Pass 2: cube bodies painted normally, so violet stays violet at any density.
ctx.globalCompositeOperation = 'source-over';
… body rect at alpha 0.88 * depth, then a top highlight rect
  fillStyle 'rgba(240,246,252,' + (0.20 * depth) + ')' of height Math.max(0.6, s * 0.3)
```

Depth: `Math.max(0.18, Math.min(1, 0.55 + q.d * 0.55))` where `d = 1 / (1 + z2 * 0.16)`. Final pass is a vignette: `createRadialGradient(W*.5, H*.5, min(W,H)*0.3, W*.5, H*.5, max(W,H)*0.75)` from `rgba(13,17,23,0)` to `rgba(13,17,23,<cfg.vig>)`.

DPR capped at 2: `const dpr = Math.min(window.devicePixelRatio || 1, 2);`

### Hero animation loop

Only the hero canvas animates, and only while visible:

```js
const c = this.root.querySelector('canvas[data-f="monolith"]');
if (c) {
  this._vio = new IntersectionObserver((e) => { this._heroVis = e[0].isIntersecting; });
  this._vio.observe(c);
  let last = 0;
  const loop = (ts) => {
    this._raf = requestAnimationFrame(loop);
    if (ts - last < 50 || this._heroVis === false) return;
    last = ts;
    this.paint(c, 'monolith', ts / 1000);
  };
  this._raf = requestAnimationFrame(loop);
}
```

**Throttled to ~20 fps (`ts - last < 50`)** and gated on visibility. The time term produces a slow rotational wobble plus a breathing scale:

```js
const wob = tSec ? Math.sin(tSec * 0.35) * 0.05 : 0;
const S = (cfg.fit === 'h' ? H : Math.min(W, H)) * cfg.scale * (tSec ? 1 + 0.012 * Math.sin(tSec * 0.8) : 1);
const cr = Math.cos(cfg.rot + wob), sr = Math.sin(cfg.rot + wob);
```

Static canvases repaint only when their box or the viewport height changes:

```js
drawAll() {
  if (!this.root) return;
  this.root.querySelectorAll('canvas[data-f]').forEach((c) => {
    const box = c.getBoundingClientRect();
    if (c._w === Math.round(box.width) && c._h === Math.round(box.height) && c._vh === window.innerHeight) return;
    this.paint(c, c.dataset.f);
  });
}
```

Resize is debounced 150ms; `document.fonts.ready` triggers a repaint.

---

## 14. The reveal system (`data-reveal`)

```js
setupMotion() {
  const rm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (rm || !this.root) return;
  if (this._rvTimer) return;
  this._rvStart = Date.now();
  const reveal = (el) => {
    if (el._rv) return;
    el._rv = true;
    const sibs = Array.prototype.filter.call(el.parentElement.children, (s) => s.hasAttribute && s.hasAttribute('data-reveal'));
    const i = Math.max(0, sibs.indexOf(el));
    el.style.transition = 'opacity 560ms cubic-bezier(.2,.8,.2,1) ' + i * 70 + 'ms, transform 560ms cubic-bezier(.2,.8,.2,1) ' + i * 70 + 'ms';
    el.style.opacity = '1'; el.style.transform = 'none';
    if (this._io) this._io.unobserve(el);
  };
  // Hide only below-fold elements: above-fold content is never gated on observer support.
  this.root.querySelectorAll('[data-reveal]').forEach((el) => {
    if (el._rv || el.style.opacity === '0') return;
    if (el.getBoundingClientRect().top > window.innerHeight * 0.92) {
      el.style.opacity = '0'; el.style.transform = 'translateY(24px)';
    } else { el._rv = true; }
  });
  if ('IntersectionObserver' in window && !this._io) {
    this._io = new IntersectionObserver((ents) => {
      ents.forEach((en) => { if (en.isIntersecting) reveal(en.target); });
    }, { threshold: 0.12, rootMargin: '0px 0px -4% 0px' });
  }
  if (this._io) this.root.querySelectorAll('[data-reveal]').forEach((el) => { if (!el._rv) this._io.observe(el); });
  // Geometry fallback, idempotent and closure-free: re-queries the DOM every tick,
  // survives remounts, and after 4s reveals anything still hidden regardless of geometry.
  this._rvTimer = setInterval(() => {
    if (!this.root) return;
    const late = Date.now() - this._rvStart > 4000;
    const rest = Array.prototype.filter.call(this.root.querySelectorAll('[data-reveal]'), (el) => !el._rv && el.style.opacity === '0');
    if (!rest.length && late) { clearInterval(this._rvTimer); this._rvTimer = null; return; }
    rest.forEach((el) => {
      if (late || el.getBoundingClientRect().top < window.innerHeight * 0.96) reveal(el);
    });
  }, 450);
  …hero raf loop…
}
```

Contract to preserve in React:

| Aspect | Value |
|---|---|
| Hidden state | `opacity:0; transform:translateY(24px)` |
| Revealed state | `opacity:1; transform:none` |
| Transition | `opacity 560ms cubic-bezier(.2,.8,.2,1) <delay>` + same for `transform` |
| Stagger delay | `siblingIndexAmongDataReveal * 70ms` |
| Observer | `threshold: 0.12`, `rootMargin: '0px 0px -4% 0px'` |
| Above-fold guard | anything with `top <= innerHeight * 0.92` is **never hidden** (no FOUC on first paint) |
| Fallback poll | every `450ms`; reveals anything with `top < innerHeight * 0.96` |
| Hard deadline | **4000ms** — after which every remaining element is revealed regardless of geometry |
| Reduced motion | `setupMotion()` returns immediately; nothing is ever hidden |

### The 25 `data-reveal` elements

hero panel · proof `<dl>` · 7 work cards · 3 habit `<article>`s · process `<ol>` · testimonial `<figure>` · craft panel · stack `<aside>` · 5 timeline `<li>`s · 2 writing cards + RSS fallback · contact `<form>`.

### Lifecycle

```js
componentDidMount() {
  … scroll listener, resize listener (150ms debounce), document.fonts.ready …
  setTimeout(() => { try { this.setupMotion(); window.__motionReady = true; } catch (e) { console.error('setupMotion failed', e); } }, 0);
}
componentDidUpdate() { this.drawAll(); if (!this._rvTimer) setTimeout(() => { try { this.setupMotion(); } catch (e) {} }, 0); }
componentWillUnmount() {
  window.removeEventListener('scroll', this._onScroll);
  window.removeEventListener('resize', this._onResize);
  clearTimeout(this._t); clearTimeout(this._c); clearTimeout(this._f);
  cancelAnimationFrame(this._raf);
  clearInterval(this._rvTimer); this._rvTimer = null;
  if (this._io) this._io.disconnect();
  if (this._vio) this._vio.disconnect();
}
```

Initial state: `state = { scrolled: false, physics: false, hud: false, copied: false, form: 'idle', emailError: false };`

---

## 15. Component inventory

| # | Component | Variants | States |
|---|---|---|---|
| 1 | **SkipLink** | — | idle (`left:-9999px`), focus (`left:24px`) + global focus ring |
| 2 | **StickyHeader** | — | top (72px / `rgba(13,17,23,0.35)` / transparent border), condensed (56px / `0.88` / `#1F2937`); trigger `scrollY > 24`, 320ms transition |
| 3 | **LogoBadge** | header 44px interactive, footer 40px `aria-hidden` static | hover (`border-color:#A78BFA`) on the header variant only |
| 4 | **NavPill** | — | idle `#8B949E`; hover `#F0F6FC` + `rgba(255,255,255,0.04)`; focus-visible ring |
| 5 | **ButtonPrimary** | 48px hero, 48px form submit | idle (`#F0F6FC`/`#0D1117`); hover (hero only: `linear-gradient(90deg,#7C3AED,#22D3EE)` + `#F0F6FC`); disabled/sending (`#30363D`/`#8B949E`/`cursor:wait`) |
| 6 | **ButtonGhost** (outline pill) | 44px (nav CTA, All work, social, Reset), 48px (hero secondary) | idle `1px solid #30363D`; hover `border-color:#22D3EE` + cyan glow, or `border-color:#A78BFA` + `color:#F0F6FC` depending on context |
| 7 | **ToggleButton** | physics toggle, HUD toggle | off / on, `aria-pressed` bound; on = cyan border `rgba(34,211,238,0.5)`, bg `rgba(34,211,238,0.12)`, glow; HUD variant is a bare text button hovering to `#67E8F9` |
| 8 | **UnsupportedButton** | AR / WebXR | permanently disabled: `1px dashed #30363D`, `cursor:not-allowed`, `title`, inline `Unsupported` badge |
| 9 | **Eyebrow** (mono micro-label) | section (`#A78BFA` / `#22D3EE`), card (`0.6875rem`), field label, group heading | static |
| 10 | **SectionHeader** | with trailing pill link (work), without (lead / stack / exp / writing / contact) | static; `flex-wrap:wrap` at narrow widths |
| 11 | **DomainChip** | emerald / amber / fuchsia / violet / cyan tones; `0.75rem` proof-strip size and `0.6875rem` card-badge size | static |
| 12 | **StatusBadge** | `Public`, `Client`, `Client codebase` (neutral `#30363D`); `In preparation` (`#D29922` + amber tint) | static |
| 13 | **GlassCard** | work card LARGE (`min-h:340px`, pad 32, `rgba(22,27,34,0.78)`), work card STANDARD (pad 28), habit card (`rgba(22,27,34,0.80)` + tinted `border-top`), hero panel (`rgba(17,22,29,0.72)`, pad 48), craft panel (`rgba(17,22,29,0.76)`, cyan `border-top`), stack aside (`rgba(22,27,34,0.80)`, **no** lit top), contact form (`rgba(17,22,29,0.78)`) | idle; hover on work cards only — `border-color` + `box-shadow`, cyan or violet family, `200ms cubic-bezier(.2,.8,.2,1)`; focus-visible; reveal |
| 14 | **PlaceholderCard** | AR work card, testimonial figure, RSS-failure card | static; convention = `1px dashed #30363D` + `#8B949E` text + `1px dotted #30363D` underline on unresolved strings |
| 15 | **HairlineGrid** | proof stats `repeat(4,1fr)`, process rail `repeat(5,1fr)`, contact channels `1fr` | static; contact rows have hover `background:rgba(22,27,34,0.95)` |
| 16 | **StatCell** (`dt`/`dd`) | proof (36px `dd`), hero (28px `dd`) | static |
| 17 | **ProcessStep** | 5 instances, number colour walks violet→cyan | static |
| 18 | **TechTag** | work-card tag (`0.6875rem`, `#8B949E`, `1px solid #1F2937`, `4px 9px`); stack chip Core / Working / Familiar / 3D-cyan (`0.75rem`, `6px 11px`) | static |
| 19 | **BulletList** | accent variant (`▸`, coloured, `gap:12px`); timeline variant (`—`, `#30363D`, `gap:8px`) | static; both are `grid-template-columns:14px 1fr` hanging indents |
| 20 | **TimelineEntry** | 5 instances; dot colour + glow per entry, last has no glow | static; reveal cascade |
| 21 | **ArticleCard** | opaque `#161B22` (no glass) | idle; hover `border-color:#A78BFA` (border only, no shadow); reveal |
| 22 | **SocialRail** | primary pill tier, secondary mono-text tier, 1px×24px divider | hover per tier |
| 23 | **CopyButton** (email row) | — | idle `Copy`; copied `Copied` (2000ms auto-revert); hover row background |
| 24 | **ChannelRow** (external link) | LinkedIn, GitHub | hover `background:rgba(22,27,34,0.95)`; `↗` affordance |
| 25 | **TextField / TextArea** | name (`h:48px`), email (bound style), message (`rows:5`, `resize:vertical`, `padding:14px 16px`) | idle `1px solid #30363D`; focus `border-color:#22D3EE`; error `border-color:#F85149` + `role="alert"` message |
| 26 | **FormStatus** | success / error / limited / offline | 4 chrome variants (see §11), `role="status"` |
| 27 | **PerfHUD** | 5 metric rows | closed (runtime default) / open; design canvas previews open |
| 28 | **FieldCanvas** | `monolith`, `stream`, `lattice`, `orbit`, `scatter`, `grid`, `ring` | static (repaint on resize/font-load) vs animated (hero only, ~20fps, visibility-gated) |
| 29 | **SectionBackdrop** | radial scrim (hero, craft) / linear scrim (proof, work, lead, stack, contact) | static |
| 30 | **ScrollCue** | — | idle; hover `#C9D1D9`; 2.4s `wsScrollCue` loop; killed by reduced-motion |
| 31 | **Reveal** wrapper | — | hidden (`opacity:0`, `translateY(24px)`) / revealed; stagger `i*70ms`; skipped entirely under reduced motion or above the fold |
| 32 | **StackLegend** | 3 swatch keys | static |
| 33 | **FooterNav** | 2 columns | link hover `#F0F6FC` |

---

## 16. Diff — `Home v1.dc.html` → `Home.dc.html`

**Structural summary:** 60 changed hunks. `Home.dc.html` is 18 lines longer (911 vs 893). No section was added or removed; no layout system was changed except the contact grid. The change is overwhelmingly **positioning and content**, plus one substantial **motion/rendering** upgrade.

### 16.1 The positioning pivot — Tech Lead → hands-on Full Stack Engineer

This is the direction of travel. Every headline claim moves from *leading* to *building*, and every generic credential is replaced by a specific, verifiable one.

| Where | v1 | Home |
|---|---|---|
| Nav item (L36) | `How I lead` | `How I work` |
| Footer nav (L607→562) | `How I lead` | `How I work` |
| Hero eyebrow (L57) | `Tech Lead @ Data Age · Senior Software Engineer @ Rapidev Labs · Harare, Zimbabwe` | `Software Engineer @ Data Age · Full Stack Engineer · Harare, Zimbabwe` |
| Hero `h1` (L58) | `I lead teams that ship production software — and I make the web move.` | `I build production software, end to end — and I make the web move.` |
| Hero sub (L59) | `Hospital operations, learning platforms, creator-discovery tooling, procurement systems. Technical direction, code review and mentorship by day; real-time 3D on the web that holds frame rate on a mid-range phone.` | `Spring Boot microservices, ERP platforms, secure authentication, React front ends. Tested, containerised systems by day; real-time 3D on the web that holds frame rate on a mid-range phone.` |
| Hero stat (L67) | `5+ years` | `6+ years` |
| `#lead` eyebrow (L268) | `02 — How I lead` | `02 — How I work` |
| `#lead` `h2` (L269) | `Accountable for how it's built, not just that it shipped.` | `Tested, typed, and shipped with a rollback plan.` |
| `#lead` lede (L270) | `Three things I'm responsible for on every team I lead.` | `Three habits that follow me into every codebase.` |

**Why:** it matches the CV rather than an aspirational title. Every hero noun in the new version (`Spring Boot`, `ERP`, `authentication`, `React`) is corroborated by the rewritten timeline below.

### 16.2 "Pillars" → "Habits" (`#lead` cards)

| | v1 | Home |
|---|---|---|
| Card 1 eyebrow / title | `Pillar 01` / `Technical direction` | `Habit 01` / `Tested by default` |
| Card 2 eyebrow / title | `Pillar 02` / `Code review & standards` | `Habit 02` / `Architecture that stays legible` |
| Card 3 eyebrow / title | `Pillar 03` / `Mentorship & delivery` | `Habit 03` / `Owned to production` |
| Card 2 eyebrow colour | `#A78BFA` | `#F0ABFC` |
| Card 3 eyebrow colour | `#A78BFA` | `#67E8F9` |
| Card 2 `border-top` | `rgba(167,139,250,0.30)` | `rgba(240,171,252,0.30)` |
| Card 3 `border-top` | `rgba(34,211,238,0.30)`? **no** — v1 used `rgba(167,139,250,0.30)` on all three | `rgba(34,211,238,0.30)` |
| Bullet glyph colours | `#7C3AED` on all three cards | `#7C3AED` / `#E879F9` / `#22D3EE` |

Bullets rewritten wholesale — v1's leadership content ("Architecture standards agreed before the first sprint…", "Engineers grow through review…", "A cadence the team can sustain…") replaced by IC-practice content ("TDD with JUnit and Mockito…", "SOLID and the boring patterns — Factory, Strategy, Repository — over cleverness.", "Docker, CI/CD and cloud deployments — Azure, AWS…"). Two bullets survive verbatim: *"Honest error handling: failures surface with context instead of being swallowed."* and *"Handover documentation written while the context is still fresh."*

**Why:** the three cards were previously monochrome violet; giving each its own accent (violet / fuchsia / cyan) makes the trio scan as a progression and reuses the canvas gradient as a UI system.

### 16.3 Proof strip — chips gain colour, stats gain provenance

- **Chips (L94–99, L101):** v1's chips 1–6 were uniform neutral (`color:#C9D1D9; border:1px solid #30363D; background:rgba(22,27,34,0.6)`), with only `Interactive 3D` and `AR / XR` picked out in cyan. Home gives each of the eight a domain colour (emerald / amber / fuchsia / amber / violet / cyan / cyan / fuchsia). `AR / XR` moved from cyan to fuchsia so it no longer twins with `Interactive 3D`.
- **Stat 1 (L105–106):** `Platforms led / shipped` → `10` (with `border-bottom:1px dotted #30363D; display:inline-block` — i.e. flagged as unverified) becomes `Load time cut, Ikarus 3D` → `50%` with the dotted underline **removed**.
- **Stat 4 (L117–118):** `Draw calls, gabar` → `1` becomes `Infra cost cut, Virtualize` → `30%`.

**Why:** two soft/self-reported figures were swapped for two hard, attributable outcomes that appear again in the timeline (Ikarus 3D "Cut application load times by 50%", Virtualize "Cut infrastructure costs by 30%"). The dotted "unverified" treatment disappearing is the tell.

### 16.4 Selected work — badge recolouring only

Grid, spans, card copy, tech tags, hrefs and hover colours are **byte-identical**. Only the domain badges were retinted to match the new proof-strip palette:

| Card | v1 badge | Home badge |
|---|---|---|
| Vantage Health System | violet — `color:#C4B5FD; border:rgba(167,139,250,0.35); background:rgba(124,58,237,0.10)` | emerald — appends `background:rgba(110,231,183,0.08); border-color:rgba(110,231,183,0.4); color:#6EE7B7` |
| heycreator | violet (as above) | fuchsia — appends `background:rgba(240,171,252,0.08); border-color:rgba(240,171,252,0.4); color:#F0ABFC` |
| learnx | violet (as above) | amber — appends `background:rgba(252,211,77,0.08); border-color:rgba(252,211,77,0.4); color:#FCD34D` |

`we-assist-you` (violet) and `PR-Pulse` (cyan) unchanged. Note the retint is authored as an **append** to the old declaration rather than a replacement — a hand-edit artefact, and a reason to normalise these into a single token in the rebuild.

**The bento grid definition itself did not change between v1 and Home.** `repeat(6,1fr)` / `gap:24px` / spans `3,3,4,2,2,3,3` are stable — treat it as settled.

### 16.5 Stack — a completely different engineer

Every group except "3D & creative" was rewritten. The markup also shifted from multi-line `<li>`s to single-line, which is why the hunks look large.

| Group | v1 | Home |
|---|---|---|
| Languages | TypeScript, JavaScript, Python, Go, GLSL | **Java**, TypeScript, JavaScript, **Kotlin**, GLSL |
| Frontend | Next.js, React, TanStack Query, Zustand, Svelte | React, Next.js, **TailwindCSS**, **GSAP**, **Vite** |
| Backend & data | Node, Postgres, Firebase, Supabase, Express, Redis | **Spring Boot**, **PostgreSQL**, **Hibernate / JPA**, **GraphQL**, Node, **MongoDB** |
| Cloud & DevOps | Docker, Vercel, GitHub Actions, Sentry, Terraform | Docker, **AWS**, **Azure**, **Google Cloud**, **Nginx** |
| 3D & creative | *(unchanged)* | *(unchanged)* |
| Tooling & practice | Zod, Playwright, Vitest, Conventional commits, Storybook | **JUnit**, **Mockito**, **TDD**, **Git**, **Jira · Agile** |
| Group heading colours | all `#8B949E` except 3D (`#22D3EE`) | `#C4B5FD` / `#F0ABFC` / `#67E8F9` / `#6EE7B7` / `#22D3EE` / `#FCD34D` |
| "How I choose" ¶1 | `Default stack: TypeScript, Next.js, Node, and Postgres or Firebase depending on whether the data is relational or event-shaped.` | `Default stack: Spring Boot on the JVM, PostgreSQL behind it, and a typed React or Next.js front end.` |
| "How I choose" ¶2 | `…Supabase when row-level security is the whole security model, Docker and Express when a client needs to host it themselves, Rapier when physics has to stay deterministic. Not because something is new.` | `…Node when the team lives in TypeScript end to end, MongoDB when the data is document-shaped, GraphQL when clients over-fetch, Three.js and React Three Fiber when the interface should move. Not because something is new.` |

**Why:** v1 read as a JS-native product engineer; Home reads as a JVM engineer with a strong TypeScript/3D wing — which is what the timeline actually says. The per-group heading colours arrive at the same time as the chip recolouring: one systematic pass.

### 16.6 Experience — 3 entries → 5, generic → specific

v1 had three entries with no location and vague scope:

| v1 | Role | Date | Dot |
|---|---|---|---|
| `Data Age` | `Tech Lead` | `2023 — present` | `#7C3AED`, glow |
| `Rapidev Labs` | `Senior Software Engineer` | `2022 — present` | `#A78BFA`, no glow |
| `Earlier engineering roles` | `Software Engineer` | `2020 — 2022` | `#30363D`, no glow |

Home replaces the whole `<ol>` body with five entries carrying employer, discipline, city and hard numbers (see §9). `Rapidev Labs` **disappears from the timeline entirely**. `Data Age` is re-dated `2023 — present` → `2024 — present` and re-titled `Tech Lead` → `Software Engineer · Harare, Zimbabwe`. The first dot changes from `#7C3AED` to `#A78BFA` (same glow), and every entry after the first gains its own accent + glow rather than a flat violet.

**Why:** the timeline now carries the receipts for the two new proof-strip stats and for the Java/Spring stack.

### 16.7 Writing — one excerpt reframed, real social hrefs

| | v1 | Home |
|---|---|---|
| Card 1 excerpt | `Reversible migrations in practice: what dry-run mode actually has to prove before you let apply touch production.` | `Shift-left in practice: what a Spring Boot service looks like when the tests are written before the endpoint.` |
| Card 2 excerpt | *(unchanged)* | *(unchanged)* |
| LinkedIn pill | `href="#"` | `href="https://linkedin.com/in/wieslaw-samushonga-3b3913154" target="_blank" rel="noopener"` |
| GitHub pill | `href="#"` | `href="https://github.com/JxstWieslaw" target="_blank" rel="noopener"` |

### 16.8 Contact — real identity, fluid grid

| | v1 | Home |
|---|---|---|
| Grid (L547→502) | `grid-template-columns:1fr 520px; gap:64px;` | `grid-template-columns:1fr clamp(320px, 38vw, 520px); gap:clamp(24px, 4vw, 64px);` |
| Email | `wieslaw@rapidevlabs.com` | `wieslawsamushonga01@gmail.com` |
| `copyEmail` clipboard value | `wieslaw@rapidevlabs.com` | `wieslawsamushonga01@gmail.com` |
| Error status message | `…or email wieslaw@rapidevlabs.com directly.` | `…or email wieslawsamushonga01@gmail.com directly.` |
| Row 2 href | `#` | real LinkedIn URL, `target="_blank" rel="noopener"` |
| Row 3 | `Consulting via` / `Rapidev Labs`, `href="#"` | `GitHub` / `github.com/JxstWieslaw`, real URL |

**The contact grid clamp is the only responsive improvement in the whole diff** — everything else stayed fixed-track. Direction of travel: fluidity is being retrofitted, section by section, and this one landed first.

### 16.9 Motion and rendering (the engineering half of the diff)

**A. The entire `data-reveal` system is new.** v1 has **zero** `data-reveal` attributes and no `setupMotion()`. Home adds 25 marked elements + the 57-line `setupMotion()` method + the bootstrap in `componentDidMount`:

```js
setTimeout(() => { try { this.setupMotion(); window.__motionReady = true; } catch (e) { console.error('setupMotion failed', e); } }, 0);
```

and re-arms it from `componentDidUpdate`:

```js
// v1
componentDidUpdate() { this.drawAll(); }
// Home
componentDidUpdate() { this.drawAll(); if (!this._rvTimer) setTimeout(() => { try { this.setupMotion(); } catch (e) {} }, 0); }
```

`componentWillUnmount` gains `cancelAnimationFrame(this._raf)`, `clearInterval(this._rvTimer)`, `this._io.disconnect()`, `this._vio.disconnect()`.

**B. The hero canvas is now animated.** v1's `paint(canvas, kind)` was static; Home's is `paint(canvas, kind, tSec)` with the wobble and breathing-scale terms, driven by a visibility-gated, 50ms-throttled `requestAnimationFrame` loop.

```diff
- const S = (cfg.fit === 'h' ? H : Math.min(W, H)) * cfg.scale;
- const cr = Math.cos(cfg.rot), sr = Math.sin(cfg.rot);
+ const wob = tSec ? Math.sin(tSec * 0.35) * 0.05 : 0;
+ const S = (cfg.fit === 'h' ? H : Math.min(W, H)) * cfg.scale * (tSec ? 1 + 0.012 * Math.sin(tSec * 0.8) : 1);
+ const cr = Math.cos(cfg.rot + wob), sr = Math.sin(cfg.rot + wob);
```

**C. Canvas sizing is now idempotent** (necessary once you repaint every frame — reassigning `canvas.width` clears the bitmap and reallocates):

```diff
- canvas.width = W * dpr; canvas.height = H * dpr;
+ if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
+ …
+ ctx.clearRect(0, 0, W, H);
```

**D. The colour ramp gained a middle stop.** v1 interpolated violet → cyan directly:

```js
// v1
const shade = (q) => {
  const t = Math.max(0, Math.min(1, q.t));
  return [Math.round(124 + (34 - 124) * t), Math.round(58 + (211 - 58) * t), Math.round(237 + (238 - 237) * t)];
};
```

Home routes through fuchsia `#E879F9` (the three-stop function in §13). This is why `#E879F9` also appears in the Habit 02 bullets — the UI palette was extended to match the canvas.

**E. `scatter` depth values retuned** (L789→802): `p.push([x, y, z, air ? 0.35 : 0.58 + (y + 0.95) * 0.42])` → `p.push([x, y, z, air ? 0.78 : 0.86 + (y + 0.95) * 0.14])`. Under the new three-stop ramp this pushes the craft-section field from the violet end into the fuchsia→cyan end, matching the section's cyan eyebrow and cyan-lit panel.

### 16.10 What did **not** change

Identical byte-for-byte between the two files: the `<helmet>` block and all font/global CSS; the root wrapper; the skip link; all nav/logo/CTA styling; `navStyle` and the `scrollY > 24` threshold; the backdrop sticky-canvas pattern and all seven scrims; every `cfg` formation parameter; the hero panel chrome, button styles and stat `<dl>` structure; the work-section grid and every card's layout, copy, tags and hover; the process rail; the testimonial slot; the craft section in full (including the physics/HUD/AR machinery and all HUD values); the stack layout, chip tiers and legend; the writing card chrome and the secondary social tier; the form fields, the whole form state machine's shape, and both `sc-if` guards; the footer in full apart from one nav label.

### 16.11 Reading the direction of travel

1. **Claims are being downgraded in title and upgraded in specificity.** Tech Lead → Software Engineer, but with `50%` and `30%` measured outcomes and five dated, located roles.
2. **Colour is becoming systematic.** One pass gave the eight domains, the six stack groups, the three habit cards and the five timeline dots each a hue from the same violet→fuchsia→cyan ramp that the canvas uses. Encode this as a `tone` token, not per-element hexes.
3. **Placeholders are being retired one at a time.** The dotted "unverified" underline came off the first proof stat; `href="#"` became real URLs on four links. The remaining dotted/dashed items (AR card, testimonial, RSS titles, `X`, `Medium`, `Instagram`, `Discord`, `Reddit`, `Pinterest`, `View perf`) are the outstanding backlog.
4. **Motion arrived after layout settled.** Reveal + hero animation are the newest layer and are the most defensively written code in the file (feature checks, a 4s hard deadline, reduced-motion bail-out, idempotent canvas sizing).
5. **Responsiveness is the unfinished work.** One clamp on the contact grid is the only breakpoint-ish change. Everything else is still fixed-track.

---

## 17. What `home-standalone-src.html` is

**It is `Home.dc.html` byte-for-byte, plus one 20-line block inserted at line 7 (between the `<script src="./support.js">` tag and `</head>`).** `diff -u` between the two produces exactly one hunk. The 931 vs 911 line count is entirely that insertion.

```html
<template id="__bundler_thumbnail" data-bg-color="#0D1117">
  <svg viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="#7C3AED"/>
        <stop offset="0.5" stop-color="#E879F9"/>
        <stop offset="1" stop-color="#22D3EE"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="800" fill="#0D1117"/>
    <g transform="translate(600 400)">
      <rect x="-90" y="-210" width="180" height="420" rx="18" fill="url(#g)" opacity="0.9"/>
      <rect x="-130" y="-90" width="40" height="40" rx="8" fill="#7C3AED" opacity="0.7"/>
      <rect x="104" y="-160" width="30" height="30" rx="6" fill="#22D3EE" opacity="0.7"/>
      <rect x="120" y="60" width="44" height="44" rx="9" fill="#E879F9" opacity="0.6"/>
      <rect x="-160" y="120" width="26" height="26" rx="6" fill="#67E8F9" opacity="0.6"/>
      <text x="0" y="16" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="120" fill="#F0F6FC">WS</text>
    </g>
  </svg>
</template>
```

**Purpose:** it is the **bundler input** — the source the Claude Design exporter consumes to produce a self-contained artefact. The `id="__bundler_thumbnail"` template supplies the gallery/social preview image and `data-bg-color="#0D1117"` the letterbox colour. It is a `<template>`, so it never renders.

The SVG is also a useful independent statement of the brand: a 1200×800 dark field, a 180×420 rounded monolith filled with the exact `#7C3AED → #E879F9 → #22D3EE` bottom-left-to-top-right gradient, four scattered cubes in `#7C3AED` / `#22D3EE` / `#E879F9` / `#67E8F9` at 0.6–0.7 opacity, and a 120px `WS` in `#F0F6FC` — i.e. the `monolith` canvas formation, drawn by hand. It confirms the three-stop ramp is the intended brand gradient (matching §16.9-D).

**For the rebuild:** ignore `home-standalone-src.html` as a design source — it carries no design information `Home.dc.html` does not. Keep the SVG as the basis for the OG image / favicon.

**Related file:** `Wieslaw Portfolio.html` (403 lines, 693KB) in the same directory is the *output* of that bundling step — the same markup with `support.js` and all three font families inlined as base64 `@font-face` blocks and asset URLs rewritten to opaque UUIDs. It preserves `style-hover=` verbatim, confirming those attributes are interpreted by the Design runtime rather than compiled to CSS at export.

---

## 18. Rebuild checklist (React + Tailwind v4)

1. **Tokens first.** Put the §0.4 palette, the §0.5 motion values, and the three font stacks into `@theme`. The `font-variation-settings` values (`wdth` 88/90/92/95/96/98/100, `opsz` 96) need named utilities — they are load-bearing and easy to lose.
2. **Author the breakpoints.** Nothing in the source does this. Minimum: nav → drawer ≤~900px; hero/craft panels → `width:100%` ≤~834px; work bento → 1/2/6 columns; proof stats → 2×2; process rail → stack; stack section → single column ≤~1000px; timeline date column → inline ≤~700px; contact → single column ≤~900px; footer → stack.
3. **Extract the three repeated primitives** before writing sections: `GlassCard` (7 variants), `HairlineGrid` (3 uses), `Chip`/`Badge` with a `tone` prop (the diff shows these hexes are actively churning).
4. **Fix the focus ring radius.** Global `:focus-visible` uses `border-radius:6px` against 12px/20px/999px components.
5. **Preserve the reveal contract exactly** (§14) — especially the above-fold guard and the 4-second hard deadline; both exist to prevent invisible content.
6. **Canvas:** keep the `cfg` table and both render passes verbatim; keep DPR ≤ 2, the 50ms hero throttle, the visibility gate, and the idempotent sizing check.
7. **Conditional content:** the AR work card, the testimonial `<figure>`, and the RSS-failure card are all "render only when data exists" slots. `{{ domainCount }}` (currently `7`) must be one value driving three call-sites and flip to `8` when the AR case study lands.
8. **Outstanding placeholders to resolve:** `[AR project name]`, `[Quote from an engineering manager or client — owner to supply]`, `[Name] · [Role, Company]`, `[Article title — from RSS]` ×2, and `href="#"` on `X`, `Medium`, `Instagram`, `Discord`, `Reddit`, `Pinterest`, `View perf`, and both writing cards.
