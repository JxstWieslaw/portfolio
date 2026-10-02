# Mission log: which global skills would improve the portfolio (2026-10-02)

**Mission (Wieslaw):** assess which installed skills can be leveraged to improve this project drastically, and use what the structuring teaches to improve the rest of the global Claude workflow.
**Repo:** portfolio · **Profile:** `creative-3d, marketing-site` · **Base:** `develop` · **Branch:** `docs/lead-skills-assessment` · **Mode:** report-only (no product code changed).
**Stop condition:** a consolidated, ranked assessment with owner decisions listed, and the lessons folded into the global workflow.

## Plan
Four assessors, one lens each, in parallel, each given four skills from the profile pack (`skills-catalog.md` §2) and told to reject skills that do not fit.

| # | Lens | Persona | Skills given | Mode |
|---|---|---|---|---|
| 1 | Visual design, UX, a11y, copy in `apps/web` | frontend-engineer | audit-ai-design-slop, better-interface, editorial-portfolio-chapters, design-token-audit | report-only |
| 2 | Motion, scroll choreography, 3D | frontend-engineer | find-animation-opportunities, review-animations, build-threejs-scroll-worlds, cinematic-gsap-lenis-motion-system | report-only |
| 3 | Performance and perceived speed | performance-engineer | optimize-web-animations, threejs, doherty-threshold, loading-states | report-only |
| 4 | Remaining product surface (pages, content, IA, contact) | mvp-builder | case-study, information-architecture, ux-writing, design-brief (+ content-family skills judged) | report-only |

## Headline
**No single skill transforms this site.** The repo is already specified and tuned: measured design tokens, an owned scroll-to-3D store, demand-driven R3F, LCP-gated mount, reduced-motion and 2D fallbacks. The value is in (a) a handful of cheap, zero-JS-budget fixes the skills' checklists surfaced, (b) finishing the product surface (case studies, IA, contact), where the content skills carry real weight, and (c) refusing the skills that would cost more than they give.

Evidence limits, read before acting on any number:
- Design and motion reports are **code-only**: nothing was rendered or profiled. Contrast ratios are computed, "feel" claims are code evidence.
- The only checked-in Lighthouse JSONs (`apps/web/.lighthouseci`) are from **2026-09-17**, before the Assembly (#22), the Craft split (#36) and the LCP gate (#37). Post-#37 LCP and TBT are **unmeasured**.
- The content assessor judged several skills from their descriptions plus partial reads (marked below). Those rejections are provisional.

## Consolidated ranked slices
Each slice is one PR. Slices marked **0 kB** add no JavaScript. Initial JS headroom is 2.65 kB (117.35 of 120 kB), lazy 3D headroom about 12.6 kB, so any new client code is hand-written CSS or TS, never a library.

| Order | Slice | What | Skills that earn it | Waits on |
|---|---|---|---|---|
| S0 | **Measure** (no code) | 12 Lighthouse runs on the CI runner against current `main`, plus a throttled-mobile Chrome trace over the Assembly init, long tasks after LCP, and GPU time with glass over the live canvas. | optimize-web-animations | nothing; gates S5 and the `error` restore |
| S1 | **Motion hygiene, 0 kB** | Reveal stagger by observer batch (cap ~3 steps) instead of DOM sibling index (`Reveal.tsx:142-148`); Nav height animation to a transform (`Nav.tsx:49,240`); gate hover motion behind `@media (hover:hover)` (none exists); BottomSheet enter from 560 ms to 320 ms (`BottomSheet.tsx:117`). | find-animation-opportunities, review-animations | nothing |
| S2 | **Copy-only, 0 kB** | Shorten the hero sub (4 sentences, ~60 words; headline stays fixed; `Hero.tsx:80-84` and `profile.json` must agree); Timeline h2 repeats its eyebrow (`Timeline.tsx:83`); contact hand-off message reworded as a user instruction. | better-writing, ux-writing | nothing |
| S3 | **Canvas work** | Paint the six non-hero 2D canvases on first intersection (`FieldCanvas.tsx:111-152`; disabling canvas painting cut script evaluation 1149 to 288 ms in the LCP investigation, LCP unchanged); stop re-arming the hero rAF once `data-gl="live"` (`:130-134`); desktop idle breathing 30 to 20 fps (`AssemblyCanvas.tsx:109`). | optimize-web-animations | S0 method for before/after |
| S4 | **Choreography correctness** | ResizeObserver on `<main>` re-measures sections (boxes go stale after form errors, sheets, late fonts; `AssemblyCanvas.tsx:163-173`); one-shot repel impulse on touch `pointerdown`. | build-threejs-scroll-worlds | nothing |
| S5 | **IA then case-study template** | `information-architecture` output (sitemap, URL scheme, nav and footer labels) → add narrative fields (problem, decision, outcome, consent) to the projects data → `/work/[slug]` template with one real study (`pr-pulse`, least consent needed) plus its sitemap, OG and JSON-LD. | information-architecture, design-brief, case-study, ux-writing | owner inputs below |
| S6 | **Honesty cleanup** | About 10 `placeholder` flags render as dashed or dotted UI on the live page (`content/*.json`); four "Coming soon" dead ends on one scroll (`Footer.tsx:72-82,145`, `SelectedWork.tsx:136-150`, `Craft.tsx:106-110`); two unverified KPIs; fake-looking writing entries linking to the Medium root. Remove or replace, do not design them. | audit-ai-design-slop | Wieslaw supplies or approves real figures |
| S7 | **Legibility, via the spec** | `--fg-3` #6E7681 measures 4.12:1 on `--bg-0` and 3.77:1 on `--bg-2` (computed), under AA 4.5:1; 11 px mono microcopy. Edit the reconciliation spec first (`globals.css:11-12`), then the token. | better-accessibility, better-typography | spec change approved |
| S8 | **Token tidy** | About 25 raw rgba literals (scrims, nav) become tokens. No visual change; run the visual suite. | design-token-audit | after S6 so it does not tokenise values the slop audit deletes |
| S9 | **Contact copy** | Success/error/limited states rewritten; ship with the API wiring, not before (`ContactForm.tsx:85` success copy is unreachable until then). | ux-writing, better-writing | API wiring (plan §12) |
| S10 | **Journey slice 3a** | Extend the per-section chapter ledger (camera target offset, key/fill, grade, portrait overrides; `camera.ts:282-324`, `motion.ts`) and add a damped scroll-velocity uniform. | build-threejs-scroll-worlds | plain-three migration decided first |
| later | `/about` + `/resume` static slice; remaining case studies one per PR; masked heading reveal and form-status motion; glass-weight audit (make non-hero panels opaque if S0 shows GPU cost); release 2D bitmaps once live (only if S0 shows memory pressure); lazy web-vitals beacon with Phase 2b | content-strategy, better-writing, information-architecture | S0, owner inputs |

LCP note: nothing above is expected to close the hydration-bound LCP gap. If S0 confirms it, the lever is fewer hydrated nodes above the fold, which belongs to `vercel:react-best-practices` and `vercel:nextjs`, not to any animation or 3D skill.

## Skills: use, lead, reject
**Use for this repo:** `audit-ai-design-slop` (removal-first; protects the budgets), `optimize-web-animations`, `find-animation-opportunities`, `review-animations` (read the file directly; it is `disable-model-invocation`), `build-threejs-scroll-worlds` (ledger, mobile overrides, seam QA only), `better-writing`, `ux-writing`, `information-architecture`, `design-brief`, `case-study` (swap its design-process arc for decision log, constraints and measured outcome), `better-interface` (orchestrator; needs rendered screens), `design-token-audit` (narrow, low yield).

**Reject, with the reason:**
- `cinematic-gsap-lenis-motion-system`, `gsap*`: core, ScrollTrigger and Lenis cost about 51.7 kB gz against 2.65 kB headroom; `resolveScroll` already owns scroll-to-state; Lenis is a stated non-goal in the journey spec and its inertial scroll events would keep the demand-driven R3F loop rendering; its pre-hide CSS contradicts the repo's "markup ships visible, JS hides behind a deadline" rule. Salvage the masked-line reveal as plain CSS.
- `editorial-portfolio-chapters`: prescribes a near-black campaign-photo shell; this site is leadership plus one persistent WebGL layer. Only "title, role, year and action visible without hover" transfers.
- `landing-page`: single-offer pages. Borrow its one-primary-action check for Contact only. *(description-level)*
- `gpt-image-2`: generated imagery would stand in for project proof, against the roadmap's no-fabricated-evidence rule. *(description-level)*
- `presentation-deck`, `web-video-presentation`, `beautiful-article`: wrong format for site pages. *(description-level)*
- `threejs`, `doherty-threshold`, `loading-states`: the repo is ahead of `threejs` (demand frameloop, DPR cap, disposal, context-loss ladder); there is no async UI for the other two. `doherty-threshold` only suggests an INP measurement.
- Post-processing, custom cursor, magnetic buttons, KPI count-up: negative value here (fill cost on mid-range Android, frequency, function).

**Who leads when skills disagree** (now in the catalog, §5): DOM motion `animate`; 3D scroll `build-threejs-scroll-worlds`; whole-UI pass `audit-ai-design-slop` before `better-interface`; tokens follow the repo spec; easing follows the Emil lineage (ease-out on UI), not `animation-systems`.

## Owner decisions this waits on (Wieslaw)
1. A `/work` index route, or `#work` linking straight to `/work/[slug]`.
2. Replace or drop the two placeholder KPIs, the three `placeholder: true` projects, the "Earlier engineering roles" row, and the two fake writing entries (or approve "Writing soon" with no fake titles).
3. Per case study: your role, one or two hard facts, one decision you made, and a consent line for private work. Which private projects may become public.
4. Contact: enquiry types, reply-time claim, who reads the form.
5. Approve the `--fg-3` and 11 px legibility changes through the reconciliation spec.
6. Design calls: sleep the Assembly after idle; raise the world's opacity floor on flat sections; hero entrance after the LCP re-measure.
7. `/about` narrative and photo or monogram; `/resume` as PDF or print-from-HTML; testimonial quotes with written consent.

## Global workflow changes made (outside this repo)
Backed up first to `~/.claude/backups/personas-2026-10-02/`.
- `skills-catalog.md`: rules 8-10 (library-installing skills need a budget check; `disable-model-invocation` skills are read directly; code-only is unmeasured), fit notes for `creative-3d`, `marketing-site` and the performance persona, an engineering-portfolio recipe, a "who leads when skills disagree" table (§5) and a mission fit-notes section (§6).
- `fleet-protocol.md`: `## Skills used` now records how deeply each skill was read and whether the pass was code-only.
- `/lead`: assessment missions run one lens per assessor with a measure step, and treat description-only rejections as provisional.
- `learnings-inbox.md`: four `[general]` entries from this mission.
- `repos/portfolio.md`: `Skills that fit` line.

## Dispatches and reports
All four reports completed, report-only, none blocked. No grants used. Reports were read in full; the performance and motion reports quote measured numbers and `file:line` evidence, the design report is explicit that it is code-only, and the content report lists which skills it read only by description. Where reports overlapped (hero rAF in performance, hero cue in motion; placeholders in design and content) they agree.

## Lead's own notes
- Brief wording `Skills:` of four per assessor worked: every assessor produced an explicit reject list instead of forcing skills, which is the behaviour the catalog was built to get.
- The motion assessor flagged that `find-animation-opportunities` greets instead of working when given no question; briefs should always carry a concrete task.
- Nothing in this mission was merged to `main`; `auto_main` stays `no`.
