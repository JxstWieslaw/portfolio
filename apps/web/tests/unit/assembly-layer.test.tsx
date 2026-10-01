import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `next/dynamic` is replaced so the test can see whether the three-importing
 * chunk was ever asked for. The stand-in never invokes the loader: jsdom has
 * no WebGL, and three must stay out of every unit test.
 */
const dynamicProbe = vi.hoisted(() => ({ loaders: 0, renders: 0 }))

vi.mock('next/dynamic', () => ({
  default: () => {
    dynamicProbe.loaders += 1
    return function AssemblyCanvasStandIn() {
      dynamicProbe.renders += 1
      return <div data-testid="assembly-canvas" />
    }
  },
}))

import { AssemblyLayer } from '@/components/three/AssemblyLayer'

/** Past the `scheduleIdle` macrotask fallback. */
const AFTER_IDLE_MS = 40

let webgl2 = false

function stubMatchMedia(matching: readonly string[]): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: matching.includes(query),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

async function settle(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

beforeEach(() => {
  dynamicProbe.renders = 0
  webgl2 = false
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: (kind: string) => (kind === '2d' ? {} : webgl2 ? {} : null),
  })
  Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 8 })
  stubMatchMedia([])
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): [] {
        return []
      }
    },
  )
  window.history.replaceState({}, '', '/')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('data-gl')
})

describe('AssemblyLayer', () => {
  it('renders its fixed, hidden, click-through container without WebGL2 and never asks for the chunk', async () => {
    const { container } = render(<AssemblyLayer />)
    await settle(AFTER_IDLE_MS)

    const layer = container.firstElementChild
    expect(layer).toHaveAttribute('aria-hidden', 'true')
    expect(layer?.className).toContain('fixed')
    expect(layer?.className).toContain('inset-0')
    expect(layer?.className).toContain('pointer-events-none')
    expect(layer).toHaveAttribute('data-assembly', 'idle')
    expect(container.querySelector('[data-testid="assembly-canvas"]')).toBeNull()
    expect(dynamicProbe.renders).toBe(0)
    expect(document.documentElement.hasAttribute('data-gl')).toBe(false)
  })

  it('mounts the canvas after an idle period once WebGL2 is available', async () => {
    webgl2 = true
    const { container } = render(<AssemblyLayer />)
    expect(container.querySelector('[data-testid="assembly-canvas"]')).toBeNull()
    await settle(AFTER_IDLE_MS)
    expect(container.querySelector('[data-testid="assembly-canvas"]')).not.toBeNull()
    expect(container.firstElementChild).toHaveAttribute('data-assembly', 'live')
  })

  it('never mounts under prefers-reduced-motion, even with WebGL2', async () => {
    webgl2 = true
    stubMatchMedia(['(prefers-reduced-motion: reduce)'])
    const { container } = render(<AssemblyLayer />)
    await settle(AFTER_IDLE_MS)
    expect(container.querySelector('[data-testid="assembly-canvas"]')).toBeNull()
    expect(dynamicProbe.renders).toBe(0)
  })

  it('honours the ?nogl=1 kill switch', async () => {
    webgl2 = true
    window.history.replaceState({}, '', '/?nogl=1')
    const { container } = render(<AssemblyLayer />)
    await settle(AFTER_IDLE_MS)
    expect(container.querySelector('[data-testid="assembly-canvas"]')).toBeNull()
  })

  it('registers exactly one dynamic chunk for the whole module', () => {
    expect(dynamicProbe.loaders).toBe(1)
  })
})
