/**
 * The mark — « le cepo » : a ring with the initial inside it.
 *
 * GEOMETRY, NOT A GLYPH. The initial is a path, not text set in the display
 * face, and that is the load-bearing decision of this file. Three renderers
 * draw this mark: a React component in the interface, and two `next/og` images
 * — the icon and the OG card — which run in a renderer with no webfont and no
 * CSS custom properties. A path is the only form all three can share. It is
 * also the only form that cannot fail to arrive: a logo that waits on a font
 * is a logo that is sometimes absent, and the surface where that shows first
 * is the favicon.
 *
 * The price is named in `tests/unit/mark.test.ts`: the path is a drawn V, not
 * an initial computed from the brand name. Renaming the brand (Q7 is still
 * open) breaks the mark, and the test is what makes that break loud instead of
 * silent.
 *
 * Everything below is expressed in the 120-unit viewBox, whose full width is
 * the ring's diameter D. Callers pass a rendered size in CSS pixels.
 */

/** The viewBox is D. Every coordinate here is a fraction of the diameter. */
export const MARK_VIEWBOX = 120

/**
 * One drawing, three cuts, because the ring's stroke has to do three things a
 * single formula cannot do at once.
 *
 *   regular (28-96 px)  the interface. A CONSTANT 1.5 px — the same hairline
 *                       as every rule on the site, so the mark sits in a
 *                       header the way a <Band /> sits in a card.
 *   display (>= 96 px)  the mark as an object. 1.33 % of D, so the stroke
 *                       grows with the drawing: a fixed 1.5 px on a 400 px
 *                       ring is a thread, not a hairline.
 *   tile    (< 28 px)   the favicon. 6 % of D, so the ring survives being
 *                       small: 1.33 % of 16 px is a fifth of a pixel, and a
 *                       fifth of a pixel is nothing.
 *
 * So 1.5 px is NOT a promise across the range — it is what the interface band
 * holds exactly, and what the other two are measured against. Stated plainly
 * because the first version of this comment claimed the opposite and had the
 * poster and the favicon the wrong way round.
 */
export type MarkCut = 'display' | 'regular' | 'tile'

export function markCut(size: number): MarkCut {
  if (size >= 96) return 'display'
  if (size >= 28) return 'regular'
  return 'tile'
}

/**
 * The ring's stroke, in viewBox units, for a mark rendered at `size` pixels.
 *
 * `cut` is an override, and it exists for one real case: a `next/og` image is
 * generated once at 512 and then scaled down by whatever displays it. Its
 * rendered size is not the size it is looked at, so the icon asks for the tile
 * cut explicitly rather than letting 512 choose the display one — which would
 * put a 4 px hairline on a picture the browser shows at 16.
 */
export function ringStrokeWidth(size: number, cut: MarkCut = markCut(size)): number {
  switch (cut) {
    /* 1.33 % of D. Grows with the mark: 1.5 px at D = 112, 5.3 px at D = 400. */
    case 'display':
      return 1.6
    /* Exactly 1.5 CSS pixels, expressed in viewBox units. */
    case 'regular':
      return (1.5 * MARK_VIEWBOX) / size
    /* 6 % of D: 1.6 px at the top of the band, 0.96 px at 16. */
    case 'tile':
      return 7.2
  }
}

/** The ring itself. Radius 50 of 120 leaves the stroke room inside the box. */
export const RING_RADIUS = 50

/**
 * The initial, drawn rather than set: a didone V, whose contrast between the
 * thick left stroke and the hairline right one is half of what makes the mark
 * the site's and not anyone's.
 *
 * Three subpaths — the two top serifs, then the body. Cap height is 38.6 units
 * (0.32 D), centred on the ring: the optical centre of a V is not the centre
 * of its bounding box, and placing the cap directly is how that is settled
 * once instead of nudged per renderer.
 */
export const INITIAL_PATH =
  'M40 40.7h11.6v1.7H40Z' +
  'M69 40.7h11.4v1.7H69Z' +
  'M42.8 42.4h6l12.8 29.2 12-29.2h2.2L62 79.3h-3.8Z'

/**
 * The same V for the tile cut: taller, thicker, blunter serifs.
 *
 * Not a scaled copy — a scaled copy is exactly what fails. At 16 px the serifs
 * of the display cut measure a fifth of a pixel and disappear, taking the
 * didone contrast with them and leaving a grey smudge in a ring.
 *
 * It is therefore a DIFFERENT letter, not the same one bolder: cap height 44
 * units (0.37 D) against 38.6 (0.32 D), stems half again as wide, serifs
 * blunt. Said here because « the initial is 0.46 D » is otherwise read as
 * covering all three cuts, and it covers two.
 */
export const INITIAL_PATH_TILE =
  'M36.5 38h15v3h-15Z' +
  'M68.5 38h15v3h-15Z' +
  'M40 41h8l13 30 11-30h4L62.5 82h-5Z'

export function initialPath(cut: MarkCut): string {
  return cut === 'tile' ? INITIAL_PATH_TILE : INITIAL_PATH
}

/**
 * The horizontal lockup's one ratio: D = 1.75 × the wordmark's font size, and
 * the gap is 0.29 D. A cramped header reduces the whole lockup; it never
 * flattens the ring on its own.
 */
export const LOCKUP_RING_RATIO = 1.75
export const LOCKUP_GAP_RATIO = 0.29

/**
 * `.wordmark` is set to 1.5rem in app/globals.css, and the lockup needs that
 * as a number to derive D from it. tests/unit/mark.test.ts reads the
 * stylesheet and fails if the two drift apart — the alternative is a mark
 * that quietly stops matching the word it stands next to.
 */
export const WORDMARK_FONT_SIZE = 24

export function lockupRingSize(wordmarkFontSize: number): number {
  return Math.round(wordmarkFontSize * LOCKUP_RING_RATIO)
}
