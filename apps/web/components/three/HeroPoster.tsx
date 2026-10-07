import { buildHeroMode, type HeroMode } from '@/lib/hero/mode'
import { findPoster, posterManifest, posterUrl, type PosterEntry, type PosterManifest, type PosterOrientation, type PosterState } from '@/lib/hero/posters'

export interface HeroPosterProps {
  /** What the build says. Defaults to `buildHeroMode()`; a visit's `?hero=` is applied by CSS on `html[data-hero-mode]`. */
  readonly mode?: HeroMode
  readonly manifest?: PosterManifest
}

const ORIENTATIONS: readonly PosterOrientation[] = ['portrait', 'landscape']
const MEDIA: Record<PosterOrientation, string> = { portrait: '(orientation: portrait)', landscape: '(orientation: landscape)' }

/** One state as a `<picture>`: AVIF then WebP for the visitor's orientation. Intrinsic width and height keep the ratio before decode. */
function Picture({
  manifest,
  state,
  lazy,
  priority,
  className,
}: {
  readonly manifest: PosterManifest
  readonly state: PosterState
  readonly lazy: boolean
  readonly priority: 'low' | 'auto'
  readonly className: string
}) {
  const entries = ORIENTATIONS.map((o) => findPoster(manifest, state, o))
  // The `<img>` is the fallback for a browser that matches no `<source>`; portrait is the narrower, cheaper file.
  const fallback = entries[0] as PosterEntry
  return (
    <picture>
      {entries.flatMap((e) => [
        <source key={`${e.orientation}-avif`} type="image/avif" media={MEDIA[e.orientation]} srcSet={posterUrl(e.avif.file)} />,
        <source key={`${e.orientation}-webp`} type="image/webp" media={MEDIA[e.orientation]} srcSet={posterUrl(e.webp.file)} />,
      ])}
      <img
        className={className}
        src={posterUrl(fallback.webp.file)}
        width={fallback.width}
        height={fallback.height}
        alt=""
        decoding="async"
        loading={lazy ? 'lazy' : 'eager'}
        fetchPriority={priority}
      />
    </picture>
  )
}

/**
 * The hero's still — hero monolith spec § 7. A render of the live engine, so the cross-fade to the first live frame
 * is between two pictures of the same thing. It is the L0 tier: what the visitor sees with reduced motion, Save-Data,
 * no WebGL2, `?nogl=1`, JavaScript off, a lost context or a governor that gave up.
 *
 * Server component, no client code. It is always in the markup and shown by CSS only while `html[data-hero-mode='on']`
 * (see `globals.css`), so a visit's `?hero=a` or `?hero=off` needs no rerender. In a build where the monolith is the
 * default the image is eager and the `<noscript>` copy exists; otherwise it is lazy inside a `display: none` box, which
 * the browser does not fetch, so the default page pays nothing for it.
 *
 * Out of flow (`position: fixed; inset: 0`, clipped to the hero section), so it cannot move a pixel of content:
 * the `<img>` has intrinsic `width` and `height`, and the box it fills is the section's, not its own.
 *
 * The `mid` and `dust` stills are the scroll floor: shown, and cross-faded by scroll, only when the poster is what the
 * page has (`html[data-hero='poster']`), a browser supports scroll-driven animation and motion is allowed. They are
 * `loading="lazy"` in a `display: none` box until then, so nobody who gets the live engine downloads them.
 */
export function HeroPoster({ mode = buildHeroMode(), manifest = posterManifest }: HeroPosterProps) {
  const fallback = findPoster(manifest, 'full', 'portrait')
  const eager = mode === 'on'
  return (
    <div aria-hidden="true" data-hero-poster="" className="hero-poster">
      {eager ? (
        // Picture-less browsers and readers that ignore <source> still get the still; it sits under the <picture> so it is never doubled.
        <noscript>
          {/* eslint-disable-next-line @next/next/no-img-element -- a decorative still behind <noscript>; next/image needs JavaScript */}
          <img className="hero-poster-img" src={posterUrl(fallback.webp.file)} width={fallback.width} height={fallback.height} alt="" />
        </noscript>
      ) : null}
      <Picture manifest={manifest} state="full" lazy={!eager} priority="low" className="hero-poster-img hero-poster-full" />
      <div data-hero-poster-floor="" className="hero-poster-floor">
        <Picture manifest={manifest} state="mid" lazy priority="low" className="hero-poster-img hero-poster-mid" />
        <Picture manifest={manifest} state="dust" lazy priority="low" className="hero-poster-img hero-poster-dust" />
      </div>
    </div>
  )
}
