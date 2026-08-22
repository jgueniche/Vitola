import { afterEach, describe, expect, it } from 'vitest'

import { CURRENT_PHASE, deployedCommit } from '@/lib/release'

const ORIGINAL = process.env.VERCEL_GIT_COMMIT_SHA

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA
  else process.env.VERCEL_GIT_COMMIT_SHA = ORIGINAL
})

describe('release', () => {
  /*
   * Pinned on purpose. `/api/health` answered "P0" throughout P1 because the
   * value was a literal inside the handler and nothing ever compared it to
   * anything. Moving to P2 should fail here first, not be discovered by a
   * visitor reading a public endpoint.
   */
  it('pins the roadmap phase so a phase change is deliberate', () => {
    expect(CURRENT_PHASE).toBe('P1')
  })

  it('shortens the deployment commit to seven characters', () => {
    process.env.VERCEL_GIT_COMMIT_SHA = '2fcc07beb4cc68c08955618850bfdf45d798b933'
    expect(deployedCommit()).toBe('2fcc07b')
  })

  /* Outside a deployment there is no commit to report, and none to invent. */
  it('answers null when no deployment commit is injected', () => {
    delete process.env.VERCEL_GIT_COMMIT_SHA
    expect(deployedCommit()).toBeNull()
  })
})
