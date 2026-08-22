/**
 * What is actually deployed, as opposed to what we believe is deployed.
 *
 * Two facts live here, both served by `/api/health`:
 *
 * - the roadmap phase (§9 of the brief), which was hard-coded in the route and
 *   silently kept answering `P0` for the whole of P1. A literal buried in a
 *   handler drifts because nothing ever reads it back; a constant with a test
 *   against it makes the next phase change a deliberate act, the way
 *   `PUBLIC_PATHS` makes adding a public route one.
 * - the commit the running build was made from. The repository's default branch
 *   and `master` are two different settings, and Vercel deploys the former: a
 *   merge into `master` alone changes nothing in production, and nothing on the
 *   site says so. Serving the commit turns that silent gap into something one
 *   HTTP request can see.
 */

/** Current roadmap phase (§9). Pinned by tests/unit/release.test.ts. */
export const CURRENT_PHASE = 'P1'

export type Phase = typeof CURRENT_PHASE

/**
 * The commit of the running build, short form, or null outside a deployment.
 *
 * Vercel injects `VERCEL_GIT_COMMIT_SHA`; there is no equivalent locally and no
 * value worth inventing, so a local run answers null rather than lying.
 * Read at call time, never at module load: an import must not depend on which
 * environment happens to be loaded.
 */
export function deployedCommit(): string | null {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA
  return sha ? sha.slice(0, 7) : null
}
