import type { MetadataRoute } from 'next'

/**
 * The web app manifest. Colours are the globals.css tokens `--bg-0` and `--violet-500`, repeated because a manifest
 * is JSON and cannot read CSS custom properties. Icons are rendered from the nav monogram by
 * `scripts/brand/render-icons.ts`; the maskable one keeps its glyphs inside the central 60% so any platform mask
 * leaves them intact.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Wieslaw Samushonga — Portfolio',
    short_name: 'Wieslaw',
    description: 'Tech Lead and Software Engineer. Production software and real-time 3D on the web.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0D1117',
    theme_color: '#0D1117',
    lang: 'en-GB',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
