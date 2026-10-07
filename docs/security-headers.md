# Security headers

Delivered from `apps/web/next.config.ts` `headers()`. There is no `vercel.json` or `vercel.ts` in the repo, so
nothing else sets or overrides response headers on Vercel (checked on the base commit). Anything added to one later
would merge with these by key, so check this table first.

## What ships

| Header | Value | Scope |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | every route |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | every route |
| `Permissions-Policy` | camera, microphone, geolocation, payment, usb, bluetooth, serial, hid, midi, display-capture, autoplay, accelerometer, gyroscope, magnetometer, xr-spatial-tracking all set to `()` | every route |
| `Content-Security-Policy-Report-Only` | see below | every route |
| `Cache-Control`, `Cross-Origin-Resource-Policy: same-origin` | unchanged | only `/models/manifest.json` and hash-named `/models/*.t[123].<hash8>.glb` |

The CSP is **report-only**. It blocks nothing, so this change cannot alter what a visitor sees or what runs. It has
no `report-uri` / `report-to` yet, so violations are visible only in a browser's console and in
`securitypolicyviolation` events (which is how the Playwright check below collected them).

## The policy

```
default-src 'self'
script-src  'self' 'unsafe-inline' 'wasm-unsafe-eval'     (+ 'unsafe-eval' in dev only, + vercel.live on previews)
style-src   'self' 'unsafe-inline'
img-src     'self' data: blob:
font-src    'self' data:
connect-src 'self' <origin of NEXT_PUBLIC_API_URL>        (+ ws:/http: in dev, + vercel.live and pusher on previews)
frame-src   'none'                                         ('self' + vercel.live on previews)
worker-src 'self'; manifest-src 'self'; media-src 'self'
object-src 'none'; base-uri 'self'; form-action 'self' mailto:; frame-ancestors 'none'
```

It is built when the config loads, from `NODE_ENV`, `VERCEL_ENV` and `NEXT_PUBLIC_API_URL`. The Vercel toolbar origins
appear only when `VERCEL_ENV=preview`; production and local builds never list them. A malformed API URL is ignored.

## Violations found

None on the pages tested. Method: production build served by `next start`, Chromium (SwiftShader WebGL2),
a `securitypolicyviolation` listener from first paint, then a scroll through the whole page, on `/`, `/?modeltest=1`
(compiled out in a normal build, so the same as `/`) and `/?hero=a` (tier 3 engine running). Run against a normal
build and against a build with `NEXT_PUBLIC_MODEL_TEST=1` (the CI e2e build). Three GLBs loaded and decoded in every run.

Two controls show the listener and the policy are real, not silent:

- A deliberate `fetch('https://example.com/x')` was reported as a `connect-src` violation.
- Serving the same page with `'wasm-unsafe-eval'` stripped produced `script-src wasm-eval`. So the Meshopt decoder does
  need it, and nothing in the policy is wider than it has to be on this path.

Not covered: real GPUs and WebKit/Firefox in the field, `/api` calls (the contact form posts to
`NEXT_PUBLIC_API_URL`; that origin is in `connect-src` when set, and no test exercises a live API), and Vercel preview
toolbar origins (listed from Vercel's documented set, not observed). This is why enforcing waits for a report sink.

## What the enforcing step needs

1. **A report sink.** Add `report-uri` or `report-to` (a small `/api/csp-report` on the Cloud Run API, rate limited,
   or a Sentry/Report URI endpoint) and read reports for a week of real traffic, from real GPUs and browsers, before
   switching. The Playwright run covers Chromium on SwiftShader only.
2. **Decide on `'unsafe-inline'` for scripts.** Next's inline bootstrap scripts have no nonce because the pages are
   statically generated. Keeping `'unsafe-inline'` is a deliberate trade (roadmap decision "CSP mode": allowlist CSP,
   static generation kept). A nonce or hash policy would need dynamic rendering for every page, which costs the
   static CDN path. Because of this, enforcing mostly buys `connect-src`, `object-src`, `base-uri`, `frame-ancestors`
   and the remote-origin restrictions, not XSS protection from injected inline script.
3. **Rename the header** to `Content-Security-Policy` and move `frame-ancestors` and `upgrade-insecure-requests`
   (ignored in report-only) into effect. `frame-ancestors 'none'` blocks any embedding of the site; confirm that is intended.
4. **Preview parity.** The enforcing preview policy must keep the Vercel toolbar origins, or the toolbar breaks on previews.
5. **The lab (Phase 2b)** needs `Permissions-Policy` to allow `gyroscope`, `accelerometer`, `magnetometer` and
   `xr-spatial-tracking` for `self`; change those four entries to `(self)` in the same PR that adds them, as the
   roadmap exit criteria say.
6. **Textured models and compressed-texture loaders.** No committed model carries textures today, so the policy is
   right as it stands. A textured GLB makes GLTFLoader fetch its embedded textures from `blob:` URLs, which needs
   `blob:` in `connect-src` (`img-src` already has it). KTX2 or Draco loaders would also need `worker-src blob:`
   and an origin for the decoder files (or self-hosting them). Add these in the PR that introduces such a model.
7. **Any new third-party origin** (analytics, fonts, embeds) must be added to the policy in the same change that
   introduces it, or it will be blocked once enforcing.
