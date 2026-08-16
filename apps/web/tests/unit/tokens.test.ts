import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The token layer is the one thing in this codebase that nothing else can
 * catch drifting: a brand hex or a `wdth` axis can be wrong by one digit and
 * every test still passes while the site looks subtly off. So these assertions
 * read the source files as text and hold them against the extraction.
 *
 * If one fails, the CSS is wrong — never the expectation. Change
 * `docs/superpowers/specs/2026-08-16-design-system-reconciliation.md` first.
 */
// jsdom replaces the global URL class, which node:fs will not accept, so the
// paths are resolved through node:path instead of `new URL(…, import.meta.url)`.
const appDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app')
const css = readFileSync(join(appDir, 'globals.css'), 'utf8')
const fonts = readFileSync(join(appDir, 'fonts.ts'), 'utf8')

/** Collects every declared value for each custom property, in source order. */
function declaredValues(source: string): Map<string, string[]> {
  const found = new Map<string, string[]>()
  for (const match of source.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+);/gi)) {
    const name = match[1]
    const value = match[2]
    if (name === undefined || value === undefined) continue
    const normalised = value.replace(/\s+/g, ' ').trim()
    const existing = found.get(name)
    if (existing) existing.push(normalised)
    else found.set(name, [normalised])
  }
  return found
}

/** Returns the body of the first brace-balanced block following `marker`. */
function blockAfter(source: string, marker: string): string {
  const at = source.indexOf(marker)
  if (at === -1) throw new Error(`marker not found: ${marker}`)
  const open = source.indexOf('{', at)
  if (open === -1) throw new Error(`no block opens after: ${marker}`)
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    const char = source[i]
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  throw new Error(`unbalanced block after: ${marker}`)
}

const tokens = declaredValues(css)

/** design-foundations.md § 6 — the verbatim `:root` export. */
const EXPORTED_TOKENS: Record<string, string> = {
  '--bg-0': '#0D1117',
  '--bg-1': '#11161D',
  '--bg-2': '#161B22',
  '--line-1': '#1F2937',
  '--line-2': '#30363D',
  '--fg-0': '#F0F6FC',
  '--fg-1': '#C9D1D9',
  '--fg-2': '#8B949E',
  '--fg-3': '#6E7681',
  '--violet-500': '#7C3AED',
  '--violet-400': '#A78BFA',
  '--violet-300': '#C4B5FD',
  '--cyan-400': '#22D3EE',
  '--cyan-300': '#67E8F9',
  '--gradient': 'linear-gradient(90deg, #7C3AED 0%, #22D3EE 100%)',
  '--success': '#3FB950',
  '--warning': '#D29922',
  '--danger': '#F85149',
  '--glass-bg': 'rgba(17, 22, 29, .72)',
  '--glass-blur': '12px',
  '--glass-highlight': 'rgba(255, 255, 255, .06)',
  '--glow-violet': '0 0 24px rgba(124, 58, 237, .20)',
  '--glow-cyan': '0 0 24px rgba(34, 211, 238, .20)',
  '--font-display': "'Bricolage Grotesque', sans-serif",
  '--font-body': 'Geist, system-ui, sans-serif',
  '--font-mono': "'JetBrains Mono', ui-monospace, monospace",
  '--display-1': 'clamp(2.75rem, 1.5rem + 5vw, 6.5rem)',
  '--display-2': 'clamp(2rem, 1.2rem + 3vw, 4rem)',
  '--h2': 'clamp(1.75rem, 1.3rem + 1.6vw, 2.75rem)',
  '--h3': '1.375rem',
  '--body-lg': '1.125rem',
  '--body': '1rem',
  '--small': '.875rem',
  '--label': '.75rem',
  '--s-1': '4px',
  '--s-2': '8px',
  '--s-3': '12px',
  '--s-4': '16px',
  '--s-5': '24px',
  '--s-6': '32px',
  '--s-7': '48px',
  '--s-8': '64px',
  '--s-9': '96px',
  '--s-10': '128px',
  '--s-11': '192px',
  '--section-y': 'clamp(4rem, 10vw, 10rem)',
  '--page-x': 'clamp(1rem, 4vw, 4rem)',
  '--max-content': '1440px',
  '--max-bento': '1600px',
  '--r-chip': '6px',
  '--r-card': '12px',
  '--r-panel': '20px',
  '--r-pill': '999px',
  '--d-1': '120ms',
  '--d-2': '200ms',
  '--d-3': '320ms',
  '--d-4': '560ms',
  '--ease': 'cubic-bezier(.2, .8, .2, 1)',
  '--focus': '0 0 0 2px var(--bg-0), 0 0 0 4px var(--cyan-400)',
}

/** Additions mandated by reconciliation § 2 and § 3.1. */
const RECONCILED_TOKENS: Record<string, string> = {
  '--display-hero': 'clamp(2.75rem, 1.5rem + 3.6vw, 4.75rem)',
  '--d-crossfade': '200ms',
  '--fuchsia-400': '#E879F9',
  '--accent-emerald': '#6EE7B7',
  '--accent-amber': '#FCD34D',
  '--accent-fuchsia': '#F0ABFC',
  '--accent-iris': '#C4B5FD',
  '--accent-cyan': '#67E8F9',
  '--accent-violet': '#A78BFA',
  '--bp-xs': '360px',
  '--bp-sm': '640px',
  '--bp-md': '768px',
  '--bp-lg': '1024px',
  '--bp-xl': '1280px',
  '--bp-2xl': '1536px',
  '--bp-3xl': '1920px',
  '--bp-4xl': '2560px',
}

/** reconciliation § 4 — per-level Bricolage axis settings, all weight 600. */
const DISPLAY_LEVELS: Array<[utility: string, axes: string]> = [
  ['type-display-1', "'wdth' 88, 'opsz' 96"],
  ['type-display-hero', "'wdth' 88, 'opsz' 96"],
  ['type-display-2', "'wdth' 90"],
  ['type-bento-large', "'wdth' 92"],
  ['type-h2', "'wdth' 95"],
  ['type-bento-standard', "'wdth' 96"],
  ['type-writing-h3', "'wdth' 98"],
  ['type-h3', "'wdth' 100"],
  ['type-monogram', "'wdth' 90"],
]

describe('globals.css — the design-foundations token export', () => {
  it.each(Object.entries(EXPORTED_TOKENS))('declares %s as %s', (name, value) => {
    expect(tokens.get(name) ?? []).toContain(value)
  })
})

describe('globals.css — reconciliation §2 / §3.1 corrections', () => {
  it.each(Object.entries(RECONCILED_TOKENS))('declares %s as %s', (name, value) => {
    expect(tokens.get(name) ?? []).toContain(value)
  })

  it('declares --gutter as 16px with a single 24px breakpoint override', () => {
    expect(tokens.get('--gutter')).toEqual(['16px', '24px'])
    expect(blockAfter(css, '@media (width >= 768px)')).toContain('--gutter: 24px')
  })

  it('keeps --d-crossfade outside the reduced-motion override', () => {
    const reducedMotion = blockAfter(css, '@media (prefers-reduced-motion: reduce)')
    expect(reducedMotion).toContain('--d-1: 1ms')
    expect(reducedMotion).toContain('--d-2: 1ms')
    expect(reducedMotion).toContain('--d-3: 1ms')
    expect(reducedMotion).toContain('--d-4: 1ms')
    expect(reducedMotion).not.toContain('--d-crossfade')
  })

  it('inherits the focus-ring radius instead of pinning it to 6px', () => {
    const focus = blockAfter(css, ':focus-visible')
    expect(focus).toContain('outline: 2px solid var(--cyan-400)')
    expect(focus).toContain('outline-offset: 2px')
    expect(focus).toContain('border-radius: inherit')
    expect(focus).not.toMatch(/border-radius:\s*\d/)
  })
})

describe('globals.css — base layer', () => {
  it('paints the selection in violet on heading white', () => {
    const selection = blockAfter(css, '::selection')
    expect(selection).toContain('background: var(--violet-500)')
    expect(selection).toContain('color: var(--fg-0)')
  })

  it('sets the documented body rhythm and smoothing', () => {
    const body = blockAfter(css, 'Document base')
    expect(body).toContain('font-size: 16px')
    expect(body).toContain('line-height: 1.65')
    expect(body).toContain('-webkit-font-smoothing: antialiased')
  })

  it('balances display headings and prettifies body copy', () => {
    expect(css).toMatch(/h1,\s*\n?\s*h2,[\s\S]*?text-wrap: balance/)
    expect(css).toMatch(/p,\s*\n?\s*li,[\s\S]*?text-wrap: pretty/)
  })
})

describe('globals.css — display typography (reconciliation §4)', () => {
  it.each(DISPLAY_LEVELS)('sets %s to font-variation-settings: %s at weight 600', (utility, axes) => {
    const level = blockAfter(css, `@utility ${utility} {`)
    expect(level).toContain(`font-variation-settings: ${axes};`)
    expect(level).toContain('font-weight: 600')
    expect(level).toContain('font-family: var(--font-display)')
  })
})

describe('fonts.ts — variable-axis configuration', () => {
  const bricolage = blockAfter(fonts, 'Bricolage_Grotesque(')

  it('never pins a weight array on Bricolage Grotesque', () => {
    // A `weight` key collapses the variable axes, and `wdth` is load-bearing.
    expect(bricolage).not.toMatch(/\bweight\b/)
  })

  it('requests the opsz and wdth axes', () => {
    expect(bricolage).toMatch(/axes:\s*\['opsz',\s*'wdth'\]/)
  })

  it.each(['--font-display', '--font-body', '--font-mono'])('exposes %s', (variable) => {
    expect(fonts).toContain(`variable: '${variable}'`)
  })

  it('self-hosts all three families through next/font', () => {
    expect(fonts).toContain("from 'next/font/google'")
    expect(fonts.match(/display: 'swap'/g) ?? []).toHaveLength(3)
  })
})
