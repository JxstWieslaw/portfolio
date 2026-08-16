import { PlaceholderText } from '@/components/ui/PlaceholderCard'
import { Reveal } from '@/components/ui/Reveal'
import { formatMonthYear } from '@/lib/format-period'

/**
 * One Writing card. Shape mirrors `Writing` in `lib/content.ts` /
 * `@repo/contracts`, declared locally so the section stays prop-driven.
 */
export interface Article {
  readonly title: string
  readonly url: string
  /** `YYYY-MM-DD` or `YYYY-MM`. Rendered as `Mar 2026`. */
  readonly date: string
  readonly source: 'medium' | 'other'
  readonly excerpt: string
  /** Not yet published — the date carries the dotted-underline convention. */
  readonly placeholder?: boolean
}

export interface ArticleCardProps {
  readonly article: Article
}

const SOURCE_LABEL: Record<Article['source'], string> = {
  medium: 'Medium',
  other: 'Elsewhere',
}

/**
 * Reconciliation § 6.8 — **opaque `--bg-2`, not glass.** No `backdrop-filter`,
 * no lit `border-top`, because there is no canvas behind this section for a
 * blur to sample. Hover moves `border-color` to `--violet-400` and nothing
 * else: no glow, no transform.
 *
 * The card is an `<article>` whose heading link carries an `::after` overlay,
 * so the whole surface is clickable while the link's accessible name is exactly
 * the article title. `focus-within` gives the hover a keyboard peer.
 *
 * `placeholder` dots the **date** only. In the export the title was literally
 * `[Article title — from RSS]` and so carried the convention too; here the
 * titles are authored copy and only the publication is outstanding, so muting
 * them would misrepresent what is missing.
 */
export function ArticleCard({ article }: ArticleCardProps) {
  const date = formatMonthYear(article.date)

  return (
    <Reveal
      as="article"
      className="relative flex h-full flex-col rounded-[var(--r-panel)] border border-[color:var(--line-1)] bg-[color:var(--bg-2)] p-7 transition-[border-color] duration-200 ease-[cubic-bezier(.2,.8,.2,1)] hover:border-[color:var(--violet-400)] focus-within:border-[color:var(--violet-400)]"
    >
      <span className="mb-5 font-[family-name:var(--font-mono)] text-[length:0.6875rem] tracking-[0.12em] text-[color:var(--fg-2)] uppercase">
        {SOURCE_LABEL[article.source]} ·{' '}
        {article.placeholder === true ? <PlaceholderText>{date}</PlaceholderText> : date}
      </span>

      <h3 className="type-writing-h3 mb-3 text-xl leading-[1.25]">
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[color:var(--fg-0)] after:absolute after:inset-0"
        >
          {article.title}
        </a>
      </h3>

      <p className="mb-6 text-[length:0.9375rem] leading-[1.6] text-[color:var(--fg-2)]">
        {article.excerpt}
      </p>

      {/* Decorative: the link is already named by the title above. */}
      <span
        aria-hidden="true"
        className="mt-auto font-[family-name:var(--font-mono)] text-[length:0.75rem] tracking-[0.12em] text-[color:var(--fg-2)] uppercase"
      >
        Read →
      </span>
    </Reveal>
  )
}
