'use client'

import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useRef,
} from 'react'
import { cx } from '@/lib/cx'

/**
 * The mobile navigation sheet — reconciliation § 6.13.
 *
 * **This component is authored, not transcribed.** `Home.dc.html` has no mobile
 * navigation at all: its header row needs ~480px of content and the viewport at
 * 390 offers 358, with no hamburger, no `flex-wrap` and no media query
 * (design-home.md § 2 "Responsive"). § 3.3 resolves that as a bottom sheet
 * rather than a top drawer, because it has to be thumb-reachable on a tablet as
 * well as a phone.
 *
 * A native `<dialog>` carries the semantics: `role="dialog"`, `aria-modal`, the
 * top layer, `::backdrop`, and inert content behind it. What it does *not*
 * carry portably is the part this component owns:
 *
 * 1. **Escape.** The browser's own close request closes the element directly,
 *    behind React's back, leaving `open` true and the sheet invisible. `cancel`
 *    is therefore prevented and routed through `onClose` so the prop stays the
 *    single source of truth.
 * 2. **The focus trap.** A modal dialog traps focus in a browser but not in
 *    jsdom, so the wrap is implemented here and is directly testable rather
 *    than assumed.
 * 3. **Focus return.** Restored explicitly to `returnFocusTo`, falling back to
 *    whatever held focus when the sheet opened.
 * 4. **Scroll lock.** `showModal()` does not reliably stop the page behind from
 *    scrolling; the previous inline `overflow` is saved and restored.
 *
 * `showModal()` is also absent from jsdom and from any browser predating the
 * 2022 dialog rollout. Rather than throw, the sheet degrades to a non-modal
 * `open` attribute: no top layer, but the menu still opens, still traps and
 * still closes. A navigation menu that throws is worse than one that is merely
 * not in the top layer.
 *
 * Motion: the enter transition slides the sheet up and fades it in; under
 * `prefers-reduced-motion` the slide is dropped and only the opacity remains
 * (the translate utilities are gated behind `motion-safe:`). The exit is
 * deliberately instant — an exit transition would mean holding the dialog open
 * on a timer while focus has already gone back to the trigger, and a delayed
 * focus handoff is a real accessibility bug traded for 200ms of polish.
 */

/**
 * Everything focusable by default, plus anything opted in with `tabindex`.
 * `aria-disabled` elements are deliberately NOT excluded: reconciliation § 8
 * requires designed-disabled controls to stay focusable and announced.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusablesWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getAttribute('aria-hidden') !== 'true' && element.tabIndex >= 0
  )
}

/**
 * Attribute-based rather than property-based on purpose: where `showModal` is
 * missing the `open` *property* may be missing too, but the attribute is always
 * readable.
 */
function openDialog(dialog: HTMLDialogElement): void {
  if (dialog.hasAttribute('open')) return
  if (typeof dialog.showModal === 'function') dialog.showModal()
  else dialog.setAttribute('open', '')
}

function closeDialog(dialog: HTMLDialogElement): void {
  if (!dialog.hasAttribute('open')) return
  if (typeof dialog.close === 'function') dialog.close()
  else dialog.removeAttribute('open')
}

export type BottomSheetProps = {
  /** Controlled. The sheet never closes itself without telling the owner. */
  open: boolean
  onClose: () => void
  /** Accessible name for the dialog. */
  label: string
  /** Wire this to the trigger's `aria-controls`. */
  id?: string
  /**
   * Where focus goes on close. Defaults to whatever held focus when the sheet
   * opened, which is the trigger in every real interaction.
   */
  returnFocusTo?: RefObject<HTMLElement | null>
  /** Extra classes for the visible panel, not the dialog shell. */
  className?: string
  children: ReactNode
}

/** The dialog is a transparent, bottom-anchored shell; the panel is the chrome. */
const SHEET_SHELL = [
  'fixed inset-x-0 bottom-0 top-auto z-50 m-0 w-full max-w-none border-0 bg-transparent p-0',
  'text-[var(--fg-1)] opacity-0 data-[open=true]:opacity-100',
  'transition-[opacity,transform] duration-[var(--d-4)] ease-[var(--ease)]',
  // Reduced motion keeps the fade and drops the slide. Both translate
  // utilities are gated; neither may ever appear ungated.
  'motion-safe:translate-y-full motion-safe:data-[open=true]:translate-y-0',
  'backdrop:bg-[rgba(13,17,23,0.72)] backdrop:backdrop-blur-[2px]',
].join(' ')

const SHEET_PANEL = [
  'flex max-h-[86dvh] flex-col gap-6 overflow-y-auto overscroll-contain',
  'rounded-t-[var(--r-panel)] border-t border-[var(--line-1)] bg-[var(--bg-1)]',
  'px-[var(--page-x)] pt-4',
  // § 3.2 principle 5 — the sheet is the one component that genuinely sits in
  // the home-indicator's way.
  'pb-[calc(24px+env(safe-area-inset-bottom))]',
].join(' ')

export function BottomSheet({
  open,
  onClose,
  label,
  id,
  returnFocusTo,
  className,
  children,
}: BottomSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const restoreOverflowRef = useRef('')

  /**
   * The whole open/close lifecycle is one effect: the open branch runs on the
   * commit where `open` turns true, and its cleanup — which runs when `open`
   * turns false *and* on unmount — is the close. Splitting them would leave the
   * unmount-while-open path leaking a scroll lock.
   */
  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null || !open) return

    const previouslyFocused = document.activeElement
    restoreFocusRef.current = previouslyFocused instanceof HTMLElement ? previouslyFocused : null
    restoreOverflowRef.current = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    openDialog(dialog)

    // One frame with the sheet displayed but still translated, so the enter
    // transition has a start value to move from.
    const frame = requestAnimationFrame(() => {
      dialog.setAttribute('data-open', 'true')
    })

    const panel = panelRef.current
    if (panel !== null) focusablesWithin(panel)[0]?.focus()

    return () => {
      cancelAnimationFrame(frame)
      dialog.removeAttribute('data-open')
      closeDialog(dialog)
      document.body.style.overflow = restoreOverflowRef.current
      const target = returnFocusTo?.current ?? restoreFocusRef.current
      target?.focus()
    }
  }, [open, returnFocusTo])

  /**
   * The browser's close request (Escape, or a `formmethod="dialog"` submit)
   * would close the element without telling React. Prevent it and route through
   * the owner instead.
   */
  const handleCancel = useCallback(
    (event: SyntheticEvent<HTMLDialogElement>) => {
      event.preventDefault()
      onClose()
    },
    [onClose]
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDialogElement>) => {
      if (event.key === 'Escape') {
        // Handled here as well as in `cancel`, because environments without
        // `showModal` never fire a close request at all. Both paths land on the
        // same idempotent `onClose`.
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const panel = panelRef.current
      if (panel === null) return
      const focusables = focusablesWithin(panel)
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (first === undefined || last === undefined) {
        // Nothing to move to — keep focus inside rather than letting Tab escape
        // to the page behind.
        event.preventDefault()
        return
      }

      const active = document.activeElement
      const escaping = !panel.contains(active)

      if (event.shiftKey) {
        if (active === first || escaping) {
          event.preventDefault()
          last.focus()
        }
        return
      }
      if (active === last || escaping) {
        event.preventDefault()
        first.focus()
      }
    },
    [onClose]
  )

  /** A click that lands on the dialog itself landed on the backdrop. */
  const handleClick = useCallback(
    (event: MouseEvent<HTMLDialogElement>) => {
      if (event.target === event.currentTarget) onClose()
    },
    [onClose]
  )

  return (
    <dialog
      ref={dialogRef}
      id={id}
      aria-label={label}
      className={SHEET_SHELL}
      onCancel={handleCancel}
      onKeyDown={handleKeyDown}
      onClick={handleClick}
    >
      <div ref={panelRef} className={cx(SHEET_PANEL, className)}>
        <span
          aria-hidden="true"
          className="mx-auto h-1 w-10 flex-none rounded-[var(--r-pill)] bg-[var(--line-2)]"
        />
        {children}
      </div>
    </dialog>
  )
}
