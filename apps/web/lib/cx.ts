/**
 * Joins class names, dropping anything falsy. Deliberately not `clsx` — this
 * is the entire feature set the design layer uses, and M0 carries a 90 KB
 * budget it should not spend on a dependency.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part)).join(' ')
}
