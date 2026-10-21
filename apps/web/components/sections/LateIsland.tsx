'use client'

import { useEffect, useRef, type ComponentType, type CSSProperties, type ReactNode } from 'react'
import { hydrateRoot, type Root } from 'react-dom/client'

/**
 * A below-the-fold interactive island whose code is not in the initial bundle.
 *
 * Why not `next/dynamic` or `React.lazy` + `Suspense`: `dynamic()` adds no boundary, so the lazy part would hold up the
 * hydration of the whole page; an explicit `Suspense` is outlined by React 19's Fizz (anything over about 500 bytes),
 * which moves the server HTML into a `hidden` div that only an inline script reveals, so the JS-off page would lose it.
 *
 * What this does instead:
 * - Server: `server` (the real component, rendered synchronously) sits inside a `display: contents` wrapper. The
 *   markup is the component's own, so the JS-off page keeps it and its box is final: nothing shifts later.
 * - Client, first render: the same wrapper with `dangerouslySetInnerHTML` and `suppressHydrationWarning`. React keeps
 *   the server's children untouched and hydrates the rest of the page without waiting for this code.
 * - Later, on the first of: the island nearing the viewport, a pointer / touch / focus / key event inside it, or (with
 *   no IntersectionObserver) a timer, the chunk is imported and `hydrateRoot` attaches to the existing DOM, so what
 *   the visitor typed, the focus and the scroll position all survive.
 * - Before hydration a visitor can already type and focus (plain fields). A submit is held back (otherwise the browser
 *   would reload the page with the fields in the URL) and a click on a control is remembered; both are replayed once
 *   the island is live.
 *
 * It is a separate React root: the island cannot read context from the page, and it receives its props as given.
 */

const WRAPPER_STYLE: CSSProperties = { display: 'contents' }
const NEAR_VIEWPORT = '600px 0px'
const FALLBACK_DELAY_MS = 2000
const INTERACTION_EVENTS = ['pointerdown', 'touchstart', 'focusin', 'keydown'] as const

export interface LateIslandProps<P extends object> {
  /** Loads the island's component; the dynamic import lives in the caller so the chunk is named there. */
  readonly load: () => Promise<ComponentType<P>>
  readonly props: P
  /** The component rendered on the server (`null` on the client, where the DOM already holds it). */
  readonly server: ReactNode
  /** Names the island in the DOM (`data-late-island`), for tests and debugging. */
  readonly name: string
}

function Mounted({ done }: { readonly done: () => void }): null {
  useEffect(() => {
    done()
  }, [done])
  return null
}

export function LateIsland<P extends object>({ load, props, server, name }: LateIslandProps<P>) {
  const hostRef = useRef<HTMLDivElement>(null)
  // The latest props and loader, read when the island finally hydrates.
  const latest = useRef({ load, props })
  latest.current = { load, props }

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return undefined

    let root: Root | null = null
    let started = false
    let live = false
    let cancelled = false
    let heldSubmit: HTMLFormElement | null = null
    let heldClick: HTMLElement | null = null
    let observer: IntersectionObserver | null = null
    let timer = 0

    const stopListening = (): void => {
      for (const type of INTERACTION_EVENTS) host.removeEventListener(type, onInteract, true)
      host.removeEventListener('submit', holdSubmit, true)
      host.removeEventListener('click', holdClick, true)
      observer?.disconnect()
      if (timer !== 0) window.clearTimeout(timer)
    }

    const replay = (): void => {
      live = true
      stopListening()
      const submit = heldSubmit
      const click = heldClick
      heldSubmit = null
      heldClick = null
      if (submit !== null) submit.requestSubmit()
      else click?.click()
    }

    function start(): void {
      if (started || cancelled) return
      started = true
      const { load: loader, props: islandProps } = latest.current
      loader().then(
        (Island) => {
          if (cancelled) return
          root = hydrateRoot(
            host as HTMLElement,
            <>
              <Island {...islandProps} />
              <Mounted done={replay} />
            </>,
          )
        },
        () => {
          // The chunk failed (deploy skew, network): the server markup stays as a plain, working form.
          live = true
          stopListening()
        },
      )
    }

    function onInteract(): void {
      start()
    }

    function holdSubmit(event: Event): void {
      if (live) return
      event.preventDefault()
      heldSubmit = event.target instanceof HTMLFormElement ? event.target : null
      start()
    }

    function holdClick(event: Event): void {
      if (live) return
      // A click on a plain control (button); links and fields behave natively.
      const control = event.target instanceof Element ? event.target.closest('button') : null
      // A submit button's click also raises `submit`, which is held and replayed on its own: remembering the click too
      // would send it twice.
      if (control !== null && control.type !== 'submit') heldClick = control
      start()
    }

    for (const type of INTERACTION_EVENTS) host.addEventListener(type, onInteract, { capture: true, passive: true })
    host.addEventListener('submit', holdSubmit, true)
    host.addEventListener('click', holdClick, true)

    if (typeof IntersectionObserver === 'function') {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) start()
        },
        { rootMargin: NEAR_VIEWPORT },
      )
      // The wrapper is `display: contents` and has no box of its own, so watch the server markup inside it.
      for (const child of Array.from(host.children)) observer.observe(child)
    } else {
      timer = window.setTimeout(start, FALLBACK_DELAY_MS)
    }

    return () => {
      cancelled = true
      stopListening()
      if (root !== null) {
        const mounted = root
        // Not synchronously: React forbids unmounting a root while it is rendering.
        queueMicrotask(() => mounted.unmount())
      }
    }
  }, [])

  if (typeof window === 'undefined') {
    return (
      <div data-late-island={name} style={WRAPPER_STYLE} suppressHydrationWarning>
        {server}
      </div>
    )
  }
  return (
    <div
      ref={hostRef}
      data-late-island={name}
      style={WRAPPER_STYLE}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: '' }}
    />
  )
}
