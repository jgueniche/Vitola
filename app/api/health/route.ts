import { NextResponse } from 'next/server'

import { CURRENT_PHASE, deployedCommit } from '@/lib/release'

/**
 * Liveness probe. No authentication, no database access, no secrets.
 *
 * `commit` is what makes this endpoint worth calling: production is deployed
 * from the repository's default branch, which is not `master`, so the two can
 * drift without any visible symptom. See lib/release.ts.
 */
export function GET() {
  return NextResponse.json({
    status: 'ok',
    phase: CURRENT_PHASE,
    commit: deployedCommit(),
    timestamp: new Date().toISOString(),
  })
}
