import fr from '@/messages/fr.json'

/**
 * All visible copy lives in `messages/*.json` (§0.10 of the brief).
 *
 * Importing the object rather than a `t('a.b.c')` helper is deliberate: the
 * TypeScript compiler then checks every key at build time, and a renamed message
 * breaks the build instead of rendering `undefined` in production.
 *
 * French is the only active language in v1. EN/ES land in P8 (Q21); the swap is
 * a locale-keyed lookup here, not a change in any component.
 */
export const m = fr

export type Messages = typeof fr
