import type { CSSProperties } from 'react'

/* ── Measured values ──────────────────────────────────────────────────────
 * Every constant below is transcribed from design-home.md § 7. They are inline
 * styles rather than utilities because `app/globals.css` is owned elsewhere and
 * the Craft section may not add to it; nothing here is a raw colour, only
 * tokens.
 *
 * This module has no directive, so both halves of the section — the server
 * shell in `Craft.tsx` and the client child in `CraftControls.tsx` — import it
 * without pulling the other into their bundle.
 * -------------------------------------------------------------------------- */

/**
 * § 3.3 — below 768 the panel goes full-width and the scrim flips to vertical.
 * Same three stops as `SCRIMS.scatter`, rotated onto the vertical axis so the
 * dark end lands where the panel does. Layered over the section's own radial
 * rather than replacing it: `SectionBackdrop` owns that one and is not this
 * component's to change.
 */
export const MOBILE_SCRIM =
  'linear-gradient(180deg, rgba(13, 17, 23, 0) 0%, rgba(13, 17, 23, 0.55) 45%, rgba(13, 17, 23, 0.94) 100%)'

/**
 * The only `h2` on the page with a **fixed** size rather than the `--h2` clamp,
 * and the only one at `wdth 92` rather than 95 — because the panel it sits in
 * is already capped at 460px, so there is nothing for a clamp to respond to.
 */
export const STATEMENT: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontVariationSettings: "'wdth' 92",
  fontWeight: 600,
  fontSize: '2rem',
  lineHeight: 1.1,
  letterSpacing: '-0.015em',
  textWrap: 'balance',
}

export const PHYSICS_OFF: CSSProperties = {
  border: '1px solid var(--line-2)',
  background: 'transparent',
  color: 'var(--fg-1)',
}

export const PHYSICS_ON: CSSProperties = {
  border: '1px solid rgba(34, 211, 238, 0.5)',
  background: 'rgba(34, 211, 238, 0.12)',
  color: 'var(--fg-0)',
  boxShadow: 'var(--glow-cyan)',
}

/** Mono micro-label chrome, shared by the HUD toggle and the lab link. */
export const MICRO_LINK: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  minHeight: 44,
  padding: 0,
  border: 'none',
  background: 'none',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.6875rem',
  lineHeight: 1.4,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
}

export const HUD_PANEL: CSSProperties = {
  marginTop: 20,
  padding: 16,
  border: '1px solid var(--line-1)',
  borderRadius: 'var(--r-card)',
  background: 'rgba(13, 17, 23, 0.86)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--label)',
  lineHeight: 1.9,
  color: 'var(--fg-1)',
}

export const HUD_ROW: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
}

export const NOTE: CSSProperties = {
  margin: 0,
  color: 'var(--fg-2)',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.6875rem',
  lineHeight: 1.6,
  letterSpacing: '0.02em',
  textTransform: 'none',
}
