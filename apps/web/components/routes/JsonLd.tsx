import { jsonLdScript } from '@/lib/route-seo'

/**
 * One JSON-LD block. A server component: the payload is escaped by `jsonLdScript` (so a `<`
 * in a string cannot close the tag) and is metadata, not content, so it goes last in the page.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }} />
}
