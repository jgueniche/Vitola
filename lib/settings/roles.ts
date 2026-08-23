import type { Database } from '@/lib/supabase/database.types'

/**
 * The role ladder, and what a screen is allowed to hand out.
 *
 * `public.app_role` has five rungs and `has_min_role()` compares them in this
 * order, so the array is the ladder itself rather than a display list.
 */
export type AppRole = Database['public']['Enums']['app_role']

export const APP_ROLES = [
  'member',
  'contributor',
  'editor',
  'moderator',
  'admin',
] as const satisfies readonly AppRole[]

/**
 * What `/api/roles` accepts as a target, which is everything but `admin`.
 *
 * Minting the role that operates the screen has no floor: one admin becomes
 * two, and neither can be undone from the interface. Making another admin
 * stays a database act — deliberate friction on the one right that compounds.
 *
 * The route also refuses to *edit* someone who is already `admin`, which is the
 * same rule seen from the other side: demoting the person who could re-promote
 * you is the move an interface must not offer.
 */
export const GRANTABLE_ROLES = [
  'member',
  'contributor',
  'editor',
  'moderator',
] as const satisfies readonly AppRole[]

export type GrantableRole = (typeof GRANTABLE_ROLES)[number]

export function isGrantableRole(value: unknown): value is GrantableRole {
  return typeof value === 'string' && (GRANTABLE_ROLES as readonly string[]).includes(value)
}

/** Whether `has_min_role(minimum)` would be true for someone holding `role`. */
export function hasMinRole(role: AppRole, minimum: AppRole): boolean {
  return APP_ROLES.indexOf(role) >= APP_ROLES.indexOf(minimum)
}

/** The rung the wiki review queue needs — §6 of the brief. */
export const REVIEWER_ROLE: AppRole = 'editor'
