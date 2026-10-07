import { afterEach, describe, expect, it, vi } from 'vitest'

import { heroFlagOn } from '@/lib/hero/gate'
import { buildHeroMode, HERO_DEFAULT_ON, HERO_MODE_SCRIPT, heroModeFor, type HeroMode } from '@/lib/hero/mode'

afterEach(() => {
  vi.unstubAllEnvs()
  document.documentElement.removeAttribute('data-hero-mode')
  window.history.replaceState({}, '', '/')
})

describe('the hero mode: one constant, one env switch, one query string', () => {
  it('is off by default in this slice: S3 flips HERO_DEFAULT_ON, nothing else does', () => {
    expect(HERO_DEFAULT_ON).toBe(false)
    expect(buildHeroMode(undefined)).toBe('off')
    expect(buildHeroMode('')).toBe('off')
    expect(heroFlagOn('')).toBe(false)
  })

  it('takes the build switch: monolith is on, off is off, anything else is the default', () => {
    expect(buildHeroMode('monolith')).toBe('on')
    expect(buildHeroMode('off')).toBe('off')
    expect(buildHeroMode('yes')).toBe('off')
    vi.stubEnv('NEXT_PUBLIC_HERO', 'monolith')
    expect(buildHeroMode()).toBe('on')
    expect(heroFlagOn('')).toBe(true)
  })

  it('lets the query string beat the build in both directions', () => {
    expect(heroModeFor('?hero=a', 'off')).toBe('on')
    expect(heroModeFor('?hero=off', 'on')).toBe('off')
    expect(heroModeFor('?hero=off', 'off')).toBe('off')
    expect(heroModeFor('?x=1&hero=a&perf=1', 'off')).toBe('on')
    vi.stubEnv('NEXT_PUBLIC_HERO', 'monolith')
    expect(heroFlagOn('?hero=off')).toBe(false)
  })

  it('ignores anything that is not exactly the two values', () => {
    for (const search of ['', '?', '?hero=', '?hero=b', '?hero=aa', '?hero=off1', '?xhero=a', '?hero=A', '?hero=a%20', '?hero%3Da']) {
      expect(heroModeFor(search, 'off'), search).toBe('off')
      expect(heroModeFor(search, 'on'), search).toBe('on')
    }
  })

  it('off wins over a, whatever the order, and the first a still wins over a stray value', () => {
    for (const build of ['on', 'off'] as const) {
      expect(heroModeFor('?hero=a&hero=off', build)).toBe('off')
      expect(heroModeFor('?hero=off&hero=a', build)).toBe('off')
      expect(heroModeFor('?hero=b&hero=a', 'off')).toBe('on')
    }
  })

  it('the pre-paint script agrees with heroModeFor on every case, including repeated parameters', () => {
    const searches = ['', '?hero=a', '?hero=off', '?hero=b', '?hero=b&hero=a', '?hero=a&hero=off', '?hero=off&hero=a', '?a=1&hero=a', '?hero=a&x', '?x&hero=off&y=2', '?hero=', '?xhero=a']
    for (const build of ['on', 'off'] as const satisfies readonly HeroMode[]) {
      for (const search of searches) {
        window.history.replaceState({}, '', `/${search}`)
        document.documentElement.setAttribute('data-hero-mode', build)
        new Function(HERO_MODE_SCRIPT)()
        expect(document.documentElement.getAttribute('data-hero-mode'), `${build} ${search}`).toBe(heroModeFor(search, build))
      }
    }
  })

  it('the pre-paint script is small and never throws', () => {
    expect(HERO_MODE_SCRIPT.length).toBeLessThan(220)
    expect(() => new Function(HERO_MODE_SCRIPT)()).not.toThrow()
  })
})
