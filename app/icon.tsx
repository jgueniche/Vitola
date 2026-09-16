import { ImageResponse } from 'next/og'

import { INITIAL_PATH_TILE, MARK_VIEWBOX, RING_RADIUS, ringStrokeWidth } from '@/lib/mark'
import { THEME_BRASS, THEME_COLOR_DARK, THEME_COLOR_LIGHT } from '@/lib/theme'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

/**
 * The ring fills four fifths of the tile, which is more than a mark usually
 * takes. It is what a favicon needs: at 16 px a polite margin costs the two
 * pixels that decide whether the ring is a ring or a dot.
 */
const RING_SIZE = 410

/**
 * The site's icon — favicon, home-screen tile, manifest icon — and the first
 * surface of the mark, « le cepo ».
 *
 * Neutral for the §2 reason that has not moved: this picture ends up in browser
 * chrome, task switchers and home screens, none of which cleared the age gate.
 * A ring and an initial say which site this is and nothing else — no cigar, no
 * smoke, no brand.
 *
 * Two things are deliberate and easy to undo by accident:
 *
 * 1. The TILE CUT, asked for explicitly rather than derived from 512. This
 *    image is generated once and scaled down by whatever displays it, so its
 *    rendered size is not the size it is looked at: letting 512 choose would
 *    put a 4 px hairline on a picture the browser shows at 16, where it
 *    disappears. The tile cut is 6 % of the diameter, which lands on the
 *    system's 1.5 px at the 32 px a retina favicon actually uses.
 *
 * 2. The initial is a PATH, not `BRAND.name.charAt(0)` as it was before. This
 *    renderer has no webfont, so a letter here would be set in whatever
 *    Satori's default is — and a logo whose face is chosen by the renderer is
 *    not a logo. The cost is that the mark no longer follows a rename: the
 *    name is still open (Q7), and `tests/unit/mark.test.ts` is what makes that
 *    break loud instead of silent.
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
          borderRadius: 64,
        }}
      >
        <svg
          width={RING_SIZE}
          height={RING_SIZE}
          viewBox={`0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}`}
          fill="none"
        >
          <circle
            cx={MARK_VIEWBOX / 2}
            cy={MARK_VIEWBOX / 2}
            r={RING_RADIUS}
            stroke={THEME_BRASS}
            strokeWidth={ringStrokeWidth(RING_SIZE, 'tile')}
          />
          <path d={INITIAL_PATH_TILE} fill={THEME_COLOR_LIGHT} />
        </svg>
      </div>
    ),
    size,
  )
}
