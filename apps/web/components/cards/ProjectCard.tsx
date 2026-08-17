import type { CSSProperties, ReactNode } from 'react'

import { Badge, type BadgeStatus } from '@/components/ui/Badge'
import { Chip } from '@/components/ui/Chip'
import { GlassCard } from '@/components/ui/GlassCard'
import {
  PlaceholderCard,
  PlaceholderGhost,
  PlaceholderText,
} from '@/components/ui/PlaceholderCard'
import { TechTag, TechTagList } from '@/components/ui/TechTag'
import { accentForDomain, toneVar, type Tone } from '@/lib/accent'
import { cx } from '@/lib/cx'

/**
 * A bento card — reconciliation § 6.9, measured in design-home.md § 5.
 *
 * The whole card is one `<a>` (`display:flex; flex-direction:column`) so there
 * is a single hit target and no nested interactives, on
 * `rgba(22,27,34,.78)` with the signature lit `border-top`, `border-radius:20px`
 * (not 12), and a hover that changes **border-colour and box-shadow only** —
 * no transform, no scale.
 *
 * Two size classes, both supplied by `GlassCard`:
 *   large     min-height 340px (from 768 up), padding 32px, h3 2.25rem / wdth 92
 *   standard  padding 28px, h3 1.5rem / wdth 96
 *
 * The AR entry (§ 6.10) is a different component shape entirely: a
 * non-interactive `<div>` with a dashed border, an amber `In preparation`
 * badge, a dotted placeholder name and three empty dashed chip ghosts. It is
 * selected by `placeholder`, not by slug — nothing here knows about AR.
 *
 * Prop-driven by design: this file never imports `lib/content.ts`. The shape
 * below mirrors the `Project` record plus its resolved domain, so `app/page.tsx`
 * can hand it straight through.
 */

export type ProjectVisibility = 'public' | 'private' | 'client'

export type ProjectCardSize = 'large' | 'standard'

/** The project's domain, already resolved from `content/domains.json`. */
export interface ProjectCardDomain {
  /** `domain.id` — keys the brand tint in `lib/accent.ts`. */
  readonly id: string
  readonly label: string
  /**
   * The *semantic* pair the shared contract carries (OD-2). It picks the glow
   * family: cyan-accent cards glow cyan, violet ones glow violet.
   */
  readonly accent: 'violet' | 'cyan'
}

export interface ProjectCardProps {
  readonly slug: string
  readonly name: string
  readonly summary: string
  readonly stack: readonly string[]
  readonly visibility: ProjectVisibility
  readonly domain: ProjectCardDomain
  /** Cards 1–2 of the bento are `large`; the rest are `standard`. */
  readonly size?: ProjectCardSize
  /**
   * Where the card points. **No default** — omitting it makes the card
   * non-interactive rather than linking to a route that does not exist.
   * Ignored entirely when `placeholder`.
   */
  readonly href?: string
  /** CTA label. `Read the case study` on large cards, `Read` on standard. */
  readonly cta?: string
  readonly ctaTone?: Tone
  /** `max-width` on the summary, in `ch`. */
  readonly summaryMaxCh?: number
  /**
   * Renders the § 6.10 non-interactive placeholder card instead of a link.
   * Mirrors `Project.placeholder` in the content contract.
   */
  readonly placeholder?: boolean
  /**
   * The stand-in shown in place of the real name while the case study is
   * unwritten — the export renders `[AR project name]`. Defaults to `name`,
   * which already carries the dotted-underline placeholder treatment.
   */
  readonly placeholderName?: string
  /** Overrides the placeholder card's accessible name. */
  readonly ariaLabel?: string
  /**
   * Optional preview media. A slot rather than an `<img>` so the caller
   * chooses `next/image`. When it is absent **no wrapper element is rendered**
   * — a card with no media must not ship an empty container.
   */
  readonly media?: ReactNode
  readonly className?: string
}

/**
 * `private` renders as **`Client codebase`**, not `Private`.
 *
 * Every private repo on this page is client work, and "Private" reads as
 * something withheld where "Client codebase" states the reason. The Badge's
 * `private` state stays available for surfaces where that distinction matters.
 */
const BADGE_FOR_VISIBILITY: Record<ProjectVisibility, BadgeStatus> = {
  public: 'public',
  private: 'client',
  client: 'client',
}

/** Header row: 16px gap / 32px below on large, 12px / 24px on standard. */
const HEADER_CLASS: Record<ProjectCardSize, string> = {
  large: 'mb-8 gap-4',
  standard: 'mb-6 gap-3',
}

const TITLE_CLASS: Record<ProjectCardSize, string> = {
  large: 'type-bento-large',
  standard: 'type-bento-standard',
}

/**
 * The `wdth` axis comes from the utility above; size, leading and tracking are
 * inline because they are per-size overrides of it. Large cards keep 2.25rem at
 * every width — reconciliation § 3.3 stacks the bento to one column below 768
 * but does not shrink its display type.
 */
const TITLE_STYLE: Record<ProjectCardSize, CSSProperties> = {
  large: { fontSize: '2.25rem', lineHeight: 1.05, letterSpacing: '-0.015em' },
  standard: { fontSize: '1.5rem', lineHeight: 1.25 },
}

const SUMMARY_MAX_CH: Record<ProjectCardSize, number> = { large: 44, standard: 48 }

const CTA_LABEL: Record<ProjectCardSize, string> = {
  large: 'Read the case study',
  standard: 'Read',
}

/**
 * Shown when a card has no destination.
 *
 * Most of this work is on private or client codebases, so for the majority of cards there
 * will never be a public case study to link to — this is not only a milestone gap. Spec § 3.2
 * turns that into an offer rather than an apology: "the code isn't public — I'm happy to walk
 * through the architecture on a call." Saying so on the card is more useful than a dead arrow.
 */
const NO_DESTINATION_CTA = 'Architecture walkthrough on request'

/** Large cards carry a lit CTA in their accent; standard cards stay muted. */
function defaultCtaTone(size: ProjectCardSize, accent: 'violet' | 'cyan'): Tone {
  if (size === 'standard') return 'muted'
  return accent === 'cyan' ? 'cyan' : 'iris'
}

function CardMedia({ media }: { media: ReactNode }) {
  return (
    <div data-card-media="" className="mb-6 overflow-hidden rounded-xl">
      {media}
    </div>
  )
}

export function ProjectCard({
  // `slug` stays on the props type — callers spread whole project records through, and it is
  // their React key — but the card itself no longer reads it. It was only ever used to build
  // the `/work/${slug}` fallback href, which is deliberately gone (see `href` below).
  name,
  summary,
  stack,
  visibility,
  domain,
  size = 'standard',
  href,
  cta,
  ctaTone,
  summaryMaxCh,
  placeholder = false,
  placeholderName,
  ariaLabel,
  media,
  className,
}: ProjectCardProps) {
  const maxCh = summaryMaxCh ?? SUMMARY_MAX_CH[size]

  if (placeholder) {
    return (
      <PlaceholderCard
        aria-label={ariaLabel ?? `${name} case study, in preparation`}
        className={cx('w-full p-6 lg:p-7', className)}
      >
        <div className="mb-6 flex items-center justify-between gap-3">
          {/* Dashed, muted: the placeholder convention overrides the tint. */}
          <Chip variant="domain" size="sm" tone="muted" className="border-dashed">
            {domain.label}
          </Chip>
          <Badge status="in-preparation" />
        </div>
        {media === undefined ? null : <CardMedia media={media} />}
        <PlaceholderText
          as="h3"
          className={cx(TITLE_CLASS.standard, 'mb-2.5')}
          style={TITLE_STYLE.standard}
        >
          {placeholderName ?? name}
        </PlaceholderText>
        <p className="mt-0 mb-5" style={{ maxWidth: `${maxCh}ch` }}>
          {summary}
        </p>
        {/* `margin: auto 0 0` — the same flex spacer the tech row uses. */}
        <div className="mt-auto flex flex-wrap gap-1.5">
          <PlaceholderGhost width={72} />
          <PlaceholderGhost width={88} />
          <PlaceholderGhost width={64} />
        </div>
      </PlaceholderCard>
    )
  }

  return (
    <GlassCard
      variant={size === 'large' ? 'work-large' : 'work-standard'}
      glow={href === undefined ? undefined : domain.accent}
      /* No fallback to `/work/${slug}`. That route does not exist in this milestone
         (reconciliation § 9), and defaulting to it would make six of seven cards
         404 traps dressed as the design's signature interaction. Without a
         destination the card is a plain container: no `<a>`, no hover glow, and
         no arrow promising navigation. § 6a — a designed affordance may only be
         shown once the thing it points at exists. */
      href={href}
      /* When the card IS a link the base layer paints links cyan; the utility
         layer wins over it, so body copy stays `--fg-1` at rest AND on hover —
         only the border and the glow move. */
      className={cx('w-full text-[color:var(--fg-1)]', className)}
    >
      <div className={cx('flex items-center justify-between', HEADER_CLASS[size])}>
        <Chip variant="domain" size="sm" tone={accentForDomain(domain.id)}>
          {domain.label}
        </Chip>
        <Badge status={BADGE_FOR_VISIBILITY[visibility]} />
      </div>

      {media === undefined ? null : <CardMedia media={media} />}

      <h3 className={cx(TITLE_CLASS[size], 'mb-3')} style={TITLE_STYLE[size]}>
        {name}
      </h3>

      <p
        className={cx('mt-0 mb-6', size === 'large' && 'text-[1.125rem] leading-[1.6]')}
        style={{ maxWidth: `${maxCh}ch` }}
      >
        {summary}
      </p>

      {/* `margin: auto 0 24px` lives in the `tech-tag-list` utility. That
          `auto` is the flex spacer pinning tag rows to a common baseline
          across cards of different heights (§ 6.9). Do not remove it. */}
      <TechTagList>
        {stack.map((item) => (
          <TechTag key={item}>{item}</TechTag>
        ))}
      </TechTagList>

      {/* With a destination this is the design's CTA. Without one it states the
          offer the spec makes for private work (§ 3.2) instead of pointing
          nowhere — the limitation becomes the call to action, and the row keeps
          its height so the bento's baselines still line up. */}
      <span
        className="flex items-center gap-2.5 uppercase"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--label)',
          letterSpacing: '0.12em',
          color:
            href === undefined
              ? 'var(--fg-2)'
              : toneVar(ctaTone ?? defaultCtaTone(size, domain.accent)),
        }}
      >
        {href === undefined ? NO_DESTINATION_CTA : (cta ?? CTA_LABEL[size])}
        {href === undefined ? null : <span aria-hidden="true">→</span>}
      </span>
    </GlassCard>
  )
}
