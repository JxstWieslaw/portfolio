/**
 * Per-formation configuration for the decorative canvas layer.
 *
 * Source of truth: `docs/Portfolio Design/Home.dc.html` (the `cfg` table inside
 * `paint()`), transcribed in `docs/design-extraction/design-home.md` § 13
 * "Formation config (verbatim)". Governed by
 * `docs/superpowers/specs/2026-08-16-design-system-reconciliation.md` § 5.
 *
 * These are *viewport-framed* values. `design-foundations.md` § 4.3 lists a
 * second, card-framed `cfg` for the poster gallery in `Foundations.dc.html`
 * (different `cx`/`cy`/`scale`, no `vig`). That table is NOT the one the page
 * uses; do not merge them.
 *
 * Every number here is measured, not chosen. Change the extraction first.
 */

/** The seven formations. `badge` is dead — see reconciliation § 5 / OD-2. */
export const FORMATION_IDS = [
  'monolith',
  'stream',
  'lattice',
  'orbit',
  'scatter',
  'grid',
  'ring',
] as const

export type FormationId = (typeof FORMATION_IDS)[number]

export interface FormationConfig {
  /** Instance count. Ignored by `lattice` (48x26 plane) and `grid` (13³ lattice). */
  readonly n: number
  /** `'h'` scales against viewport height; `'min'` against `min(W, H)`. */
  readonly fit: 'h' | 'min'
  /**
   * Present verbatim in the export on `monolith` only. The renderer never reads
   * it — the sticky viewport-height backdrop already provides the framing this
   * flag described. Kept so the table matches the source line for line.
   */
  readonly anchor?: 'viewport'
  /** Y-axis rotation, radians. */
  readonly rot: number
  /** X-axis tilt, radians. */
  readonly tilt: number
  /** Object size as a fraction of the fit dimension. */
  readonly scale: number
  /** Framing anchor as a fraction of width / height. */
  readonly cx: number
  readonly cy: number
  /** Bloom multiplier. The halo pass is skipped entirely at or below 0.2. */
  readonly bloom: number
  /** Background radial accent colour and alpha. */
  readonly wash: string
  readonly washA: number
  /** Base cube edge in CSS px, before perspective. */
  readonly size: number
  /** Edge-falloff strength. */
  readonly vig: number
}

export const FORMATIONS: Readonly<Record<FormationId, FormationConfig>> = {
  monolith: { n: 2600, fit: 'h',   anchor: 'viewport', rot: 0.55, tilt: 0.10, scale: 0.30, cx: 0.74, cy: 0.55, bloom: 1.25, wash: '#7C3AED', washA: 0.14, size: 3.4, vig: 0.30 },
  stream:   { n: 1600, fit: 'min', rot: 0.35, tilt: 0.06, scale: 0.30, cx: 0.50, cy: 0.50, bloom: 0.50, wash: '#22D3EE', washA: 0.07, size: 2.4, vig: 0.45 },
  lattice:  { n: 600,  fit: 'min', rot: 0.42, tilt: 0.55, scale: 0.20, cx: 0.50, cy: 0.30, bloom: 0.35, wash: '#7C3AED', washA: 0.07, size: 2.6, vig: 0.55 },
  orbit:    { n: 2400, fit: 'min', rot: 0.30, tilt: 0.30, scale: 0.22, cx: 0.50, cy: 0.50, bloom: 0.90, wash: '#7C3AED', washA: 0.12, size: 2.6, vig: 0.50 },
  scatter:  { n: 2000, fit: 'min', rot: 0.22, tilt: 0.18, scale: 0.26, cx: 0.34, cy: 0.62, bloom: 1.20, wash: '#22D3EE', washA: 0.12, size: 3.2, vig: 0.30 },
  grid:     { n: 1,    fit: 'min', rot: 0.62, tilt: 0.34, scale: 0.22, cx: 0.50, cy: 0.50, bloom: 0.18, wash: '#7C3AED', washA: 0.05, size: 2.4, vig: 0.55 },
  ring:     { n: 2200, fit: 'min', rot: 0.20, tilt: 0.62, scale: 0.24, cx: 0.50, cy: 0.58, bloom: 0.60, wash: '#22D3EE', washA: 0.08, size: 2.5, vig: 0.45 },
}

/**
 * Per-section scrim, verbatim from design-home.md § 13 "Mapping".
 *
 * Hero is a radial anchored at `2% 50%` so the left-aligned glass panel stays
 * readable while the formation (painted at `cx: 0.74`) shows on the right.
 * Craft is the same recipe mirrored to `100% 50%` for its right-anchored panel.
 * The other five are vertical linear washes with per-section stops.
 *
 * The rgba values are `--bg-0` at measured alphas. They are deliberately not
 * `color-mix(… var(--bg-0) …)`: these strings are design measurements and a
 * re-expression is a place for them to drift.
 */
export const SCRIMS: Readonly<Record<FormationId, string>> = {
  monolith: 'radial-gradient(80% 110% at 2% 50%, rgba(13, 17, 23, 0.96) 0%, rgba(13, 17, 23, 0.70) 42%, rgba(13, 17, 23, 0) 76%)',
  stream: 'linear-gradient(180deg, rgba(13, 17, 23, 0.82) 0%, rgba(13, 17, 23, 0.62) 50%, rgba(13, 17, 23, 0.82) 100%)',
  lattice: 'linear-gradient(180deg, rgba(13, 17, 23, 0.90) 0%, rgba(13, 17, 23, 0.80) 30%, rgba(13, 17, 23, 0.92) 100%)',
  orbit: 'linear-gradient(180deg, rgba(13, 17, 23, 0.92) 0%, rgba(13, 17, 23, 0.72) 40%, rgba(13, 17, 23, 0.94) 100%)',
  scatter: 'radial-gradient(70% 100% at 100% 50%, rgba(13, 17, 23, 0.94) 0%, rgba(13, 17, 23, 0.55) 45%, rgba(13, 17, 23, 0) 80%)',
  grid: 'linear-gradient(180deg, rgba(13, 17, 23, 0.94) 0%, rgba(13, 17, 23, 0.86) 50%, rgba(13, 17, 23, 0.94) 100%)',
  ring: 'linear-gradient(180deg, rgba(13, 17, 23, 0.90) 0%, rgba(13, 17, 23, 0.70) 45%, rgba(13, 17, 23, 0.92) 100%)',
}

/**
 * Seven formations, seven sections, 1:1 — reconciliation § 5.
 *
 * `timeline` and `writing` carry NO canvas. They are flat `--bg-0` and
 * `--bg-1`; that pause is the design, not an omission. The M0 plan's
 * nine-section mapping is superseded.
 *
 * Keys are section ids as they appear in the DOM (`hero` has no id — it is
 * targeted through `#main` — but is named here for completeness).
 */
export const SECTION_BACKDROPS: ReadonlyArray<{
  readonly section: string
  readonly formation: FormationId | null
  /** The flat token used when `formation` is null. */
  readonly flat?: '--bg-0' | '--bg-1'
}> = [
  { section: 'hero', formation: 'monolith' },
  { section: 'proof', formation: 'stream' },
  { section: 'work', formation: 'lattice' },
  { section: 'lead', formation: 'orbit' },
  { section: 'craft', formation: 'scatter' },
  { section: 'stack', formation: 'grid' },
  { section: 'timeline', formation: null, flat: '--bg-0' },
  { section: 'writing', formation: null, flat: '--bg-1' },
  { section: 'contact', formation: 'ring' },
]

/**
 * Ultrawide handling — reconciliation § 3.5 / spec § 4.4.
 *
 * Above 2.2 aspect the formation's horizontal spread scales x1.4 instead of the
 * camera pulling back, so instances stay their readable size on 21:9 and 32:9
 * rather than shrinking into the extra width. Applied at paint time from the
 * canvas bitmap's own aspect — deliberately not a media query, because the
 * canvas box is what matters, not the viewport.
 */
export const ULTRAWIDE_ASPECT = 2.2
export const ULTRAWIDE_SPREAD_X = 1.4

export function spreadXFor(width: number, height: number): number {
  if (height <= 0) return 1
  return width / height > ULTRAWIDE_ASPECT ? ULTRAWIDE_SPREAD_X : 1
}

/** `#7C3AED` -> `[124, 58, 237]`. Mirrors the export's `parseInt(slice)` triple. */
export function hexToRgb(hex: string): readonly [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ]
}

/**
 * Rung 5 of the fallback ladder — the section's radial accent wash alone, in
 * pure CSS. Sits under the canvas at all times so that when the canvas cannot
 * paint, nothing moves and nothing goes flat.
 *
 * Matches the canvas's first two fills: `--bg-0` ground plus a radial in the
 * formation's wash colour anchored on its framing point.
 */
export function washCss(kind: FormationId): string {
  const cfg = FORMATIONS[kind]
  const [r, g, b] = hexToRgb(cfg.wash)
  const x = Math.round(cfg.cx * 100)
  const y = Math.round(cfg.cy * 100)
  return `radial-gradient(75% 75% at ${x}% ${y}%, rgba(${r}, ${g}, ${b}, ${cfg.washA}) 0%, rgba(13, 17, 23, 0) 100%), var(--bg-0)`
}
