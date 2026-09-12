import en from '@/messages/en.json'
import fr from '@/messages/fr.json'
import { DEFAULT_LOCALE, INTL_LOCALE, LANG, LOCALE, LOCALES, isLocale } from '@/lib/i18n'

import { describe, expect, it } from 'vitest'

/**
 * The two dictionaries, checked against each other.
 *
 * `lib/i18n` types them as `Record<Locale, Messages>`, so the compiler already
 * refuses an English key that French has and English lacks. It does NOT refuse
 * the other direction: TypeScript allows excess properties on a value that is
 * not a fresh object literal, so a key French drops keeps living in `en.json`,
 * read by nobody, until somebody translates it again by accident. That is the
 * first thing checked here.
 *
 * The second is the interpolations. Every message that carries `{count}` or
 * `{max}` is formatted by a call site that passes exactly those names. A
 * translation that renames one — `{n}` for `{count}`, the plausible slip — does
 * not fail to compile and does not throw: it renders the brace and its word,
 * verbatim, in the middle of a sentence. There is no cheaper place to catch it.
 */

type Tree = { [key: string]: string | string[] | Tree }

/*
 * A path is an ARRAY of segments, never a dotted string, and the first draft of
 * this file learned why the hard way: `moderation.desk.surfaces` is keyed by
 * `schema.table` — "public.comments", "shop.products" — so splitting a path on
 * "." walks into keys that do not exist. A dictionary is allowed keys with dots
 * in them; a path encoding is not allowed to assume otherwise.
 */
type Path = readonly string[]

function paths(node: Tree, prefix: Path = []): Path[] {
  return Object.entries(node).flatMap(([key, value]) => {
    const here = [...prefix, key]
    return typeof value === 'object' && !Array.isArray(value) ? paths(value as Tree, here) : [here]
  })
}

function at(node: Tree, path: Path): unknown {
  return path.reduce<unknown>((acc, key) => (acc as Tree)[key], node)
}

const label = (path: Path) => path.join(' › ')

const PLACEHOLDER = /\{([a-zA-Z][a-zA-Z0-9]*)\}/g

function placeholders(value: unknown): string[] {
  const texts = Array.isArray(value) ? value : [value]
  const names = texts
    .filter((text): text is string => typeof text === 'string')
    // `match[1]` is `string | undefined` under noUncheckedIndexedAccess: the
    // group is not optional in the pattern, but the compiler cannot know that.
    .flatMap((text) =>
      [...text.matchAll(PLACEHOLDER)].flatMap((match) => (match[1] ? [match[1]] : [])),
    )
  return [...new Set(names)].sort()
}

const french = fr as unknown as Tree
const english = en as unknown as Tree

describe('the two dictionaries', () => {
  it('carry exactly the same keys', () => {
    const inFrench = new Set(paths(french).map(label))
    const inEnglish = new Set(paths(english).map(label))

    // Only this direction can escape the compiler; the other is a build error.
    expect([...inEnglish].filter((path) => !inFrench.has(path))).toEqual([])
    expect([...inFrench].filter((path) => !inEnglish.has(path))).toEqual([])
  })

  it('interpolate the same names in the same messages', () => {
    const drifted = paths(french)
      .map((path) => ({
        path: label(path),
        fr: placeholders(at(french, path)),
        en: placeholders(at(english, path)),
      }))
      .filter(({ fr: a, en: b }) => a.join(',') !== b.join(','))

    expect(drifted).toEqual([])
  })

  it('leaves no message empty', () => {
    const empty = paths(english)
      .filter((path) => {
        const value = at(english, path)
        const texts = Array.isArray(value) ? value : [value]
        return texts.some((text) => typeof text !== 'string' || text.trim() === '')
      })
      .map(label)

    expect(empty).toEqual([])
  })

  /*
   * Not a translation check but the other half of the mechanism: a build whose
   * locale is unknown must not quietly serve French. `next.config.ts` fails it;
   * this pins the vocabulary that guard reads.
   */
  it('declares one language tag and one Intl locale per locale', () => {
    expect(LOCALES).toContain(DEFAULT_LOCALE)
    expect(LOCALES.every((locale) => isLocale(locale))).toBe(true)
    expect(isLocale('de')).toBe(false)
    expect(Object.keys(LANG).sort()).toEqual([...LOCALES].sort())
    expect(Object.keys(INTL_LOCALE).sort()).toEqual([...LOCALES].sort())
    expect(isLocale(LOCALE)).toBe(true)
  })
})
