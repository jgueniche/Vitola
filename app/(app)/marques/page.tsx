import type { Metadata } from 'next'
import Link from 'next/link'

import { Band } from '@/components/band/band'
import { countryLabel } from '@/lib/cigar'
import { m } from '@/lib/i18n'
import { listBrands } from '@/lib/referential/queries'
import { routes } from '@/lib/routes'

/**
 * Revalidated hourly rather than frozen at build time.
 *
 * Without this Next prerenders the list once and serves it until the next
 * deploy: a brand added by a contributor would be invisible until someone
 * happened to redeploy. An hour is chosen because the referential is a wiki
 * that changes in minutes, not in seconds, and every visitor should not pay for
 * a fresh query.
 */
export const revalidate = 3600

export const metadata: Metadata = { title: m.referential.brandsTitle }

/**
 * The brand index.
 *
 * Brands carry no draft/published status: they are reference data, and their
 * RLS policy makes them readable by anyone. So this page has content today even
 * though no cigar entry is published yet — 114 brands, which is the first thing
 * a visitor can actually browse.
 */
export default async function BrandsPage() {
  const brands = await listBrands()

  return (
    <main id="contenu" className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-3">
        <p className="eyebrow">{m.referential.eyebrow}</p>
        <h1 className="font-display text-4xl">{m.referential.brandsTitle}</h1>
      </div>

      <Band variant="divider" />

      <ul className="grid gap-3 sm:grid-cols-2">
        {brands.map((brand) => (
          <li key={brand.id}>
            <Link
              href={routes.brand(brand.slug)}
              className="border-rule bg-surface hover:border-rule-strong flex flex-col gap-1 rounded-[3px] border px-4 py-3 transition-colors"
            >
              <span className="font-display text-lg leading-tight">{brand.name}</span>
              <span className="text-ink-muted text-xs">
                {brand.country ? countryLabel(brand.country) : null}
                {brand.manufacturers ? ` · ${brand.manufacturers.name}` : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
