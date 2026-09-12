/**
 * The two colour values that must exist in TypeScript rather than CSS, and the
 * plumbing of the theme switch.
 *
 * `<meta name="theme-color">` and OG image generation cannot read a CSS custom
 * property, so these are the one legitimate exception to "every colour lives in
 * app/globals.css". tooling/scripts/check-tokens.ts allowlists this file and
 * nothing else — keep it to these constants.
 *
 * They must stay in sync with --color-oscuro and --color-tabac-pale.
 */
export const THEME_COLOR_DARK = '#161210'
export const THEME_COLOR_LIGHT = '#f4ece0'

export const THEMES = ['dark', 'light'] as const
export type Theme = (typeof THEMES)[number]

/** Dark is the brand ground, not a preference — see app/globals.css. */
export const DEFAULT_THEME: Theme = 'dark'

/**
 * Where the choice lives: `localStorage`, read by the bootstrap script below
 * before first paint.
 *
 * NOT a cookie, and the reason is measured rather than aesthetic. Reading a
 * cookie to decide the theme means reading it in the root layout, which makes
 * every route dynamic — including the landing page and the journal, the two
 * surfaces whose Lighthouse SEO of 100 and 0,7 s LCP are P6's exit criterion.
 * A four-line script in `<head>` costs nothing and keeps them static.
 *
 * The consequence, stated: the choice is per-device and per-browser, and it
 * does not travel with the account. `profile_settings.preferences` would carry
 * it, and that is the upgrade the day a member asks for it.
 */
export const THEME_STORAGE_KEY = 'vitola.theme'

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}

/**
 * Runs in `<head>`, before the body paints, so a member who chose the light
 * theme never sees the dark ground flash first.
 *
 * It writes `data-theme` on `<html>` — an attribute React does not own, since
 * the root element carries `suppressHydrationWarning` — and nothing else. A
 * value it does not recognise is ignored rather than corrected: the default is
 * already right.
 */
export const THEME_BOOTSTRAP = `try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`
