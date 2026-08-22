import type { Metadata, Viewport } from 'next'
import { Bodoni_Moda, Inter, JetBrains_Mono, Marcellus } from 'next/font/google'
import type { ReactNode } from 'react'

import { HealthNotice } from '@/components/compliance/health-notice'
import { SkipLink } from '@/components/layout/skip-link'
import { BRAND } from '@/lib/brand'
import { THEME_COLOR_DARK } from '@/lib/theme'

import './globals.css'

/**
 * Fonts are loaded with next/font/google, which downloads them at BUILD time and
 * serves them from our own origin. No visitor request ever reaches Google, so no
 * IP address leaves for a third party — this is a GDPR decision as much as a
 * performance one (§2, §3).
 */
const bodoni = Bodoni_Moda({
  subsets: ['latin'],
  variable: '--font-bodoni',
  display: 'swap',
})

const marcellus = Marcellus({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-marcellus',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s — ${BRAND.name}`,
  },
  description: BRAND.tagline,
  applicationName: BRAND.name,
  // Nothing is indexable until the legal review of §2 is signed off (Q1).
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: THEME_COLOR_DARK,
  // Dark is the brand ground, not a preference — see app/globals.css.
  colorScheme: 'dark',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang={BRAND.defaultLanguage}
      className={`${bodoni.variable} ${marcellus.variable} ${inter.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh antialiased">
        <SkipLink />
        {/* Permanent, non-dismissible, above everything (§2). */}
        <HealthNotice />
        {children}
      </body>
    </html>
  )
}
