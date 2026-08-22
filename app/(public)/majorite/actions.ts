'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import {
  AGE_COOKIE_MAX_AGE_SECONDS,
  AGE_COOKIE_NAME,
  createAgeToken,
  isAdultBirthDate,
  isPlausibleBirthDate,
} from '@/lib/compliance/age-gate'
import { m } from '@/lib/i18n'
import { isPublicPath, routes } from '@/lib/routes'

export type AgeGateState = { error?: string }

/** Zod on every Server Action, per §8 of the brief. */
const schema = z.object({
  birthDate: z.string().min(1, m.ageGate.errors.required),
  suite: z.string().optional(),
})

export async function confirmAge(
  _previous: AgeGateState,
  formData: FormData,
): Promise<AgeGateState> {
  const parsed = schema.safeParse({
    birthDate: formData.get('birthDate'),
    suite: formData.get('suite'),
  })

  if (!parsed.success) {
    return { error: m.ageGate.errors.required }
  }

  const birthDate = new Date(`${parsed.data.birthDate}T00:00:00Z`)

  if (Number.isNaN(birthDate.getTime())) return { error: m.ageGate.errors.invalid }
  if (!isPlausibleBirthDate(birthDate)) return { error: m.ageGate.errors.implausible }
  if (!isAdultBirthDate(birthDate)) return { error: m.ageGate.errors.underage }

  const store = await cookies()
  store.set({
    name: AGE_COOKIE_NAME,
    value: await createAgeToken(),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: AGE_COOKIE_MAX_AGE_SECONDS,
  })

  /*
   * Open-redirect guard: `suite` comes from the query string, so it is attacker
   * controlled. Only a same-origin absolute path is honoured, and never one that
   * points back at a public page (which would bounce the visitor pointlessly).
   */
  const suite = parsed.data.suite ?? ''
  const isSafeInternalPath =
    suite.startsWith('/') && !suite.startsWith('//') && !isPublicPath(suite)

  redirect(isSafeInternalPath ? suite : routes.cigars())
}
