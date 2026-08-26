# Next.js 16 upgrade notes

`apps/web` ships on **Next 15.5.23**. Staying there through M0 was deliberate: the spec requires
"Next.js (App Router)" with no major pinned, the branch was fully green on 15, and a major
upgrade mid-milestone is risk that buys nothing M0 needs (Cache Components and PPR are M2+
concerns).

A parallel line of development *did* build the same scaffold on **Next 16.3.1** and hit four
things that cost real debugging. They are recorded here because they will recur at upgrade
time, and the branch they were discovered on has been archived.

---

## 1. `next.config` no longer accepts an `eslint` key

Next 16 removed the field. Keeping it fails the typed-config excess-property check:

```
next.config.ts(5,3): error TS2353: Object literal may only specify known properties,
and 'eslint' does not exist in type 'NextConfig'.
```

Drop `eslint: { ignoreDuringBuilds: true }`. Linting is already its own Turbo task, so build-time
ESLint was redundant anyway.

## 2. Next 16 writes `AGENTS.md` / `CLAUDE.md` into the tracked tree

On by default. Every `dev` and `build` drops framework-authored agent rule files into the app
directory, which then show up in every `git status` from that point on. Disable it:

```ts
const config: NextConfig = {
  agentRules: false,
}
```

Delete any already-generated files before committing.

## 3. `eslint-config-next` exports an array, not a factory

```js
// wrong — TypeError: next is not a function
export default [...base, ...next()]

// correct
import next from 'eslint-config-next'
export default [...base, ...next]
```

Confirm against the installed version's `dist/index.d.ts` rather than trusting a snippet — this
export shape has changed more than once across releases.

## 4. jsdom breaks `new URL(relative, import.meta.url)` in tests

Any test that reads a file relative to itself — the design-token test does this to assert the
brand hex values as raw CSS text — resolves against jsdom's document URL
(`http://localhost:3000/…`) instead of `file://`, and the read fails.

Pin those specific tests to the `node` environment while leaving jsdom as the suite default for
component tests:

```ts
// vitest.config.ts
test: {
  environment: 'jsdom',
  environmentMatchGlobs: [['tests/unit/tokens.test.ts', 'node']],
}
```

---

## Before upgrading

Run the official codemod (`npx @next/codemod@canary upgrade latest`) first, then work through the
four items above. Re-measure the performance budgets afterwards — see
[`m0-lcp-investigation.md`](m0-lcp-investigation.md); LCP is already over budget on 15, and a
major upgrade changes the hydration profile that investigation identified as the driver.
