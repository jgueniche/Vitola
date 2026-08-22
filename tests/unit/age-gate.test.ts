import { describe, expect, it } from 'vitest'

import {
  AGE_COOKIE_MAX_AGE_SECONDS,
  createAgeToken,
  isAdultBirthDate,
  isPlausibleBirthDate,
  verifyAgeToken,
} from '@/lib/compliance/age-gate'

describe('age gate token', () => {
  it('accepts a token it has just issued', async () => {
    expect(await verifyAgeToken(await createAgeToken())).toBe(true)
  })

  it('rejects a missing or malformed token', async () => {
    expect(await verifyAgeToken(undefined)).toBe(false)
    expect(await verifyAgeToken('')).toBe(false)
    expect(await verifyAgeToken('pas-un-token')).toBe(false)
    expect(await verifyAgeToken('a.b.c')).toBe(false)
  })

  /*
   * The whole reason the cookie is signed: an unsigned `adult=1` is forged from
   * the browser console in two seconds, which would make the gate decorative.
   */
  it('rejects a token whose payload has been tampered with', async () => {
    const token = await createAgeToken()
    const [, signature] = token.split('.')
    const forgedBody = btoa(JSON.stringify({ v: 1, exp: 9_999_999_999 }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    expect(await verifyAgeToken(`${forgedBody}.${signature}`)).toBe(false)
  })

  it('rejects a token whose signature has been swapped', async () => {
    const [body] = (await createAgeToken()).split('.')
    expect(await verifyAgeToken(`${body}.AAAAAAAAAAAAAAAAAAAAAAAAAAAA`)).toBe(false)
  })

  it('rejects an expired token', async () => {
    const issuedAt = new Date('2020-01-01T00:00:00Z')
    const token = await createAgeToken(issuedAt)
    const afterExpiry = new Date(issuedAt.getTime() + (AGE_COOKIE_MAX_AGE_SECONDS + 60) * 1000)
    expect(await verifyAgeToken(token, afterExpiry)).toBe(false)
    expect(await verifyAgeToken(token, issuedAt)).toBe(true)
  })
})

describe('isAdultBirthDate', () => {
  const today = new Date('2026-08-21T12:00:00Z')

  it('accepts someone who turns 18 today', () => {
    expect(isAdultBirthDate(new Date('2008-08-21T00:00:00Z'), today)).toBe(true)
  })

  it('rejects someone who turns 18 tomorrow', () => {
    expect(isAdultBirthDate(new Date('2008-08-22T00:00:00Z'), today)).toBe(false)
  })

  it('rejects a child', () => {
    expect(isAdultBirthDate(new Date('2015-01-01T00:00:00Z'), today)).toBe(false)
  })

  it('accepts an adult', () => {
    expect(isAdultBirthDate(new Date('1979-11-20T00:00:00Z'), today)).toBe(true)
  })
})

describe('isPlausibleBirthDate', () => {
  const today = new Date('2026-08-21T12:00:00Z')

  it('rejects a future date', () => {
    expect(isPlausibleBirthDate(new Date('2030-01-01T00:00:00Z'), today)).toBe(false)
  })

  it('rejects a date over 120 years ago', () => {
    expect(isPlausibleBirthDate(new Date('1850-01-01T00:00:00Z'), today)).toBe(false)
  })

  it('rejects an invalid date', () => {
    expect(isPlausibleBirthDate(new Date('pas une date'), today)).toBe(false)
  })

  it('accepts a normal date', () => {
    expect(isPlausibleBirthDate(new Date('1985-04-02T00:00:00Z'), today)).toBe(true)
  })
})
