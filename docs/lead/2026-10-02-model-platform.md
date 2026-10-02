# Mission log: animations and 3D models, and the platform to host them (2026-10-02)

**Mission (Wieslaw):** add more animation and 3D models, pick open-source models and configure them onto the platform using the build-awwwards-quality-sites approach, and build the platform prospectively.
**Repo:** portfolio · **Profile:** `creative-3d, marketing-site` · **Base:** `develop` · `auto_main: no` (nothing here goes to `main`).
**Stop condition:** a merged, reviewed model platform (contracts, ingest, runtime slot), motion work that fits the budgets, and the first models integrated with credits; or everything left parked on Wieslaw.

## Decisions (lead)
- **D1 revised.** The procedural artefact stays the default and the fallback. A sourced GLB is an optional upgrade behind the same slot (spec M1). Every platform failure lands on something already designed.
- **D2 No GSAP or Lenis on any route.** Measured 50.3 kB gz for GSAP core, ScrollTrigger and Lenis against 1.45 to 2.65 kB of initial JS headroom; the repo owns its scroll store.
- **D3 Licences:** `CC0-1.0`, `own`, and `CC-BY-4.0` only with a footer credit. A Zod enum, not free text.
- **D4 Files:** optimised, content-hashed GLBs under `apps/web/public/models` (public repo, history is permanent): each at most 400 kB, all at most 1.5 MB. Raw sources never committed (`assets-src/` is ignored). No Git LFS.
- **D5 Build-time ingest now, API later:** the manifest has the shape of the future `GET /v1/assets/manifest?tier&caps`, so Phase 4 is a swap at `loadManifest()`.
- **D6 One canvas:** models are children of the existing rig group; no second GL context.
- **D7 The manifest is GLB-only for `version: 1`.** USDZ, posters and KTX2 arrive with a version bump.
- **D8 Fetch allow-list is `kenney.nl` only.** The reviewed shortlist needs nothing else; each new host is a reviewed PR that names its source. No GitHub hosts (a repo allow-list is not an integrity boundary there).
- **D9 Codecs:** Meshopt on, Draco off, WebP textures first, KTX2 deferred (spec M7, M8).

## Plan and dispatches
| Phase | Task | Persona | Result |
|---|---|---|---|
| 0 | Platform design | systems-architect | spec merged, PR #42 |
| 0 | Threat model | security-auditor | requirements for the pipeline (supply chain, licences, binary-in-git, CSP, upload hardening) |
| 0 | Model curation | frontend-engineer | six Kenney CC0 candidates, none hero-grade; licences read from the primary source; zips kept outside the repo |
| 0 | Baseline S0 | performance-engineer | post-#37 numbers, see below |
| 1 | P3a DOM motion hygiene | frontend-engineer | PR #43 merged after one fix round |
| 1 | P1 contracts and ingest | mvp-builder | PR #44 merged after the full review stage and one fix round |
| 1 | S3 canvas gating | performance-engineer | PR #45 merged |
| 2 | P1b scanner hardening | mvp-builder | PR #46 open, CI green, reviews interrupted (below) |
| 2 | P2 runtime model slot | frontend-engineer | PR not yet open; core committed on `feat/assembly-model-slot` (1561e93) |
| 3 | P3b velocity uniform, P4 model integration | | not started (wait on P2) |

## Baseline (develop 0cdd8a8, SwiftShader on a Windows laptop, relative numbers only)
Initial JS 118.27 of 120 kB gz, Assembly core 262.37 of 275 kB. LCP median about 3.0 s with and without the Assembly (the LCP gate works; the LCP element is now the hero-sub paragraph). TBT about 0.8 s with `?nogl=1` versus about 10 s with the Assembly live under software GL. The Assembly draws 5 calls and 35,280 triangles per frame. Long tasks of 200 to 320 ms every ~300 ms after LCP come from the 2D canvases until `data-gl=live`. Initial headroom is now about 1.45 kB after #43 and #45.

## Review stage results (what each review found)
- **#43:** one High (the visible condensed nav bar was click-through; found independently by the code review and the test analysis), stagger order followed `observe()` order, spec text drifted. All fixed in one round. The real-browser tests for click-through and the reduced-motion heading reveal were added.
- **#44:** no Critical. High findings were silent-failure risks: the executed-directly guard could make the scripts exit 0 having done nothing; `assets:check` did not compare several manifest claims to the file; a partial ingest could delete other models' files. Plus fail-open parsing, non-atomic writes, a scanner blind to the BIN chunk, and contract types that could represent bad states. All 13 fix items done (3 partials judged reasonable); a verification round closed all ten re-checked findings.
- **#45:** no defects found; the A/B gain is within noise (about 13% fewer post-LCP long tasks, ranges overlap), so it is recorded as a structural cleanup, not a measured speed-up.

## Open items on the way to P4
- **PR #46** (scanner and hosts hardening): implements the three Medium security findings (fake bufferView hides unreferenced bytes; duplicate keys and padded JSON; no element-key allow-list) plus the shared hosts table. CI is green and the app bundle is unchanged. Its security review and code review were cut off by the session limit and must be re-run before merge. The reviewers are told to check that the new key allow-lists do not wrongly reject a legitimate Kenney or textured WebP model: this decides whether P4 can ingest the first real source.
- **P2** must be completed, reviewed and merged first: ledger all `null`, no pixel change, nothing added to the initial bundle, `models` and `core` size entries proven disjoint, plus the carry-overs (export `BREATH_FPS`, record the 30 to 20 fps tradeoff and the 120/144 Hz stepping, fix the stale comments).
- **P4** needs a material pass in the pipeline: the curated Kenney pieces have 3 to 4 materials, declare `KHR_materials_unlit` and have off-centre origins; the pipeline currently rejects more than 2 materials. Plus `KHR_materials_emissive_strength` is in the schema enum but allowed at no tier.
- **Small follow-ups:** BottomSheet slide never animates (Tailwind v4 emits `translate`, the transition names `transform`); refresh the stale local visual baselines; a security-headers PR (nosniff, referrer policy, permissions policy, report-only CSP with `wasm-unsafe-eval` and `worker-src blob:` for the loaders); optional print-time paint for the six side canvases; the `size-limit` core entry hard-codes chunk ids 655/826 and mis-reads by about 2.7 kB when the build path differs.

## Blocks
- **Session rate limit, twice** (8 pm and 1 am Johannesburg). Agents were cut off mid-run; none lost work because the briefs required a commit and push after each milestone. Resumed from the state found in each worktree.
- **A measuring agent ran `taskkill /F /IM node.exe`**, which can kill other agents' processes. Checked: no builder was affected. Added to the learnings inbox and to the briefs from then on.

## Grants used
None.

## Card and rule updates
`repos/portfolio.md`: baseline numbers, model platform summary. `learnings-inbox.md`: shared-CPU measurement rule, never `taskkill /IM node.exe`, gate on a marker rather than a fixed timeout, a clean `?nogl=1` control for baselines.
