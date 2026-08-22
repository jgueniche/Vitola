/**
 * The two colour values that must exist in TypeScript rather than CSS.
 *
 * `<meta name="theme-color">` and OG image generation cannot read a CSS custom
 * property, so these are the one legitimate exception to "every colour lives in
 * app/globals.css". tooling/scripts/check-tokens.ts allowlists this file and
 * nothing else — keep it to these constants.
 *
 * They must stay in sync with --color-oscuro and --color-papier.
 */
export const THEME_COLOR_DARK = '#161210'
export const THEME_COLOR_LIGHT = '#f3eee4'
