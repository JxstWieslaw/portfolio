import type { CSSProperties } from 'react'

/**
 * Brand tints — a presentation concern, deliberately kept out of the shared
 * contract.
 *
 * Reconciliation § 2 / OD-2: `packages/contracts` carries only the *semantic*
 * accent pair (`violet` = leadership and architecture, `cyan` = craft and
 * motion). The six identity tints below would otherwise push brand hex values
 * into a schema the API and third parties consume, coupling every palette
 * tweak to a contract change. They live here instead, and only here.
 *
 * Every tint resolves to a token declared in `app/globals.css`; nothing in
 * this file is a literal colour.
 */

export type Tone =
  /** `--accent-violet` #A78BFA — leadership, architecture, section eyebrows. */
  | 'violet'
  /** `--accent-cyan` #67E8F9 — craft, 3D, motion. */
  | 'cyan'
  /** `--accent-emerald` #6EE7B7 */
  | 'emerald'
  /** `--accent-amber` #FCD34D */
  | 'amber'
  /** `--accent-fuchsia` #F0ABFC */
  | 'fuchsia'
  /** `--accent-iris` #C4B5FD */
  | 'iris'
  /** `--violet-500` #7C3AED — the saturated bullet glyph, not a tint. */
  | 'violet-500'
  /** `--cyan-400` #22D3EE — the saturated craft eyebrow and glow border. */
  | 'cyan-400'
  /** `--fuchsia-400` #E879F9 — the canvas ramp's middle stop. */
  | 'fuchsia-400'
  /** `--fg-2` #8B949E — the neutral, muted default. */
  | 'muted'
  /** `--line-2` #30363D — the timeline's `—` glyph. */
  | 'line'

const TONE_VARIABLE: Record<Tone, string> = {
  violet: 'var(--accent-violet)',
  cyan: 'var(--accent-cyan)',
  emerald: 'var(--accent-emerald)',
  amber: 'var(--accent-amber)',
  fuchsia: 'var(--accent-fuchsia)',
  iris: 'var(--accent-iris)',
  'violet-500': 'var(--violet-500)',
  'cyan-400': 'var(--cyan-400)',
  'fuchsia-400': 'var(--fuchsia-400)',
  muted: 'var(--fg-2)',
  line: 'var(--line-2)',
}

/** The `var(--…)` reference a tone resolves to. Never a raw hex. */
export function toneVar(tone: Tone): string {
  return TONE_VARIABLE[tone]
}

/**
 * `domain.id` → brand tint, verbatim from design-home.md § 4 "Domain chip row".
 * Two pairs share a hue on purpose: education and procurement/ERP are both
 * amber, creator-economy and AR/XR are both fuchsia.
 */
export const DOMAIN_TONES = {
  healthcare: 'emerald',
  education: 'amber',
  'creator-economy': 'fuchsia',
  'procurement-erp': 'amber',
  'social-services': 'iris',
  'developer-tooling': 'cyan',
  'interactive-3d': 'cyan',
  'ar-xr': 'fuchsia',
} as const satisfies Record<string, Tone>

export type DomainId = keyof typeof DOMAIN_TONES

/** The literal hex each domain renders as, for tests and documentation. */
export const DOMAIN_TINTS: Record<DomainId, string> = {
  healthcare: '#6EE7B7',
  education: '#FCD34D',
  'creator-economy': '#F0ABFC',
  'procurement-erp': '#FCD34D',
  'social-services': '#C4B5FD',
  'developer-tooling': '#67E8F9',
  'interactive-3d': '#67E8F9',
  'ar-xr': '#F0ABFC',
}

/**
 * Content ids arrive as plain strings from `content/domains.json`, so an
 * unknown id must not throw or render an unstyled chip — it falls back to
 * violet, the leadership accent.
 */
export function accentForDomain(domainId: string): Tone {
  const tones: Record<string, Tone> = DOMAIN_TONES
  return tones[domainId] ?? 'violet'
}

/**
 * Builds the inline custom-property declaration a component uses to hand its
 * tint to the stylesheet. React's `CSSProperties` has no index signature for
 * custom properties, so the assertion is made once, here, rather than at every
 * call site.
 */
export function toneStyle(
  property: `--${string}`,
  tone: Tone | undefined
): CSSProperties | undefined {
  if (tone === undefined) return undefined
  return { [property]: toneVar(tone) } as CSSProperties
}
