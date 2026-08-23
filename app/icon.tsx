import { ImageResponse } from 'next/og'

import { BRAND } from '@/lib/brand'
import { THEME_COLOR_DARK, THEME_COLOR_LIGHT } from '@/lib/theme'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

/**
 * The site's icon — favicon, home-screen tile, manifest icon — generated the
 * way the OG card is, and neutral for the same §2 reason: this picture ends up
 * in browser chrome, task switchers and home screens, none of which cleared
 * the age gate. An initial on the house ground says which site this is and
 * nothing else.
 *
 * The initial comes off `BRAND.name`, never a literal: the name is still open
 * (Q7), and an icon that spells yesterday's brand is the kind of leftover
 * nobody rechecks. One size; browsers scale 512 down well, and a manifest
 * icon must be at least 192.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: THEME_COLOR_DARK,
          color: THEME_COLOR_LIGHT,
          fontSize: 320,
          borderRadius: 64,
        }}
      >
        {BRAND.name.charAt(0)}
      </div>
    ),
    size,
  )
}
