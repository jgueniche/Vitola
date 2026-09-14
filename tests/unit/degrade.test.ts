import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { accessory, orElse } from '@/lib/degrade'

/**
 * ADR 0020 — the subject of a page fails frankly, its accompaniment renders
 * empty and says so.
 *
 * Two halves. The first tests the helper. The second tests the RULE, by
 * reading the query files: the whole design rests on a failure never being
 * spelled like a refusal, and that is a property of code nobody can hold in
 * their head across seventeen files.
 */

beforeEach(() => {
  /* `accessory` logs the failure at error level, deliberately. The test
     asserts it happens; it should not print into the run. */
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('accessory', () => {
  it('passes a value through', async () => {
    const result = await accessory(Promise.resolve([1, 2, 3]))
    expect(result.ok).toBe(true)
    expect(result.ok && result.value).toEqual([1, 2, 3])
  })

  it('turns a rejection into the failing branch instead of throwing', async () => {
    const result = await accessory(Promise.reject(new Error('Bad Gateway')))
    expect(result.ok).toBe(false)
  })

  it('carries NO value on the failing branch — there is nothing to mistake for data', async () => {
    const result = await accessory(Promise.reject(new Error('Bad Gateway')))
    expect(result).not.toHaveProperty('value')
  })

  it('says so once, in the log, naming the read', async () => {
    await accessory(Promise.reject(new Error('Could not read the origin facet: Bad Gateway')))
    expect(console.error).toHaveBeenCalledTimes(1)
    expect(String(vi.mocked(console.error).mock.calls[0])).toContain('origin facet')
  })

  it('does not reject the batch it sits in — that is its whole point', async () => {
    const [subject, side] = await Promise.all([
      Promise.resolve('the sheet'),
      accessory(Promise.reject(new Error('Bad Gateway'))),
    ])
    expect(subject).toBe('the sheet')
    expect(side.ok).toBe(false)
  })

  it('still lets the SUBJECT reject the batch', async () => {
    await expect(
      Promise.all([
        Promise.reject(new Error('Could not read the journal: Bad Gateway')),
        accessory(Promise.resolve([])),
      ]),
    ).rejects.toThrow('Could not read the journal')
  })
})

describe('orElse', () => {
  it('gives the value when there is one, the stand-in when there is not', async () => {
    expect(orElse(await accessory(Promise.resolve(7)), 0)).toBe(7)
    expect(orElse(await accessory(Promise.reject(new Error('x'))), 0)).toBe(0)
  })
})

/* -------------------------------------------------------------------------- */
/* The rule itself                                                            */
/* -------------------------------------------------------------------------- */

function queryFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) queryFiles(path, found)
    else if (/queries\.ts$|^query\.ts$/.test(entry)) found.push(path)
  }
  return found
}

/**
 * The four replis that predate ADR 0020, each with a written argument in its
 * own doc comment. They are allowed to swallow; nothing else is.
 *
 * Adding a name here is a decision, not a formality: it means a read whose
 * failure is indistinguishable from its empty answer, and the comment above it
 * has to say why that is acceptable there.
 */
const ARGUED_FALLBACKS = [
  'publicPublishedArticles', // sitemap + RSS, rendered in CI against a stand-in URL
  'reportSlaHours', // the DSA delay, with a legal constant as its floor
  'venuesFlag', // a flag: the fallback is CLOSED, never open
]

describe('the rule, read off the query files', () => {
  const files = queryFiles('lib')

  it('finds the query files at all — a check that finds nothing is a gap', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it('holds no dead allowance — an exception for a function that no longer exists is a hole', () => {
    const sources = files.map((file) => readFileSync(file, 'utf8')).join('\n')
    for (const name of ARGUED_FALLBACKS) {
      expect(
        new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b`).test(sources),
        `${name}() is allowed to swallow its error but no longer exists`,
      ).toBe(true)
    }
  })

  it('never spells a failure like a refusal', () => {
    const offenders: string[] = []

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      /* `catch` blocks that hand back the empty value of their type. That is
         the RLS double ADR 0020 forbids: `[]` from a catch and `[]` from a
         policy are the same three characters to the page that reads them. */
      const pattern = /catch\s*(?:\([^)]*\))?\s*\{[^}]*return\s*(\[\s*\]|null|0|\{\s*\})/g
      for (const match of source.matchAll(pattern)) {
        const before = source.slice(0, match.index)
        /* The nearest EXPORTED function above the catch — a local
           `const supabase = …` is not the read that swallowed. */
        const fn =
          [...before.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].at(-1)?.[1] ?? '?'
        if (!ARGUED_FALLBACKS.includes(fn)) offenders.push(`${file} → ${fn}()`)
      }
    }

    expect(offenders).toEqual([])
  })
})
