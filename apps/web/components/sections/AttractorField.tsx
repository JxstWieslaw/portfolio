'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { attractorStore, nearestToCentre } from '@/lib/assembly/attractor-store'

/**
 * The Selected Work grid's hover hook — journey spec § 3.3.
 *
 * Writes the hovered `[data-attract]` card into the attractor store; the
 * Assembly's lattice drifts toward it. On touch (`pointer: coarse`) there is
 * no hover, so the card nearest the viewport centre is the attractor while
 * the grid is on screen. No React state: the store is read by the frame loop.
 *
 * Nothing here knows about three; when the WebGL layer never mounts the
 * store is written and read by nobody, and the cards behave as before.
 */
export function AttractorField({ className, children }: { readonly className?: string; readonly children: ReactNode }) {
  const grid = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = grid.current
    if (!element) return undefined
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches

    // The card's box is measured here, on the events that can move it, so the
    // frame loop never reads layout.
    let current: Element | null = null
    let frame = 0
    const publish = (): void => {
      frame = 0
      if (!current) {
        attractorStore.set(null)
        return
      }
      const r = current.getBoundingClientRect()
      attractorStore.set({ left: r.left, top: r.top, width: r.width, height: r.height })
    }
    const schedule = (): void => {
      if (!frame) frame = requestAnimationFrame(publish)
    }
    const pick = (): void => {
      const bounds = element.getBoundingClientRect()
      if (bounds.bottom < 0 || bounds.top > window.innerHeight) {
        current = null
        return
      }
      const cards = Array.from(element.querySelectorAll('[data-attract]'))
      const index = nearestToCentre(
        cards.map((card) => card.getBoundingClientRect()),
        window.innerWidth,
        window.innerHeight,
      )
      current = index < 0 ? null : (cards[index] ?? null)
    }
    const move = (): void => {
      if (coarse) pick()
      schedule()
    }

    const over = (event: PointerEvent): void => {
      const card = (event.target as Element | null)?.closest('[data-attract]') ?? null
      if (card && element.contains(card)) {
        current = card
        publish()
      }
    }
    const out = (event: PointerEvent): void => {
      const card = (event.target as Element | null)?.closest('[data-attract]')
      const next = (event.relatedTarget as Element | null)?.closest?.('[data-attract]') ?? null
      if (card && next !== card) {
        current = null
        publish()
      }
    }
    if (coarse) move()
    else {
      element.addEventListener('pointerover', over)
      element.addEventListener('pointerout', out)
    }
    window.addEventListener('scroll', move, { passive: true })
    window.addEventListener('resize', move)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      element.removeEventListener('pointerover', over)
      element.removeEventListener('pointerout', out)
      window.removeEventListener('scroll', move)
      window.removeEventListener('resize', move)
      attractorStore.set(null)
    }
  }, [])

  return (
    <div ref={grid} className={className}>
      {children}
    </div>
  )
}
