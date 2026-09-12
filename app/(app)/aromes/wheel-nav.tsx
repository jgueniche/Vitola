'use client'

// The wheel is a control — it holds which family is open — so its host must be
// a client component. This is the whole of it: one function passed to the
// shared wheel, and no state of its own.
import { AromaWheel } from '@/components/reviews/aroma-wheel'
import type { AromaFamily } from '@/lib/aromas/queries'
import { routes } from '@/lib/routes'
import { FACET_PARAMS } from '@/lib/search/facets'

/**
 * The reference wheel, pointing at the referential.
 *
 * Every descriptor is a link to `/cigares?arome=<slug>` — the same facet key
 * the panel on that page writes for a family, resolved to descriptor ids by
 * `searchCigars`. One filter, two grains, two entrances: the panel offers the
 * eleven families because that is what fits beside a result list, and the
 * wheel offers all seventy-six because that is what a wheel is for.
 */
export function WheelNav({ families }: { families: AromaFamily[] }) {
  return (
    <AromaWheel
      families={families}
      hrefFor={(descriptor) =>
        `${routes.cigars()}?${FACET_PARAMS.aroma}=${encodeURIComponent(descriptor.slug)}`
      }
    />
  )
}
