'use client'

// useSyncExternalStore: the theme in force is not React state, it is an
// attribute on <html> that a script in the <head> wrote before React existed.
// This subscribes to it — see the note below on why an effect is wrong here.
import { Moon, Sun } from 'lucide-react'
import { useSyncExternalStore } from 'react'

import { m } from '@/lib/i18n'
import {
  DEFAULT_THEME,
  isTheme,
  THEME_COLOR_DARK,
  THEME_COLOR_LIGHT,
  THEME_STORAGE_KEY,
  type Theme,
} from '@/lib/theme'

const copy = m.theme

/*
 * The store is the DOM, and the subscription is ours.
 *
 * `data-theme` on <html> only ever changes because `apply()` below changed it,
 * so there is no platform event to listen for — but the site renders two of
 * these buttons (the app header's and the landing header's), and the day both
 * are on one page they must not disagree about which icon to show. One set of
 * listeners, one truth.
 *
 * Reading it in an effect and calling setState is what this replaces:
 * `react-hooks/set-state-in-effect` refuses it, and rightly — the value is
 * available synchronously, so the effect was a render the page did not need.
 */
const listeners = new Set<() => void>()

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

function readTheme(): Theme {
  const current = document.documentElement.dataset.theme
  return isTheme(current) ? current : DEFAULT_THEME
}

/* What the server rendered, and what the first client render must match. The
   real value arrives immediately after, through the store. */
function serverTheme(): Theme {
  return DEFAULT_THEME
}

function apply(next: Theme): void {
  document.documentElement.dataset.theme = next
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next)
  } catch {
    /* A private window refuses storage. The theme still applies for this
       session, which is more useful than refusing to switch at all. */
  }
  /* The browser chrome follows the ground: on a phone the address bar is part
     of the page, and leaving it dark over a pale site is the seam everybody
     notices and nobody reports. */
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', next === 'light' ? THEME_COLOR_LIGHT : THEME_COLOR_DARK)

  for (const onChange of listeners) onChange()
}

/**
 * The one control that changes how the whole site looks.
 *
 * It renders the theme it will switch TO, not the one in force: a moon means
 * "go dark", a sun means "go light". `aria-label` says the same thing in
 * words, because a two-state icon button that differs only by glyph is
 * unreadable to a screen reader.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, readTheme, serverTheme)

  const goingLight = theme === 'dark'
  const Icon = goingLight ? Sun : Moon

  return (
    <button
      type="button"
      onClick={() => apply(goingLight ? 'light' : 'dark')}
      aria-label={goingLight ? copy.toLight : copy.toDark}
      className={`text-ink-muted hover:text-ink inline-flex size-9 items-center justify-center transition-colors duration-(--duration-quick) ${className ?? ''}`}
    >
      <Icon aria-hidden="true" strokeWidth={1.5} className="size-4" />
    </button>
  )
}
