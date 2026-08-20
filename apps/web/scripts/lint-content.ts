/**
 * Reports placeholder content without ever failing the build.
 *
 * `listPlaceholders()` (in `lib/content.ts`) is the single source of truth for which
 * authored items are unverified copy. This script only formats that list for a terminal
 * and a CI log — it does not decide what counts as a placeholder.
 *
 * Exit code is always 0, deliberately. Placeholder content ships in M0 by design (spec
 * says replace before launch, M5); this is a report, not a gate. Do not make it fail.
 */
import { listPlaceholders } from '../lib/content'

const items = listPlaceholders()

if (items.length === 0) {
  console.log('✓ No placeholder content remaining.')
  process.exit(0)
}

console.log(`\n${items.length} placeholder item(s) still in content:\n`)

const byKind = new Map<string, string[]>()
for (const { kind, label } of items) {
  byKind.set(kind, [...(byKind.get(kind) ?? []), label])
}

for (const [kind, labels] of byKind) {
  console.log(`  ${kind}`)
  for (const label of labels) console.log(`    · ${label}`)
}

console.log('\nThese render as finished copy but are not verified fact. Replace before launch (M5).\n')

// Exit 0 by design: placeholders must never block a deploy. The report is the signal.
process.exit(0)
