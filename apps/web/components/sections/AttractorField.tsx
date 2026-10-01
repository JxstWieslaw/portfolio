'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { attractorStore, nearestToCentre } from '@/lib/assembly/attractors'

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

    if (!coarse) {
      const over = (event: PointerEvent): void => {
        const card = (event.target as Element | null)?.closest('[data-attract]') ?? null
        if (card && element.contains(card)) attractorStore.set(card)
      }
      const out = (event: PointerEvent): void => {
        const card = (event.target as Element | null)?.closest('[data-attract]')
        const next = (event.relatedTarget as Element | null)?.closest?.('[data-attract]') ?? null
        if (card && next !== card) attractorStore.set(null)
      }
      element.addEventListener('pointerover', over)
      element.addEventListener('pointerout', out)
      return () => {
        element.removeEventListener('pointerover', over)
        element.removeEventListener('pointerout', out)
        attractorStore.set(null)
      }
    }

    let frame = 0
    const pick = (): void => {
      frame = 0
      const bounds = element.getBoundingClientRect()
      if (bounds.bottom < 0 || bounds.top > window.innerHeight) {
        attractorStore.set(null)
        return
      }
      const cards = Array.from(element.querySelectorAll('[data-attract]'))
      const index = nearestToCentre(
        cards.map((card) => card.getBoundingClientRect()),
        window.innerWidth,
        window.innerHeight,
      )
      attractorStore.set(index < 0 ? null : (cards[index] ?? null))
    }
    const schedule = (): void => {
      if (!frame) frame = requestAnimationFrame(pick)
    }
    schedule()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      attractorStore.set(null)
    }
  }, [])

  return (
    <div ref={grid} className={className}>
      {children}
    </div>
  )
}
