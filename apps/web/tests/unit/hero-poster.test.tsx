import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { HeroPoster } from '@/components/three/HeroPoster'
import type { PosterEntry, PosterManifest } from '@/lib/hero/posters'

const file = (name: string) => ({ file: name, bytes: 1000, sha256: 'a'.repeat(64) })
const entry = (state: PosterEntry['state'], orientation: PosterEntry['orientation']): PosterEntry => {
  const [width, height] = orientation === 'portrait' ? [780, 1688] : [2160, 1350]
  return { state, orientation, width, height, avif: file(`hero-${orientation}-${state}.aaaaaaaa.avif`), webp: file(`hero-${orientation}-${state}.aaaaaaaa.webp`) }
}
const manifest: PosterManifest = {
  pipeline: 1,
  inputsHash: '0'.repeat(16),
  renderedWith: { chromium: 'x', sharp: 'x', playwright: 'x' },
  posters: (['full', 'mid', 'dust'] as const).flatMap((s) => (['portrait', 'landscape'] as const).map((o) => entry(s, o))),
  og: { ...file('hero.aaaaaaaa.png'), width: 1200, height: 630 },
}

const html = (mode: 'on' | 'off'): string => renderToStaticMarkup(<HeroPoster mode={mode} manifest={manifest} />)
const img = (out: string, cls: string): string => (out.match(new RegExp(`<img [^>]*${cls}[^>]*>`)) ?? [''])[0]

describe('HeroPoster', () => {
  it('is decorative: hidden from assistive technology, empty alt on every image', () => {
    const out = html('on')
    expect(out).toContain('aria-hidden="true"')
    const imgs = out.match(/<img [^>]*>/g) ?? []
    expect(imgs.length).toBeGreaterThanOrEqual(3)
    for (const tag of imgs) expect(tag).toContain('alt=""')
  })

  it('serves AVIF then WebP for each orientation, from the content-hashed URLs', () => {
    const out = html('on')
    for (const o of ['portrait', 'landscape']) {
      const avif = out.indexOf(`type="image/avif" media="(orientation: ${o})" srcSet="/posters/hero-${o}-full.aaaaaaaa.avif"`)
      const webp = out.indexOf(`type="image/webp" media="(orientation: ${o})" srcSet="/posters/hero-${o}-full.aaaaaaaa.webp"`)
      expect(avif).toBeGreaterThan(-1)
      expect(webp).toBeGreaterThan(avif)
    }
  })

  it('gives the full still intrinsic width and height, so the ratio is known before decode', () => {
    const full = img(html('on'), 'hero-poster-full')
    expect(full).toContain('width="780"')
    expect(full).toContain('height="1688"')
    expect(full).toContain('decoding="async"')
    expect(full).toContain('fetchPriority="low"')
  })

  it('is eager and has a noscript still where the monolith is the default', () => {
    const out = html('on')
    expect(out).toContain('<noscript><img ')
    expect(img(out, 'hero-poster-full')).toContain('loading="eager"')
  })

  it('is lazy, and has no noscript still, where the monolith is not the default', () => {
    const out = html('off')
    expect(out).not.toContain('<noscript')
    expect(img(out, 'hero-poster-full')).toContain('loading="lazy"')
  })

  it('never makes the scroll-floor stills eager, in either mode', () => {
    for (const mode of ['on', 'off'] as const) {
      for (const state of ['mid', 'dust']) expect(img(html(mode), `hero-poster-${state}`)).toContain('loading="lazy"')
    }
  })

  it('fails loudly, not silently, when the manifest lacks a still', () => {
    const broken = { ...manifest, posters: manifest.posters.filter((p) => p.state !== 'dust') }
    expect(() => renderToStaticMarkup(<HeroPoster mode="on" manifest={broken} />)).toThrow(/dust\/portrait is missing/)
  })
})
