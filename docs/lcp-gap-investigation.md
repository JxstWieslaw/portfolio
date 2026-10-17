# LCP gap investigation (Phase 1 exit item)

Outcome: **no code change is justified by the evidence.** The simulated mobile LCP (about 2.8 s against the 2.0 s target)
is set by how many bytes the page must move over Lighthouse's simulated 1.6 Mbps link before the first paint
(HTML and CSS, then 125 kB of JavaScript, then 89 kB of fonts). The render-side suspects were each tested and rejected.
Closing the remaining gap means shipping fewer bytes, which the budgets already pin, or measuring on hardware where the
first frame is not slowed by software GL. The next step is a CI-runner measurement (the last section), not a speculative edit.

## Method

- Production build of `develop` at 53a7633 (`next build`, `next start`), served on port 3111.
- `lhci collect` with Lighthouse's default mobile preset (simulated throttling: 4x CPU, 150 ms RTT, 1.6 Mbps), 7 runs
  per row, on the Windows laptop (software GL, other builds running). Only relative numbers mean anything.
- Both URLs: the default page and `?nogl=1` (no Assembly).
- Experiments change the page through a local reverse proxy that rewrites the HTML (so the build stays identical and the
  comparison is against a control run through the same proxy). Rows are medians with min to max in brackets.

## Baseline

| URL | LCP ms | FCP ms | TBT ms | CLS | LCP element |
|---|---|---|---|---|---|
| default | 2792 (2675 to 2814) | 1670 (1663 to 1689) | 6436 | 0.017 | `p.hero-sub` |
| `?nogl=1` | 2860 (2640 to 2920) | 1672 (1663 to 1685) | 1606 | 0.017 | `p.hero-sub` |

The Assembly makes no difference to LCP (TBT differs because of the GL work, LCP does not).

## LCP phase breakdown for `p.hero-sub`

Lighthouse reports the phases from the observed (unsimulated) load, and its LCP number from a simulation. They are
two different quantities here.

| Run set | Observed LCP ms | TTFB | Load delay | Load duration | Element render delay |
|---|---|---|---|---|---|
| default, 7 runs | 399, 699, 1377, 1409, 1414, 1449, 1450 | about 50 | 0 | 0 (text) | 388 to 1435 (96 to 99 percent) |
| `?nogl=1`, 7 runs | 718, 864, 880, 1394, 1523, 1529, 1541 | about 50 | 0 | 0 (text) | 700 to 1529 |
| default, a later batch | 687 to 1554, one run at 19 075 | about 50 | 0 | 0 | to 19 003 |

- The dominant observed phase is element render delay: the text is in the server HTML and the stylesheet arrives by
  about 130 ms, yet the first frame that contains it is presented between 0.4 s and 1.5 s (once at 19 s). In a trace
  with screenshots the page is blank until 1.47 s while the main thread is idle for the 350 ms before it; the GPU
  process (SwiftShader) spends 70 to 144 ms per task on the first real frame and the compositor drops the frames
  before it. That is software GL on this laptop.
- The simulated LCP does not follow it. Across those runs the observed LCP varies from 399 ms to 19 s while the simulated
  LCP stays between 2.68 and 3.0 s. So the 2.8 s is a property of the page's payload under the simulated link, not of
  the laptop's frame timing.

## Where the simulated 2.8 s comes from

| Page, `?nogl=1`, via the proxy | LCP ms | FCP ms |
|---|---|---|
| control (as served) | 2811 (2677 to 2873) | 1672 (1528 to 1687) |
| all `<script src>` removed | 1674 (1668 to 1678) | 1668 (1519 to 1678) |
| the three woff2 files answered 404 | 2274 (2157 to 2345) | 1222 (1218 to 1255) |

- With no JavaScript, LCP equals FCP at 1.67 s: that is the HTML (31.5 kB gzipped, 186 kB inflated, most of it the inline
  Flight payload) and the 11.5 kB stylesheet over the simulated link. So the standfirst itself paints with the
  stylesheet and does not wait for JS in the server HTML (confirmed: the `<p class="hero-sub">` is in the response, and
  `Reveal` never hides above-fold elements).
- JavaScript accounts for about 1.15 s on top: 125 kB gzipped across six chunks (the budget is 119.11 of 120 kB
  initial), at 200 kB/s is about 0.6 s of transfer plus the hydration CPU at 4x.
- The fonts account for about 0.5 s of LCP and 0.45 s of FCP (89 kB at 200 kB/s is 0.45 s). Lantern counts a font that
  finishes before the observed paint as part of the graph; with `font-display: swap` a real browser does not wait for it.

## Suspects tested and rejected

All rows are `?nogl=1`, medians (5 runs for the first four rows, 7 for the rest), through the proxy, against its own control in the same batch (LCP ms).

| Hypothesis | Change tried | LCP | Control | Verdict |
|---|---|---|---|---|
| backdrop-filter on the glass raster cost | `backdrop-filter: none` | 5356 | 5334 | no effect |
| `text-wrap: pretty` layout cost | `text-wrap: wrap` | 5382 | 5334 | no effect |
| the scroll cue's looping animation | animation off | 5379 | 5334 | no effect |
| canvases, wash, poster painting | hidden | 5342 | 5334 | no effect on LCP (TBT fell from 1289 to 266) |
| fonts discovered late (HTML, CSS, fonts chain) | `rel=preload` on the three files | 2833 | 2838 | no effect |
| render-blocking CSS round trip | stylesheet inlined by proxy | 2621 | 2838 | about -220 ms in the proxy |
| the same, as a real build (`experimental.inlineCss`) | built and measured, 7 runs | 2832 default, 2854 nogl | 2792, 2860 | **no effect, reverted** |
| Reveal or stagger hiding the hero | read `Reveal.tsx` | n/a | n/a | the above-fold guard already leaves the hero visible, nothing hides it |
| the inline pre-paint script | read, 150 bytes | n/a | n/a | negligible |

(The first four rows ran through an uncompressed proxy, which is why their absolute numbers are higher; only the
comparison with the control in the same batch is meaningful.)

## Finding to follow up, not an LCP lever

This laptop's build emits no `<link rel="preload" as="font">` and `.next/server/next-font-manifest.json` has
`"app": {}`, although `app/fonts.ts` and `docs/m0-status.md` say the fonts are preloaded. Next's font manifest plugin
matches modules with `mod.request.includes('/next-font-loader/index.js?')`, a forward-slash match that very likely fails
on Windows paths. It has not been checked on a Linux build (CI or Vercel), so it is unverified there. Preload made no
difference to the simulated LCP, so it is not part of this gap either way.

## What was not measured

- A real phone, and the CI runner (its CPU, its GL, its observed paint time).
- A cold cache over a real network. Everything above is simulated throttling on a warm local server.
- The effect of an observed paint earlier than the font and script arrivals, which is the one thing that would change
  the simulated number without cutting bytes (the first frame here is slowed by SwiftShader).

## Proposal: measure on the CI runner before changing code

1. Run the existing `lhci` job with 12 runs (the roadmap's exit criterion) and keep the LHR JSON as an artifact.
2. Read `metrics.observedLargestContentfulPaint` and the `lcp-phases-insight` element render delay from each run next
   to `largestContentfulPaint`. If the observed LCP on the runner is below about 450 ms, the fonts and most of the JS
   drop out of the simulation and the figure will fall without a code change; if it is not, the gap is the payload.
3. Only if the payload is the cause: the levers that reduce bytes before the first paint are a smaller initial client
   tree (the `Craft` client-boundary split already on the roadmap), loading the Assembly bootstrap after first paint,
   and trimming the fonts further than the current 83.6 kB. Each needs its own budget decision.

No Lighthouse assertion was added or tightened: the `warn` level on `largest-contentful-paint` and
`categories:performance` in `apps/web/lighthouserc.cjs` stays until step 2 gives a number the runner can hold.
