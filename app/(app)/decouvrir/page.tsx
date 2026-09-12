import { permanentRedirect } from 'next/navigation'

import { routes } from '@/lib/routes'

/**
 * « Page découvrir ça saute » (QA du 12 septembre 2026).
 *
 * The hub's only content was six links to pages that all still exist, so it
 * was a click charged for nothing. Its sections now hang under the list they
 * belong to — `/cigares` carries the brands, the vitolas, the wheel, the box
 * codes and the contribution queue as a row of links.
 *
 * A redirect rather than a deletion: the address was in the header of every
 * page of the site for two weeks, so it is in histories and in bookmarks.
 * `permanentRedirect` answers 308, which is what "this moved" means.
 */
export default function DiscoverHubPage() {
  permanentRedirect(routes.cigars())
}
