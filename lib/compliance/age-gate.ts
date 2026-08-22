/**
 * Server-side age gate (§2 of the brief).
 *
 * A signed cookie, not a flag: an unsigned `age_ok=1` cookie is forged in two
 * seconds from the browser console, which would make the gate decorative. The
 * signature is HMAC-SHA256 over the payload, computed with Web Crypto so the
 * same code runs in the Edge middleware and in Node — and so that no dependency
 * is added for it (§3: every dependency needs a written justification).
 *
 * What this is NOT: proof of age. It records a declaration and makes it
 * tamper-evident. Real verification, if it is ever required, is Q1.
 */

export const AGE_COOKIE_NAME = 'vitola_adult'

/** 180 days. Long enough not to nag, short enough to expire on a shared device. */
export const AGE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180

export const MINIMUM_AGE_YEARS = 18

type AgeGatePayload = {
  /** Schema version, so the format can change without locking everyone out. */
  v: 1
  /** Unix seconds at which the declaration expires. */
  exp: number
}

function getSecret(): string {
  const secret = process.env.AGE_GATE_SECRET
  if (secret && secret.length >= 32) return secret

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'AGE_GATE_SECRET is missing or shorter than 32 characters. ' +
        'The age gate cannot be signed and must not degrade silently.',
    )
  }
  // Development only. Never reached in production because of the throw above.
  return 'development-only-insecure-age-gate-secret'
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
  // Backed by a concrete ArrayBuffer, not ArrayBufferLike: Web Crypto's
  // BufferSource excludes SharedArrayBuffer, and TypeScript now tracks that.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function importKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

/** Builds the signed cookie value for a visitor who has declared they are an adult. */
export async function createAgeToken(now: Date = new Date()): Promise<string> {
  const payload: AgeGatePayload = {
    v: 1,
    exp: Math.floor(now.getTime() / 1000) + AGE_COOKIE_MAX_AGE_SECONDS,
  }
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const signature = await crypto.subtle.sign(
    'HMAC',
    await importKey(),
    new TextEncoder().encode(body),
  )
  return `${body}.${toBase64Url(new Uint8Array(signature))}`
}

/**
 * Verifies a cookie value. Returns false for anything malformed, unsigned,
 * signed with another key, or expired. Never throws: a broken cookie must send
 * the visitor back to the gate, not produce a 500.
 */
export async function verifyAgeToken(
  token: string | undefined,
  now: Date = new Date(),
): Promise<boolean> {
  if (!token) return false

  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [body, signature] = parts
  if (!body || !signature) return false

  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await importKey(),
      fromBase64Url(signature),
      new TextEncoder().encode(body),
    )
    if (!valid) return false

    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as unknown
    if (typeof payload !== 'object' || payload === null) return false

    const { v, exp } = payload as Partial<AgeGatePayload>
    if (v !== 1 || typeof exp !== 'number') return false

    return exp > Math.floor(now.getTime() / 1000)
  } catch {
    return false
  }
}

/**
 * Whether a declared date of birth clears the minimum age, evaluated on calendar
 * days rather than milliseconds so that a birthday counts from its own date.
 */
export function isAdultBirthDate(birthDate: Date, now: Date = new Date()): boolean {
  const threshold = new Date(
    Date.UTC(
      now.getUTCFullYear() - MINIMUM_AGE_YEARS,
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  )
  const birth = new Date(
    Date.UTC(birthDate.getUTCFullYear(), birthDate.getUTCMonth(), birthDate.getUTCDate()),
  )
  return birth.getTime() <= threshold.getTime()
}

/** Rejects implausible dates before they reach the database trigger. */
export function isPlausibleBirthDate(birthDate: Date, now: Date = new Date()): boolean {
  if (Number.isNaN(birthDate.getTime())) return false
  const oldest = new Date(Date.UTC(now.getUTCFullYear() - 120, now.getUTCMonth(), now.getUTCDate()))
  return birthDate.getTime() >= oldest.getTime() && birthDate.getTime() <= now.getTime()
}
