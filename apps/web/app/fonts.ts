import localFont from 'next/font/local'

/**
 * Self-hosted OFL faces, instanced down to the axis values the design actually
 * reaches. `next/font/local` fingerprints each file into `.next/static/media`,
 * emits its `<link rel="preload">`, and — because `adjustFontFallback` is on —
 * generates a metric-matched `… Fallback` @font-face carrying `size-adjust`,
 * `ascent-override`, `descent-override` and `line-gap-override` computed from
 * the file itself against Arial. The fallback therefore occupies the same box
 * as the real face, so `display: swap` costs no layout shift (CLS 0).
 *
 * WHY LOCAL AND NOT `next/font/google`
 * ------------------------------------
 * The three upstream latin subsets total 201 KB preloaded — Bricolage 128.5 KB,
 * Geist 28.7 KB, JetBrains Mono 30.7 KB — against the ≤ 90 KB font budget in
 * design spec §6. Google serves the full multi-axis masters; this site uses a
 * sliver of them (`design-foundations.md` §1.2, reconciliation §4). Instancing
 * the dead axes away is the only way to keep all three families AND the budget:
 *
 *   Bricolage Grotesque   128.5 KB → 33.0 KB   wght pinned 600 · opsz pinned 96
 *                                              · wdth VARIABLE, clamped 88–100
 *   Geist                  28.7 KB → 23.5 KB   wght 300–700
 *   JetBrains Mono         30.7 KB → 27.1 KB   wght 400–500
 *                                     ────────
 *                                      83.6 KB   (85 632 B, 58 % under before)
 *
 * `wdth` stays variable on purpose: it is the design's signature. All seven
 * values the type utilities ask for — 88, 90, 92, 95, 96, 98, 100 — sit inside
 * the retained range and interpolate identically to the untouched upstream
 * font (outlines byte-identical, advances within 1/1000 em of HVAR rounding).
 *
 * `opsz` is pinned at 96 per reconciliation §4 ("opsz is only ever 96"). NOTE
 * for whoever owns the type design: keeping `opsz` live would cost +28.6 KB and
 * put the payload at 112 KB, over budget. The visible consequence is that
 * `font-optical-sizing: auto` no longer has an axis to drive at h2/h3 sizes —
 * every display level now renders the 96 pt master, which is what the spec
 * table describes but not what the pre-subset build did below ~33 pt.
 *
 * REBUILD RECIPE (fontTools ≥ 4.63, brotli; sources are the upstream variable
 * TTFs from github.com/google/fonts — ofl/bricolagegrotesque, ofl/geist,
 * ofl/jetbrainsmono). Per family: instance, then subset.
 *
 *   fonttools varLib.instancer -o tmp.ttf SRC.ttf <limits>
 *     bricolage: wght=600 opsz=96 wdth=88:100
 *     geist:     wght=300:700
 *     jetbrains: wght=400:500
 *   pyftsubset tmp.ttf --flavor=woff2 --output-file=OUT.woff2 \
 *     --unicodes=U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,\
 *     U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,\
 *     U+2193,U+2212,U+2215,U+FEFF,U+FFFD \
 *     --layout-features=ccmp,locl,mark,mkmk,kern,liga,clig,calt,rvrn,rclt,rlig \
 *     --desubroutinize --name-IDs=0,1,2,3,4,5,6,13,14 \
 *     --drop-tables+=DSIG,MVAR,STAT,meta
 *
 * Hinting (`prep`/`gasp`) is kept — it costs 96 B across all three and Windows
 * rasterises body copy better with it. Discretionary layout features are
 * dropped: nothing in `apps/web` sets `font-feature-settings` or `font-variant`,
 * so they were 18 KB of unreachable GSUB.
 *
 * Licences: all three are SIL OFL 1.1 with no Reserved Font Name; the verbatim
 * `OFL.txt` for each ships beside the woff2 in `public/fonts/` for the colophon.
 */

/**
 * Bricolage Grotesque — display.
 *
 * The file is a single pinned wght-600 instance, so the `200 800` descriptor is
 * a matching range, not an axis: it makes this face answer every weight the
 * cascade can ask for — including the UA's default `bold` on a bare `<h1>`–
 * `<h6>` — so no engine ever paints synthetic bold over 104 px display type.
 * Every type utility in `globals.css` sets `font-weight: 600` explicitly, which
 * is exactly what this file renders at any requested weight.
 *
 * `font-stretch: 88% 100%` mirrors the retained `wdth` range. The utilities
 * drive the axis through `font-variation-settings`, which outranks
 * `font-stretch`, but declaring it keeps the descriptor honest about the file.
 */
export const display = localFont({
  src: '../public/fonts/bricolage-grotesque-latin.woff2',
  weight: '200 800',
  style: 'normal',
  declarations: [{ prop: 'font-stretch', value: '88% 100%' }],
  variable: '--font-display',
  display: 'swap',
  adjustFontFallback: 'Arial',
  fallback: ['sans-serif'],
})

/** Geist — body. Variable across the 300–700 the design loads. */
export const body = localFont({
  src: '../public/fonts/geist-latin.woff2',
  weight: '300 700',
  style: 'normal',
  variable: '--font-body',
  display: 'swap',
  adjustFontFallback: 'Arial',
  fallback: ['system-ui', 'sans-serif'],
})

/** JetBrains Mono — labels, dates, numerics. The design loads 400 and 500 only. */
export const mono = localFont({
  src: '../public/fonts/jetbrains-mono-latin.woff2',
  weight: '400 500',
  style: 'normal',
  variable: '--font-mono',
  display: 'swap',
  adjustFontFallback: 'Arial',
  fallback: ['ui-monospace', 'monospace'],
})

/** Applied to <html> so `--font-display`, `--font-body` and `--font-mono` are
 *  live for every descendant. This rule is unlayered, so it beats the layered
 *  fallback stacks in `globals.css`. */
export const fontVariables = `${display.variable} ${body.variable} ${mono.variable}`
