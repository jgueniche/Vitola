import { m } from '@/lib/i18n'

import { maturityStage, type MaturityStage } from './model'

/**
 * The two ways a humidor page speaks about a lot's age.
 *
 * They lived in `/cave/[id]` until a second page needed them: a shared humidor
 * (ADR 0022) shows the same ages, and a copy would have been two sentences for
 * one fact, drifting apart the first time one of them was reworded.
 */

const copy = m.humidor

const MATURITY_LABELS: Record<MaturityStage, string> = {
  fresh: copy.maturityFresh,
  settling: copy.maturitySettling,
  ready: copy.maturityReady,
  mature: copy.maturityMature,
}

export function maturityLabel(agingDays: number | null): string | null {
  const stage = maturityStage(agingDays)
  return stage ? MATURITY_LABELS[stage] : null
}

/**
 * An age, at the resolution it deserves.
 *
 * Days for the first three months, months to two years, then years. "742 jours"
 * is precise and unreadable; nobody rests a cigar to the day, and rendering it
 * that way suggests we measured something we did not.
 */
export function ageLabel(agingDays: number | null): string {
  if (agingDays === null) return copy.ageUnknown
  if (agingDays < 90) return copy.ageDays.replace('{count}', String(agingDays))
  if (agingDays < 730) return copy.ageMonths.replace('{count}', String(Math.round(agingDays / 30)))
  return copy.ageYears.replace('{count}', String(Math.floor(agingDays / 365)))
}
