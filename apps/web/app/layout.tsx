import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { fontVariables } from './fonts'
import './globals.css'

// Minimal on purpose — Task 17 owns the real metadata, JSON-LD and sitemap.
export const metadata: Metadata = {
  title: 'Wieslaw Samushonga',
  description: 'Tech Lead and Senior Software Engineer.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="bg-[var(--bg-0)] text-[var(--fg-1)]">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <main id="main">{children}</main>
      </body>
    </html>
  )
}
