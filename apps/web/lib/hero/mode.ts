/**
 * Whether the hero monolith is the page's hero, or the painted 2D cube hero is — hero monolith spec § 7 and S2.
 *
 * Three layers, strongest first, and the answer is the same string everywhere it is asked:
 *
 * 1. `?hero=off` is the kill switch: the painted 2D hero, no poster, no engine. `?hero=a` is the preview flag.
 * 2. `NEXT_PUBLIC_HERO` at build time: `off` or `monolith`. Folded by `next.config.ts`, so it is a constant.
 * 3. `HERO_DEFAULT_ON`: what a plain visit gets. This is the one constant S3 flips. It stays `false` until the
 *    owner has judged the engine on a real phone; nothing past S1 may become the default on SwiftShader evidence.
 *
 * The same decision reaches three places: the server render (`<html data-hero-mode>` and the poster markup, from
 * the build-time answer), a pre-paint script that applies the query string before the first paint
 * (`HERO_MODE_SCRIPT`, no flash, no waiting for hydration), and `AssemblyLayer` (the engine gate, from `heroFlagOn`).
 * `html[data-hero-mode]` is what the CSS keys on (and `AssemblyLayer` re-writes it after hydration, so a blocked script cannot leave it wrong); the engine's own `html[data-hero]` says what is painting.
 *
 * Pure and tiny on purpose: `gate.ts` imports this and `gate.ts` is in the initial bundle.
 */

export type HeroMode = 'on' | 'off'

/** S3 flips this one constant. Do not flip it in a slice that has no real-device evidence. */
export const HERO_DEFAULT_ON = false

/** The mode a build bakes in: the env switch if it is set, the constant otherwise. */
export function buildHeroMode(env: string | undefined = process.env.NEXT_PUBLIC_HERO): HeroMode {
  if (env === 'off') return 'off'
  if (env === 'monolith') return 'on'
  return HERO_DEFAULT_ON ? 'on' : 'off'
}

const OFF = /[?&]hero=off(?:&|$)/
const ON = /[?&]hero=a(?:&|$)/

/** The mode for one visit: the query string over the build's answer. `hero=off` anywhere wins over `hero=a`, whatever the order. */
export function heroModeFor(search: string, build: HeroMode = buildHeroMode()): HeroMode {
  if (OFF.test(search)) return 'off'
  return ON.test(search) ? 'on' : build
}

/**
 * Runs in `<head>` before the first paint. It does `heroModeFor`'s query-string half in about 150 bytes, so a
 * `?hero=a` or `?hero=off` visit is right from the first frame. A unit test runs it against `heroModeFor`.
 */
export const HERO_MODE_SCRIPT =
  "try{var s=location.search,m=/[?&]hero=off(?:&|$)/.test(s)?'off':/[?&]hero=a(?:&|$)/.test(s)?'on':'';m&&document.documentElement.setAttribute('data-hero-mode',m)}catch(e){}"

/**
 * If the Content-Security-Policy is ever enforced without `'unsafe-inline'` (it is report-only today, see
 * docs/security-headers.md), this inline script needs its sha256 in `script-src`. The failure is soft: `AssemblyLayer`
 * writes the same attribute again after hydration, so a blocked script costs a late poster, not a wrong page.
 */
