import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `currentUser()` — the identity every page is about, and what it does when
 * it cannot be read (ADR 0020), now that it verifies the token locally
 * instead of asking the auth server (ADR 0021).
 *
 * Three answers, and only three: the reader, `null`, or a thrown error. The
 * whole point of ADR 0020 was that the third must never be spelled like the
 * second — a member behind an auth outage was once told « you are not signed
 * in » — so the split is asserted on the exact shapes supabase-js produces.
 */

const getClaims = vi.fn()

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => undefined }),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getClaims } }),
}))

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test'
  getClaims.mockReset()
})
afterEach(() => {
  vi.restoreAllMocks()
})

async function currentUser() {
  const mod = await import('@/lib/supabase/server')
  return mod.currentUser()
}

describe('currentUser', () => {
  it('returns the identity the verified claims carry, and nothing more', async () => {
    getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: 'd982acae-0000-4000-8000-000000000000',
          email: 'marc@example.org',
          role: 'authenticated',
        },
        header: { alg: 'ES256' },
        signature: new Uint8Array(),
      },
      error: null,
    })
    await expect(currentUser()).resolves.toEqual({
      id: 'd982acae-0000-4000-8000-000000000000',
      email: 'marc@example.org',
    })
  })

  it('returns null when there is no session at all — no error, no data', async () => {
    getClaims.mockResolvedValue({ data: null, error: null })
    await expect(currentUser()).resolves.toBeNull()
  })

  it('returns null for an unreadable or expired token (a 400), which IS « signed out »', async () => {
    getClaims.mockResolvedValue({
      data: null,
      error: { name: 'AuthInvalidJwtError', message: 'Invalid JWT signature', status: 400 },
    })
    await expect(currentUser()).resolves.toBeNull()
  })

  it('throws when the answer could not be obtained — a 5xx is a failure, not a refusal', async () => {
    getClaims.mockResolvedValue({
      data: null,
      error: { name: 'AuthApiError', message: 'Bad Gateway', status: 502 },
    })
    await expect(currentUser()).rejects.toThrow('Could not read the session: Bad Gateway')
  })

  it('throws when the transport gave up — the keys could not be fetched on a cold instance', async () => {
    getClaims.mockResolvedValue({
      data: null,
      error: { name: 'AuthRetryableFetchError', message: 'fetch failed', status: 0 },
    })
    await expect(currentUser()).rejects.toThrow('Could not read the session')
  })

  it('never asks the auth server for the user record', async () => {
    getClaims.mockResolvedValue({ data: null, error: null })
    await currentUser()
    expect(getClaims).toHaveBeenCalledTimes(1)
  })
})
