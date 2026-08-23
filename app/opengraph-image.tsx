import { ImageResponse } from 'next/og'

import { BRAND } from '@/lib/brand'
import { THEME_COLOR_DARK, THEME_COLOR_LIGHT } from '@/lib/theme'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = BRAND.tagline

/**
 * One OG card for the whole site, and that is a §2 decision rather than a
 * shortcut.
 *
 * A per-sheet card would be the obvious thing to build — the cigar's name, its
 * brand, its dimensions — and it is precisely what must not exist. An OG image
 * is rendered by whatever the link is pasted into: a group chat, a timeline, a
 * search preview. None of those cleared the age gate, and none of them can. A
 * card naming a brand therefore publishes that brand to an audience the gate
 * exists to keep it from, in a picture that outlives the page that would have
 * refused them.
 *
 * Placed at the app root, so it applies to gated routes too. Sharing a link to
 * a cigar sheet shows the site's name and what the site is — never the cigar's.
 * That is the behaviour we want, and the root position is what makes it the
 * default rather than something each new route has to remember.
 *
 * The colours come from `lib/theme.ts`, the one file allowed to hold a hex
 * value in TypeScript: `check-tokens.ts` fails the build on any other. An image
 * cannot read a CSS custom property, which is exactly why that exception exists.
 *
 * No custom font is loaded. `next/og` would need the file fetched at render
 * time, and a display face is not worth an extra fetch on a card that carries
 * eleven words — nor worth the failure mode where the fetch is what breaks the
 * image.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: THEME_COLOR_DARK,
          color: THEME_COLOR_LIGHT,
          padding: 80,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div
            style={{
              fontSize: 28,
              letterSpacing: 8,
              textTransform: 'uppercase',
              opacity: 0.6,
            }}
          >
            {BRAND.tagline}
          </div>
          <div style={{ fontSize: 132, lineHeight: 1 }}>{BRAND.name}</div>
        </div>

        {/* The disclaimer travels with the card, because the card travels
            further than the page. §2: the site informs, it does not sell. */}
        <div style={{ display: 'flex', fontSize: 26, opacity: 0.7 }}>{BRAND.disclaimer}</div>
      </div>
    ),
    size,
  )
}
