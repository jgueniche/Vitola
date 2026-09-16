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
 * What `/api/roles` accepts as a target: the whole ladder, `admin` included.
 *
 * It excluded `admin` until 16 septembre 2026, and the reason then was sound —
 * a screen that mints the role that runs the screen has no floor, so making
 * another admin stayed a database act. The owner asked for it («
 * la possibilité en tant qu'admin de pouvoir passer en rôle des utilisateurs
 * comme admin »), and the friction was paid by him alone, by hand, on every
 * person he showed the site to.
 *
 * What replaces the blanket refusal is NOT nothing. Two narrower guards hold
 * the property that actually mattered — that the interface can never strand
 * the site — and they live in the route, because that is where the write is:
 *
 *   - **Nobody edits their own role.** Self-demotion is the one move with no
 *     way back, and self-promotion is meaningless: only an admin gets here.
 *   - **The last admin cannot be demoted.** Counted at the moment of the
 *     write, not assumed.
 *
 * Both directions are now reversible from the interface, which the old rule
 * was not: it let a role be granted and never taken back.
 */
export const GRANTABLE_ROLES = [
  'member',
  'contributor',
  'editor',
  'moderator',
  'admin',
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
