import styles from './route.module.css'

export type BreadcrumbItem = { readonly label: string; readonly href?: string }

/**
 * The visible trail. The last item is the current page and is not a link. Matches the
 * `BreadcrumbList` JSON-LD the route emits, built from the same items.
 */
export function Breadcrumbs({ items }: { items: readonly BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className={styles.crumbs}>
      <ol>
        {items.map((item, index) => {
          const current = index === items.length - 1
          return (
            <li key={item.label}>
              {current || item.href === undefined ? (
                <span aria-current={current ? 'page' : undefined}>{item.label}</span>
              ) : (
                <a href={item.href}>{item.label}</a>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
