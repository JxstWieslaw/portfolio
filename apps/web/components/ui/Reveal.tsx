'use client'

import { type HTMLAttributes, type ReactNode, type RefObject, useEffect, useRef } from 'react'

/**
 * The reveal system — reconciliation § 7, transcribed from the export's
 * `setupMotion()` (design-home.md § 14).
 *
 * Plain CSS transitions plus one shared IntersectionObserver. **No animation
 * library**: Motion is deliberately out of M0, and this needs 60 lines.
 *
 *   hidden      opacity: 0; transform: translateY(24px)
 *   revealed    opacity: 1; transform: none
 *   transition  560ms cubic-bezier(.2,.8,.2,1), delayed by batch position * 70ms
 *               (capped at 3 steps; see `batchStaggerMs`)
 *   observer    threshold 0.12, rootMargin '0px 0px -4% 0px'
 *
 * Two properties carry the whole design, and both are availability guarantees
 * rather than animation polish:
 *
 * 1. **The above-fold guard.** An element whose top is already within
 *    `innerHeight * 0.92` is never hidden in the first place. Nothing visible
 *    on first paint is ever gated on the observer, so there is no FOUC and no
 *    dependence on observer support for the content the visitor lands on.
 *
 * 2. **The 4000ms hard deadline.** A 450ms poll re-reads geometry from the
 *    live DOM — it survives remounts and never closes over a stale node — and
 *    once 4s have passed it reveals everything still hidden regardless of
 *    geometry, then stops itself. Without it a failed or missing observer
 *    leaves the page permanently invisible: an availability bug dressed as an
 *    animation.
 *
 * Under `prefers-reduced-motion: reduce` the whole system bails out at
 * registration, so nothing is ever hidden and no timers start.
 *
 * The hidden state is applied by this module and never by the stylesheet, so
 * markup ships visible: a thrown error, a disabled script or a crawler can
 * never blank the page.
 */

const HIDDEN_OPACITY = '0'
const HIDDEN_TRANSFORM = 'translateY(24px)'
const DURATION_MS = 560
const EASING = 'cubic-bezier(.2,.8,.2,1)'
const STAGGER_MS = 70
/** The stagger stops growing after this many steps: 3 * 70 = 210ms at most. */
const MAX_STAGGER_STEPS = 3
const POLL_MS = 450
const DEADLINE_MS = 4000
/** Anything at or above this fraction of the viewport is never hidden. */
const ABOVE_FOLD_RATIO = 0.92
/** The poll reveals anything that has scrolled inside this fraction. */
const POLL_REVEAL_RATIO = 0.96

const OBSERVER_OPTIONS: IntersectionObserverInit = {
  threshold: 0.12,
  rootMargin: '0px 0px -4% 0px',
}

/**
 * The delay for the element at `position` inside one batch of elements that
 * enter the viewport together (one observer callback, or one poll tick).
 *
 * Position in the batch, not the DOM sibling index: a list item that scrolls in
 * alone has position 0 and waits for nothing, however far down its list it
 * sits. The step count is capped, so a big batch carries at most 210ms of
 * stagger instead of trailing off for a second.
 */
export function batchStaggerMs(position: number): number {
  if (!Number.isFinite(position) || position <= 0) return 0
  return Math.min(Math.floor(position), MAX_STAGGER_STEPS) * STAGGER_MS
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * One controller for the whole page: one observer, one interval, one clock.
 * Per-element state lives on the element as `data-revealed`, which keeps it
 * inspectable in devtools and assertable in a test.
 */
class RevealController {
  private readonly elements = new Set<HTMLElement>()
  private observer: IntersectionObserver | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private startedAt = 0

  register(element: HTMLElement): void {
    this.elements.add(element)
    element.setAttribute('data-reveal', '')
    if (this.startedAt === 0) this.startedAt = Date.now()

    this.hideIfBelowFold(element)

    if (this.observer === null && typeof IntersectionObserver !== 'undefined') {
      this.observer = new IntersectionObserver((entries) => {
        const batch: HTMLElement[] = []
        for (const entry of entries) {
          if (entry.isIntersecting && entry.target instanceof HTMLElement) {
            batch.push(entry.target)
          }
        }
        this.revealBatch(batch)
      }, OBSERVER_OPTIONS)
    }

    // Above-fold elements are already revealed, so they are never observed.
    if (this.observer !== null && element.dataset['revealed'] !== 'true') {
      this.observer.observe(element)
    }

    this.startPolling()
  }

  unregister(element: HTMLElement): void {
    this.elements.delete(element)
    this.observer?.unobserve(element)
    if (this.elements.size === 0) this.destroy()
  }

  destroy(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.observer?.disconnect()
    this.observer = null
    this.elements.clear()
    this.startedAt = 0
  }

  private hideIfBelowFold(element: HTMLElement): void {
    if (element.dataset['revealed'] === 'true') return
    if (element.getBoundingClientRect().top > window.innerHeight * ABOVE_FOLD_RATIO) {
      element.style.opacity = HIDDEN_OPACITY
      element.style.transform = HIDDEN_TRANSFORM
    } else {
      element.dataset['revealed'] = 'true'
    }
  }

  /** Reveals elements that entered together, staggered by position in the batch. */
  private revealBatch(batch: readonly HTMLElement[]): void {
    let position = 0
    for (const element of batch) {
      if (element.dataset['revealed'] === 'true') continue
      this.reveal(element, batchStaggerMs(position))
      position += 1
    }
  }

  private reveal(element: HTMLElement, delay: number): void {
    element.dataset['revealed'] = 'true'

    element.style.transition =
      `opacity ${DURATION_MS}ms ${EASING} ${delay}ms, ` +
      `transform ${DURATION_MS}ms ${EASING} ${delay}ms`
    element.style.opacity = '1'
    element.style.transform = 'none'
    this.observer?.unobserve(element)
  }

  private startPolling(): void {
    if (this.timer !== null) return
    this.timer = setInterval(() => this.tick(), POLL_MS)
  }

  private tick(): void {
    const late = Date.now() - this.startedAt > DEADLINE_MS
    const pending = Array.from(this.elements).filter(
      (element) => element.dataset['revealed'] !== 'true'
    )

    if (pending.length === 0) {
      // Nothing left to do, but the deadline has not passed and more elements
      // may still mount; only stop once both are true.
      if (late && this.timer !== null) {
        clearInterval(this.timer)
        this.timer = null
      }
      return
    }

    this.revealBatch(
      pending.filter(
        (element) =>
          late || element.getBoundingClientRect().top < window.innerHeight * POLL_REVEAL_RATIO
      )
    )
  }
}

let controller: RevealController | null = null

function getController(): RevealController {
  controller ??= new RevealController()
  return controller
}

/**
 * Tears the shared controller down. Exported for tests, which need each case
 * to start from a clean observer, clock and element set.
 */
export function resetRevealSystem(): void {
  controller?.destroy()
  controller = null
}

/**
 * Attaches an element to the reveal system.
 *
 * Use the hook rather than the `Reveal` wrapper whenever the element itself
 * carries layout — a bento card that needs its own `grid-column`, a timeline
 * `<li>` — because an extra wrapper would break the grid it sits in.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(): RefObject<T | null> {
  const ref = useRef<T>(null)

  useEffect(() => {
    const element = ref.current
    if (element === null) return
    if (prefersReducedMotion()) return

    const system = getController()
    system.register(element)
    return () => system.unregister(element)
  }, [])

  return ref
}

export type RevealTag =
  | 'div'
  | 'section'
  | 'article'
  | 'aside'
  | 'figure'
  | 'li'
  | 'ol'
  | 'ul'
  | 'dl'
  | 'form'
  | 'p'

export type RevealProps = {
  children: ReactNode
  as?: RevealTag
  className?: string
} & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'>

/**
 * The wrapper form. Renders a real element carrying `data-reveal`, which is
 * what the shared controller keys on.
 */
export function Reveal({ children, as = 'div', className, ...rest }: RevealProps) {
  const ref = useReveal<HTMLDivElement>()
  const Tag = as as 'div'

  return (
    <Tag {...rest} ref={ref} data-reveal="" className={className}>
      {children}
    </Tag>
  )
}
