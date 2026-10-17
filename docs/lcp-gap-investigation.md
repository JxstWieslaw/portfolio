# LCP gap investigation (Phase 1 exit item)

Status: in progress. Interim findings; the final tables are added before the PR leaves draft.

Method: production build (`next build`, `next start`), `lhci collect` with the default Lighthouse mobile
preset (simulated throttling, 4x CPU, 150 ms RTT, 1.6 Mbps), 7 runs per URL, on the Windows laptop
(software GL, other builders running, so absolute numbers are noisy; only relative numbers mean anything).

## Baseline (develop 53a7633), median of 7, min / max in brackets

| URL | LCP (ms) | FCP (ms) | TBT (ms) | CLS | LCP element |
|---|---|---|---|---|---|
| default | 2792 (2675 - 2814) | 1670 (1663 - 1689) | 6436 | 0.017 | p.hero-sub |
| ?nogl=1 | 2860 (2640 - 2920) | 1672 (1663 - 1685) | 1606 | 0.017 | p.hero-sub |

## Observations so far

- Lighthouse's own observed (unsimulated) LCP phases for hero-sub: TTFB 49 ms, resource load delay 0,
  resource load duration 0 (text), element render delay 650 ms. Observed FCP and LCP are both 699 ms. The
  3.0 s figure is the Lantern simulation of that load, not what the browser saw.
- The fonts are fetched only after the stylesheet (HTML, then CSS, then 3 woff2 files, 89 kB): the served HTML has no
  `<link rel="preload" as="font">`, although the files are named `*-s.p.woff2`.
- The hero text is not on screen for most of the observed load: in a trace with screenshots the page is blank (the
  background colour only) until about 1.47 s, while the main thread is idle for the 350 ms before it. The frames in
  between are dropped by the compositor and the GPU process (SwiftShader) spends 70 - 144 ms per task rasterising the
  first real frame. That is an environment effect of software GL.
