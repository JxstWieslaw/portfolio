/**
 * Renders the site's icons and the always-present link-preview card from the brand mark.
 *
 * The mark is the nav monogram ("WS" in an outlined box, `components/ui/Monogram.tsx`) drawn as strokes, so the
 * output does not depend on which fonts the machine rendering it has. Colours are the globals.css tokens
 * (--bg-0, --bg-2, --violet-400, --violet-300, --fg-0, --fg-2); they are repeated here because an SVG file cannot
 * read CSS custom properties.
 *
 * Run: npx tsx scripts/brand/render-icons.ts   (from apps/web). Output is committed; this is not a build step.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const out = (...parts: string[]) => resolve(root, ...parts)

const BG = '#0D1117'
const BORDER = '#A78BFA'
const GLYPH = '#C4B5FD'

/** "WS" as round-capped strokes on a 64 unit grid, centred on 32,33. */
const GLYPHS =
  '<path d="M11 21 L16.5 45 L22 30 L27.5 45 L33 21" />' +
  '<path d="M53 25.5 C53 22.5 50 21 46 21 C42 21 39 23 39 27 C39 31 43 32.5 46 33.5 C49 34.5 53 36 53 40 C53 43.5 50 45 46 45 C42 45 39 43.5 39 40.5" />'

function mark(size: number, opts: { maskable?: boolean } = {}): string {
  const glyphs = `<g fill="none" stroke="${GLYPH}" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round">${GLYPHS}</g>`
  if (opts.maskable) {
    // Full-bleed ground, glyphs inside the central 60% so any platform mask keeps them.
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64"><rect width="64" height="64" fill="${BG}"/><g transform="translate(32 32) scale(0.62) translate(-32 -33)">${glyphs}</g></svg>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64"><rect x="1.5" y="1.5" width="61" height="61" rx="14" fill="${BG}" stroke="${BORDER}" stroke-width="3"/>${glyphs}</svg>`
}

async function png(svg: string, file: string, size: number, opaque = false): Promise<void> {
  mkdirSync(dirname(file), { recursive: true })
  // iOS fills transparent corners with black, so the touch icon is flattened onto the page ground.
  const image = sharp(Buffer.from(svg), { density: 384 }).resize(size, size)
  await (opaque ? image.flatten({ background: BG }) : image).png({ compressionLevel: 9 }).toFile(file)
}

async function main(): Promise<void> {
  writeFileSync(out('app/icon.svg'), mark(64) + '\n')
  await png(mark(64), out('app/icon.png'), 32)
  await png(mark(64), out('app/apple-icon.png'), 180, true)
  await png(mark(64), out('public/icons/icon-192.png'), 192)
  await png(mark(64), out('public/icons/icon-512.png'), 512)
  await png(mark(64, { maskable: true }), out('public/icons/maskable-512.png'), 512)

  // The link-preview card used whenever the hero render is not the build's hero (see app/layout.tsx).
  const card = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="${BG}"/>
<rect x="0" y="0" width="1200" height="630" fill="url(#g)"/>
<defs><radialGradient id="g" cx="82%" cy="12%" r="70%"><stop offset="0" stop-color="#7C3AED" stop-opacity="0.28"/><stop offset="1" stop-color="#7C3AED" stop-opacity="0"/></radialGradient></defs>
<g transform="translate(96 96) scale(2.4)">${mark(64).replace(/<svg[^>]*>/, '').replace('</svg>', '')}</g>
<text x="96" y="400" font-family="Helvetica, Arial, sans-serif" font-size="76" font-weight="700" fill="#F0F6FC">Wieslaw Samushonga</text>
<text x="96" y="470" font-family="Helvetica, Arial, sans-serif" font-size="38" fill="#C9D1D9">Tech Lead and Software Engineer</text>
<text x="96" y="530" font-family="Helvetica, Arial, sans-serif" font-size="28" fill="#8B949E">Production software and real-time 3D on the web</text>
</svg>`
  mkdirSync(out('public/brand'), { recursive: true })
  await sharp(Buffer.from(card)).png({ compressionLevel: 9 }).toFile(out('public/brand/og-default.png'))
}

void main()
