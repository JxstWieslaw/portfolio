/**
 * Period and date formatting for the Experience timeline and the Writing cards.
 *
 * Content stores machine-sortable `YYYY-MM` (and `YYYY-MM-DD` for articles).
 * The design renders neither of those:
 *
 *  - the timeline renders **years only** — `2024 — present`, `2022 — 2024`
 *    (design-home.md § 9, "The five entries": every date cell is a year or a
 *    year range, never a month);
 *  - the writing card eyebrow renders `Mar 2026` (design-home.md § 10).
 *
 * The M0 plan's `formatPeriod` produced `Jan 2025 — Present`. That is the wrong
 * granularity for the rail and, given OD-8 (the start *months* are unverified),
 * it would also present invented precision as fact. Years are what the design
 * asks for and what the content can honestly support.
 *
 * Nothing here uses `Date` or `toLocaleDateString`: both are locale- and
 * timezone-sensitive, and `new Date('2026-03-04')` is parsed as UTC midnight,
 * which renders as the *previous* month for anyone west of Greenwich.
 */

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/** An employment period. `to` absent ⇒ the role is current. */
export interface Period {
  readonly from: string
  readonly to?: string
}

/** The open end of a current role. Lower case, as the design renders it. */
export const PRESENT = 'present'

/** The en-dash-width separator the design uses between endpoints: ` — `. */
const RANGE = ' — '

/** `2024-01` → `2024`; `2024` → `2024`. Anything else is returned untouched. */
function toYear(value: string): string {
  const year = value.slice(0, 4)
  return /^\d{4}$/.test(year) ? year : value
}

/**
 * `{ from: '2025-01' }`              → `2025 — present`
 * `{ from: '2020-01', to: '2023-12' }` → `2020 — 2023`
 * `{ from: '2024-01', to: '2024-11' }` → `2024`
 *
 * The single-year collapse is the design's own: entries 2 and 4 of the export's
 * rail render `2024` and `2021`, not `2024 — 2024`.
 */
export function formatPeriod(period: Period): string {
  const from = toYear(period.from)
  if (period.to === undefined || period.to === '') return `${from}${RANGE}${PRESENT}`

  const to = toYear(period.to)
  return from === to ? from : `${from}${RANGE}${to}`
}

/**
 * `2026-03-04` → `Mar 2026`. `2026-03` works too; a value with no resolvable
 * month falls back to the year alone rather than inventing one.
 */
export function formatMonthYear(value: string): string {
  const [year, month] = value.split('-')
  if (year === undefined) return value
  if (month === undefined) return year

  const label = MONTHS[Number(month) - 1]
  return label === undefined ? year : `${label} ${year}`
}
