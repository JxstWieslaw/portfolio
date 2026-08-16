/**
 * The first focusable element on the page. Parked off-canvas at
 * `left:-9999px` and pinned back in on `:focus` — not `sr-only`, because the
 * link must be *visible* once focused (design-home.md § 1). The `.skip-link`
 * recipe lives in the base layer of `globals.css`.
 */
export function SkipLink({ href = '#main' }: { href?: string }) {
  return (
    <a href={href} className="skip-link">
      Skip to content
    </a>
  )
}
