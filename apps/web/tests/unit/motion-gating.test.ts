import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Hover motion belongs to hover-capable devices, and the one new scroll-driven
 * motion belongs to people who have not asked for less. Both are properties of
 * the stylesheet, so they are asserted on its text: a hover rule added later
 * outside `@media (hover: hover)` fails here instead of sticking on a phone.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const globalsCss = readFileSync(join(root, 'app', 'globals.css'), 'utf8')
const heroSource = readFileSync(join(root, 'components', 'sections', 'Hero.tsx'), 'utf8')

/** Removes every brace-balanced block that follows `marker`, keeping the rest. */
function withoutBlocks(source: string, marker: string): string {
  let out = ''
  let cursor = 0
  for (;;) {
    const at = source.indexOf(marker, cursor)
    if (at === -1) return out + source.slice(cursor)
    out += source.slice(cursor, at)
    const open = source.indexOf('{', at)
    let depth = 0
    let end = open
    for (let i = open; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1
      else if (source[i] === '}') {
        depth -= 1
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    cursor = end + 1
  }
}

/** Strips comments so prose that mentions `:hover` is not mistaken for a rule. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('hover rules are gated on (hover: hover)', () => {
  it('leaves no bare :hover in globals.css outside a (hover: hover) block', () => {
    const rest = withoutBlocks(withoutComments(globalsCss), '@media (hover: hover)')
    expect(rest).not.toMatch(/:hover\b/)
  })

  it('still ships the hover rules, so the gate is not satisfied by deleting them', () => {
    const gated = withoutComments(globalsCss).match(/@media \(hover: hover\)/g) ?? []
    expect(gated.length).toBeGreaterThanOrEqual(9)
  })

  it('keeps a keyboard peer: focus-visible still carries every shift', () => {
    const css = withoutComments(globalsCss)
    expect(css).toContain(
      "&[data-variant='secondary']:not(:disabled):not([aria-disabled='true']):focus-visible"
    )
    expect(css).toContain("&[data-glow='cyan']:focus-visible")
    expect(css).toContain("&[data-interactive='true']:focus-within")
  })

  it('gates the hero scroll cue hover and keeps its focus peer', () => {
    const rest = withoutBlocks(heroSource, '@media (hover: hover)')
    expect(rest).not.toMatch(/\.hero-cue:hover/)
    expect(heroSource).toContain('.hero-cue:focus-visible')
  })
})

describe('the section heading reveal', () => {
  const css = withoutComments(globalsCss)

  it('exists only under @supports and prefers-reduced-motion: no-preference', () => {
    const supportsAt = css.indexOf('@supports (animation-timeline: view())')
    expect(supportsAt).toBeGreaterThan(-1)
    const reducedAt = css.indexOf('@media (prefers-reduced-motion: no-preference)', supportsAt)
    expect(reducedAt).toBeGreaterThan(supportsAt)
    const useAt = css.indexOf('animation-timeline: view()', reducedAt)
    expect(useAt).toBeGreaterThan(reducedAt)

    // The only place the timeline is applied.
    expect(css.match(/animation-timeline: view\(\);/g)).toHaveLength(1)
  })

  it('plays from the clipped state only, so the base heading stays visible', () => {
    expect(css).toContain('animation: heading-unmask var(--ease) backwards;')
  })

  it('targets section headings and never the hero h1', () => {
    expect(css).toContain('.section-head-title h2')
    expect(css).not.toMatch(/animation-timeline[^}]*h1/)
    expect(heroSource).not.toContain('heading-unmask')
  })

  it('animates only clip-path and translate', () => {
    const at = css.indexOf('@keyframes heading-unmask')
    expect(at).toBeGreaterThan(-1)
    const rest = withoutBlocks(css.slice(at), '@keyframes heading-unmask')
    // Everything the keyframes block held is what was removed from the slice.
    const body = css.slice(at, css.length - rest.length)
    const properties = Array.from(body.matchAll(/([a-z-]+)\s*:/g)).map((match) => match[1])
    expect(new Set(properties)).toEqual(new Set(['clip-path', 'translate']))
  })
})
