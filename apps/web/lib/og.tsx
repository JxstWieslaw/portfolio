import { ImageResponse } from 'next/og'

/**
 * The share image for a deep route: the site's dark ground with a violet-to-cyan glow, the
 * route's name in large type and a few tags. Colours are the tokens in `app/globals.css`
 * (`--bg-0`, `--fg-0`, `--fg-2`, `--violet-300`, `--cyan-300`) written out, because an image
 * has no stylesheet to read them from.
 *
 * Rendered at build time for every static route, so it costs nothing at request time. The font is
 * the renderer's built-in sans: loading Bricolage here would mean reading font files at build
 * for a 1200x630 thumbnail.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const
export const OG_CONTENT_TYPE = 'image/png'

export type OgCardInput = {
  /** Small uppercase line above the title: the route's kind. */
  readonly eyebrow: string
  readonly title: string
  readonly subtitle?: string
  readonly tags?: readonly string[]
}

/** Keeps long titles inside the card; the real title is always on the page itself. */
function titleSize(title: string): number {
  if (title.length > 48) return 56
  if (title.length > 28) return 72
  return 88
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

export function ogCard({ eyebrow, title, subtitle, tags = [] }: OgCardInput): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          color: '#F0F6FC',
          backgroundColor: '#0D1117',
          backgroundImage:
            'radial-gradient(circle at 12% 0%, rgba(124,58,237,0.45), rgba(13,17,23,0) 55%), radial-gradient(circle at 100% 100%, rgba(34,211,238,0.22), rgba(13,17,23,0) 50%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 26,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: '#C4B5FD',
          }}
        >
          {eyebrow}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize(title),
              lineHeight: 1.05,
              fontWeight: 700,
              letterSpacing: -2,
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div style={{ display: 'flex', fontSize: 32, lineHeight: 1.35, color: '#8B949E', maxWidth: 940 }}>
              {clip(subtitle, 150)}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 12 }}>
            {tags.slice(0, 5).map((tag) => (
              <div
                key={tag}
                style={{
                  display: 'flex',
                  fontSize: 24,
                  color: '#67E8F9',
                  border: '1px solid rgba(103,232,249,0.4)',
                  borderRadius: 8,
                  padding: '6px 14px',
                }}
              >
                {tag}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', fontSize: 26, color: '#8B949E' }}>Wieslaw Samushonga</div>
        </div>
      </div>
    ),
    { ...OG_SIZE },
  )
}
