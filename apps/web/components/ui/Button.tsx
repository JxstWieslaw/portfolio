import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '@/lib/cx'

/**
 * Reconciliation § 6.1 — buttons are pills at `999px`, never the M0 plan's
 * 6px. Two sizes only: 48px with `0 26px` padding (hero CTA, form submit) and
 * 44px with `0 22px` (nav CTA, "All work", social pills).
 *
 * The primary hover — solid `--fg-0` inverting to
 * `linear-gradient(90deg,#7C3AED,#22D3EE)` with the label flipping to
 * `--fg-0` — is one of only three sanctioned uses of `--gradient`.
 *
 * All chrome lives in the `btn` utility in `globals.css`, keyed on
 * `data-variant` / `data-size`, so a button's state is readable in the DOM.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'icon' | 'unsupported'

/** `lg` = 48px / `0 26px`. `md` = 44px / `0 22px`. Nothing else exists. */
export type ButtonSize = 'lg' | 'md'

type ButtonOwnProps = {
  children: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  /** Renders an `<a>` instead of a `<button>`. Ignored when unsupported. */
  href?: string
  target?: string
  rel?: string
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  /** Adds the spinner, `aria-busy`, `cursor:wait` and blocks activation. */
  loading?: boolean
  /** Replaces the label while loading — "Sending…" on the contact form. */
  loadingLabel?: ReactNode
  /** A decorative affordance after the label, usually `→`. */
  trailing?: ReactNode
  /** The inline badge on the unsupported variant. */
  unsupportedLabel?: string
  className?: string
}

export type ButtonProps = ButtonOwnProps &
  Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'>

function ButtonBody({
  children,
  loading,
  loadingLabel,
  trailing,
  variant,
  unsupportedLabel,
}: Pick<
  ButtonOwnProps,
  'children' | 'loading' | 'loadingLabel' | 'trailing' | 'variant' | 'unsupportedLabel'
>) {
  return (
    <>
      {loading ? <span className="btn-spinner" aria-hidden="true" /> : null}
      {loading && loadingLabel !== undefined ? loadingLabel : children}
      {trailing !== undefined && !loading ? <span aria-hidden="true">{trailing}</span> : null}
      {variant === 'unsupported' ? <span className="badge">{unsupportedLabel}</span> : null}
    </>
  )
}

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  href,
  target,
  rel,
  type = 'button',
  disabled = false,
  loading = false,
  loadingLabel,
  trailing,
  unsupportedLabel = 'Unsupported',
  className,
  ...rest
}: ButtonProps) {
  const body = (
    <ButtonBody
      loading={loading}
      loadingLabel={loadingLabel}
      trailing={trailing}
      variant={variant}
      unsupportedLabel={unsupportedLabel}
    >
      {children}
    </ButtonBody>
  )

  /**
   * The unsupported state is *designed* graceful degradation (reconciliation
   * § 8), not a bug to fix: it must stay focusable and announced. So it uses
   * `aria-disabled` and never the `disabled` attribute, which would drop it
   * out of the tab order entirely.
   */
  if (variant === 'unsupported') {
    return (
      <button
        {...rest}
        type="button"
        aria-disabled="true"
        data-variant="unsupported"
        data-size={size}
        className={cx('btn', className)}
      >
        {body}
      </button>
    )
  }

  if (href !== undefined && !disabled && !loading) {
    return (
      <a
        {...rest}
        href={href}
        target={target}
        rel={rel}
        data-variant={variant}
        data-size={size}
        className={cx('btn', className)}
      >
        {body}
      </a>
    )
  }

  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
      data-variant={variant}
      data-size={size}
      data-loading={loading ? 'true' : undefined}
      className={cx('btn', className)}
    >
      {body}
    </button>
  )
}
