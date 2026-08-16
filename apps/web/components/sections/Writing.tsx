import { Section } from '@/components/layout/Section'
import { ArticleCard, type Article } from '@/components/cards/ArticleCard'
import { Button } from '@/components/ui/Button'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { PlaceholderCard } from '@/components/ui/PlaceholderCard'
import { Reveal } from '@/components/ui/Reveal'
import { SectionHeader } from '@/components/ui/SectionHeader'

export type { Article }

export interface WritingLink {
  readonly label: string
  readonly url: string
}

export interface WritingProps {
  /**
   * Two in M0. The third grid slot is the RSS-failure card below — a designed
   * component, not a data row (reconciliation § 6.8), so this array is never
   * padded to three.
   */
  readonly articles: readonly Article[]
  /** The 44px outline pills — LinkedIn, GitHub, X, Medium. */
  readonly primaryLinks: readonly WritingLink[]
  /** The smaller mono tier below the divider. */
  readonly elsewhereLinks?: readonly WritingLink[]
  /** `Read on Medium →` inside the failure card. Omitted ⇒ no link at all. */
  readonly feedUrl?: string
  /**
   * Whether a feed fetch was actually attempted.
   *
   * `false` in M0, because no fetch happens at all — so the card must not claim the feed
   * "didn't respond", which asserts a request that was never made. Same reasoning as the
   * contact form's `offline` state: a designed error state may only be shown once the
   * error it describes can genuinely occur. M3 wires the fetch and passes `true`, at
   * which point the export's original wording becomes true and is used verbatim.
   */
  readonly feedAttempted?: boolean
}

/**
 * A link is only rendered if it points somewhere.
 *
 * The export shipped `href="#"` for X, Medium, Instagram, Discord, Reddit and
 * Pinterest. The content deliberately omits Discord and Pinterest rather than
 * inventing accounts, so anything arriving without a real URL is dropped
 * instead of rendered as a dead affordance.
 */
function isLinkable(link: WritingLink): boolean {
  const url = link.url.trim()
  return url !== '' && url !== '#'
}

/**
 * Writing & elsewhere.
 *
 * **No canvas** — solid `--bg-1`, the second half of the design's quiet zone
 * (reconciliation § 5). Three columns at desktop: two article cards and, in the
 * third slot, the designed RSS-failure card. That card is not a fallback that
 * appears on error; in M0 there is no feed fetch at all, so the honest state of
 * the slot is permanently "the feed is not here". When a live feed lands it
 * takes the slot and this card returns to being an error state.
 */
export function Writing({
  articles,
  primaryLinks,
  elsewhereLinks = [],
  feedUrl,
  feedAttempted = false,
}: WritingProps) {
  const pills = primaryLinks.filter(isLinkable)
  const elsewhere = elsewhereLinks.filter(isLinkable)

  return (
    <Section id="writing" labelledBy="writing-h" background="bg-1">
      <SectionHeader
        index="06"
        eyebrow="Writing & elsewhere"
        title="Writing & elsewhere"
        titleId="writing-h"
      />

      <div className="mb-16 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {articles.map((article) => (
          <ArticleCard key={article.url + article.title} article={article} />
        ))}

        <Reveal>
          <PlaceholderCard className="h-full justify-center p-7">
            <Eyebrow size="sm" className="mb-4">
              {feedAttempted ? 'RSS unavailable' : 'Feed not wired up yet'}
            </Eyebrow>
            <p className="mb-5 text-[length:0.9375rem] leading-[1.6] text-[color:var(--fg-2)]">
              {feedAttempted
                ? "The Medium feed didn't respond. Nothing else on the page depends on it."
                : 'Live posts land here once the Medium feed is connected. Nothing else on the page depends on it.'}
            </p>
            {feedUrl === undefined ? null : (
              <a
                href={feedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center self-start font-[family-name:var(--font-mono)] text-[length:0.75rem] tracking-[0.12em] text-[color:var(--cyan-300)] uppercase"
              >
                Read on Medium →
              </a>
            )}
          </PlaceholderCard>
        </Reveal>
      </div>

      {/*
        The social rail: two tiers either side of a 1px x 24px hairline. The
        divider is decorative and only earns its place when there is a second
        tier to separate.
      */}
      <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--line-1)] pt-8">
        {pills.map((link) => (
          <Button
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            variant="secondary"
            size="md"
          >
            {link.label}
          </Button>
        ))}

        {pills.length > 0 && elsewhere.length > 0 ? (
          <span
            aria-hidden="true"
            className="mx-2 h-6 w-px bg-[color:var(--line-1)]"
          />
        ) : null}

        {elsewhere.map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center px-3.5 font-[family-name:var(--font-mono)] text-[length:0.6875rem] tracking-[0.12em] text-[color:var(--fg-2)] uppercase transition-colors duration-200 hover:text-[color:var(--fg-1)] focus-visible:text-[color:var(--fg-1)]"
          >
            {link.label}
          </a>
        ))}
      </div>
    </Section>
  )
}
