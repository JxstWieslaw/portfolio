# Mission log: animations and 3D models, and the platform to host them (2026-10-02 to 2026-10-04)

**Mission (Wieslaw):** add more animation and 3D models to the portfolio, pick open-source models and configure them onto the platform using the build-awwwards-quality-sites approach, and build the platform prospectively.
**Repo:** portfolio · **Profile:** `creative-3d, marketing-site` · **Base:** `develop` · `auto_main: no` (nothing here went to `main`; the release PR is left for Wieslaw).
**Stop condition (met):** a merged, reviewed model platform (contracts, ingest, runtime slot), motion work that fits the budgets, and the first models integrated with credits.

## Outcome in one paragraph
The site now has a reviewed, budget-checked model platform and three models in the journey. A build-time pipeline (`npm run assets:fetch | ingest | check`) turns pinned sources into hashed GLBs plus a manifest and credits; a runtime slot inside the single persistent canvas loads at most two models per section, falls back to the procedural artefact on any failure, and costs 23.5 kB gz in its own lazy chunk. Three models are live in the ledger (our own gyroscope in How I Lead, Kenney's crystal cluster in Craft and gate in Stack, both CC0) with credits in the footer. Motion work: reveal stagger, nav, hover gating and heading reveal (#43), canvas gating (#45), scroll-velocity stretch (#50). GSAP and Lenis were rejected on measured budgets. The hero stays procedural.

## Decisions (lead)
- **D1 revised.** The procedural artefact stays the default and the fallback. A sourced GLB is an optional upgrade behind the same slot (spec M1).
- **D2 No GSAP or Lenis on any route.** Measured 50.3 kB gz against 1.4 to 2.65 kB of initial JS headroom; the repo owns its scroll store.
- **D3 Licences:** `CC0-1.0`, `own`, and `CC-BY-4.0` only with a footer credit. A Zod enum, not free text.
- **D4 Files:** optimised, content-hashed GLBs under `apps/web/public/models` (public repo, history is permanent): each at most 400 kB, all at most 1.5 MB. Raw sources never committed. No Git LFS.
- **D5 Build-time ingest now, API later:** the manifest has the shape of the future `GET /v1/assets/manifest?tier&caps`.
- **D6 One canvas:** models are children of the existing rig group.
- **D7 The manifest is GLB-only for `version: 1`.**
- **D8 Fetch allow-list is `kenney.nl` only** (`SOURCE_HOSTS` in `hosts.ts`); each new host is a reviewed PR that names its source.
- **D9 Codecs:** Meshopt on, Draco off, WebP textures first, KTX2 deferred.
- **D10 Model picks (chosen by the lead as delegated):** own gyroscope, Kenney `rock_crystalsLargeB`, Kenney `gate_complex`. Not hero-grade, so the hero stays procedural.
- **D11 Tier is stubbed from the rung** (`reduced-instances` gives tier 1, `live` tier 2, `?tier=` only in dev or the test seam) until detect-gpu lands. Tier 1 is the safe direction; ordinary 4-core laptops get it today.

## Shipped (all squash-merged into `develop`, each after CI and the review stage)
| PR | What | Review stage |
|---|---|---|
| #39 | assessment of which skills lift the portfolio (earlier mission) | docs |
| #42 | model platform spec | docs, CI |
| #43 | DOM motion: batch stagger, nav without layout shift, hover gating, heading reveal | code + test review, 1 High fixed (click-through nav bar) |
| #44 | contracts, ingest pipeline, fetch helper, validators, CI check | 5 reviewers, 13-item fix round, verified |
| #45 | six side canvases paint when seen | code review |
| #46 | scanner hardening 1 (canonical form, bufferView coverage, key allow-lists, hosts table) | security + code review |
| #47 | mission log | docs |
| #48 | runtime model slot in the single canvas (ledger all null) | 4 reviewers, 2 fix rounds, verified |
| #49 | scanner hardening 2 (values, reachability, tiling, decode gating, strip fixes, canary) | security + code review, verified, 1 High fixed |
| #50 | scroll-velocity response | code review, refresh-rate bug fixed |
| #51 | first models, material-merge look step, credits | code + security/provenance review, 8-item fix round |

## Baseline and final numbers (SwiftShader on a Windows laptop: relative only)
Before (develop 0cdd8a8): initial JS 118.27 of 120 kB gz, core 262.37 of 275 kB; LCP median about 3.0 s with and without the Assembly; TBT about 0.8 s with `?nogl=1`, about 10 s with the Assembly live under software GL; 5 draw calls and 35,280 triangles per frame.
After (develop 34098ad): initial JS about 118.59 kB (about 1.4 kB headroom), core about 267.6 kB, `models` chunk 23.5 kB (limit 26), public/models 75 kB for four files. **Not re-measured after the models landed**: LCP, TBT and frame time are `unmeasured` since the baseline; only the load gate (models load after the LCP gate and a live Assembly) and the e2e assert protect them. The canvas gating gain (#45) was within noise.

## What each review round caught (the pattern worth keeping)
- Silent-failure class: scripts that exit 0 having done nothing (entry guard), a CI grep guard that fails open on exit 2, a size cap that becomes `NaN`, a header rule that made the unhashed manifest immutable, a failure for an asset that had scrolled away that was never counted.
- The security scanner needed three rounds (keys, then values and reachability, then hidden bytes in views, padding and matrix columns); each round found a smuggling channel the last one missed.
- Behavioural bugs found only by review: the click-through condensed nav, refresh-rate-dependent stretch (a `min dt` floor), reveal stagger following observer order.
- False rejections of legitimate models were checked explicitly each round (a Kenney piece, a Blender export with morph targets): the first real ingest needed three pipeline fixes (`strip()` did not remove `KHR_materials_unlit`, emissive strength, sparse accessors) plus the material merge.

## Blocks
- **Session rate limit, four times.** Builders were cut off mid-run; nothing was lost because briefs required a commit and push after each milestone. Resumed from the state found in each worktree. This is now a standing line in the dispatch protocol.
- **A measuring agent ran `taskkill /F /IM node.exe`.** No builder was affected. Added to the inbox and briefs.
- **Locked worktree directories** (Windows handles): fresh worktree path per run; the leftovers under `C:\tmp` are harmless and can be deleted when their processes exit.
- **An untracked `docs/domains-plan.md`** appeared in the main checkout during the mission. Not created by this mission, left untouched.

## Grants used
None.

## Open follow-ups (none blocks the release)
1. Security headers PR: nosniff, referrer policy, permissions policy and a report-only CSP (`'wasm-unsafe-eval'`, no `worker-src blob:` needed).
2. Re-measure: 12 Lighthouse runs on the CI runner plus a trace against `develop` now that models are live, and a real-phone check.
3. Visual: models are mostly hidden behind the glass panel on phones; portrait-specific placement is a design call for Wieslaw. The gyroscope is faint behind the pillar cards.
4. BottomSheet slide never animates (Tailwind v4 `translate` vs `transform`); refresh the stale local visual baselines.
5. detect-gpu tiering to replace `stubTier`; meshopt trailing-bytes verification (residual risk documented); print-time paint for the six side canvases; idle prefetch of the gyroscope for visitors who never scroll; 8-bit COLOR_0 drift on the darkest palette colours.
6. `size-limit` core entry hard-codes chunk ids 655/826 and mis-reads by about 2.7 kB when the build path differs; the initial-JS headroom is about 1.4 kB, so every later slice must be that careful.
7. Owner decisions from the skills assessment remain open (see `2026-10-02-skills-assessment.md`): placeholder content, case-study facts, contact copy, the `--fg-3` contrast change.

## Card and rule updates
`repos/portfolio.md`: model platform summary, rules and follow-ups. `skills-catalog.md` §6: fit notes (build-threejs-scroll-worlds, review-animations, no-ai-design-slop, tastemaker, optimize-web-animations). `fleet-protocol.md`: standing lines for every edit brief. `learnings-inbox.md`: nine `[general]` entries (multi-round scanner review, fail-open guards, retained-code canaries, header scope, merge-gate conflicts, build-inputs hash, Windows worktree and editing habits, rate-limit-safe briefs, refresh-rate floors).
