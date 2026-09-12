import en from '@/messages/en.json'
import fr from '@/messages/fr.json'

/**
 * All visible copy lives in `messages/*.json` (§0.10 of the brief).
 *
 * Importing the object rather than a `t('a.b.c')` helper is deliberate: the
 * TypeScript compiler then checks every key at build time, and a renamed
 * message breaks the build instead of rendering `undefined` in production.
 *
 * ## Two languages, one per build — and why the switch is not per request
 *
 * The QA session of 12 septembre 2026 asked for English (« traduire en anglais
 * au minimum le site »). The obvious shape — a cookie, a selector in the
 * header, a dictionary resolved per request — is **not available at the cost
 * it looks like**, and the reason is measurable rather than aesthetic:
 *
 *   - 162 files read `m`, and 116 of them do it at MODULE scope
 *     (`const copy = m.venues`), which is evaluated once at import and not
 *     per render;
 *   - a per-request locale must therefore be readable SYNCHRONOUSLY inside the
 *     render. In Next 16 it is not: `cookies()` and `headers()` return a
 *     Promise, the sync shim of Next 15 is gone, and a layout cannot wrap its
 *     children's render in an `AsyncLocalStorage` because RSC children are not
 *     rendered inside the layout's call stack;
 *   - 46 of those files are client components, which would need the dictionary
 *     as a prop or a provider — 133 KB of JSON in the RSC payload of every
 *     page, or prop-threading through 46 components.
 *
 * So the locale is a **build-time** choice: `NEXT_PUBLIC_LOCALE=en pnpm build`
 * produces the English site, served from its own domain. Zero call sites
 * change, both dictionaries are type-checked against each other, and the
 * reader gets a site that is actually in their language rather than a selector
 * that half-works. What it does NOT give is an in-page switch; that is
 * [ADR 0019](../../docs/adr/0019-deux-langues-un-build.md), with the estimate
 * and the trade it defers.
 *
 * `NEXT_PUBLIC_` matters: the value is inlined at build time, so the server
 * and the browser cannot disagree about it — which is the whole class of bug a
 * runtime locale would introduce.
 *
 * ## One word, and it is the brand's
 *
 * The English for the French « vitole » IS the commercial name — *vitola*. The
 * brand guard in `tooling/scripts/check-tokens.ts` found it on seven labels,
 * and it was right twice over: a `<dt>` reading "Vitola" on a site called
 * Vitola is ambiguous to a reader, where "Vitole" is not. So the bare label is
 * **Format**, the Spanish terms of art take the shape the vitolario screen
 * already uses ("Salida name", "Galera name"), and the word itself stays
 * lowercase in running text. The guard was not loosened, and must not be:
 * `messages/` is the file most likely to grow a hand-typed brand name.
 */
export const LOCALES = ['fr', 'en'] as const
export type Locale = (typeof LOCALES)[number]

/** French is the product's language (§0.10). English is the second build. */
export const DEFAULT_LOCALE: Locale = 'fr'

export type Messages = typeof fr

/**
 * Typed as `Record<Locale, Messages>` on purpose: a key missing from
 * `en.json` is a COMPILE error, not a run-time `undefined`. The other
 * direction — a key in `en.json` that French dropped — is what
 * `tests/unit/i18n-parity.test.ts` catches, because TypeScript allows excess
 * properties on a non-literal.
 */
const dictionaries: Record<Locale, Messages> = { fr, en }

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/**
 * The locale this build serves. Read once, at module load, from a value the
 * bundler has already inlined — so nothing here is per request and nothing can
 * drift between the server render and the hydration.
 *
 * An unknown value falls back to French rather than failing the build. The
 * build-time guard that DOES fail is in `next.config.ts`: a typo in the
 * variable name is worth a red build, and a red build is where it belongs.
 */
export const LOCALE: Locale = isLocale(process.env.NEXT_PUBLIC_LOCALE)
  ? process.env.NEXT_PUBLIC_LOCALE
  : DEFAULT_LOCALE

/** The `lang` attribute of `<html>`, and the tag `Intl` formats against. */
export const LANG: Record<Locale, string> = { fr: 'fr', en: 'en' }
export const INTL_LOCALE: Record<Locale, string> = { fr: 'fr-FR', en: 'en-GB' }

export const m = dictionaries[LOCALE]
