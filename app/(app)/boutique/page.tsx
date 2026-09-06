import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { EmptyState } from '@/components/layout/empty-state'
import { isFeatureEnabled } from '@/lib/flags'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { formatPrice } from '@/lib/shop/model'
import { searchShopProducts, signShopImages, type ShopSearchFilters } from '@/lib/shop/queries'

export const metadata: Metadata = { title: m.shop.title }

const copy = m.shop
const CATEGORY_LABELS = m.admin.shop.categories as Record<string, string>
const PRICE_LABELS = copy.priceBrackets as Record<string, string>

/**
 * The transversal entry of the marketplace (ADR 0016): every published
 * product of every active vendor, one search, four facets. The /cigares
 * pattern verbatim — each facet option is an <a> to the URL the page would
 * have with it toggled, the text field is a `<form method="get">`, zero
 * client JavaScript. The whole section lives behind `shop_enabled`, closed
 * by default: opening it is the owner's commercial-opening gesture.
 */
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

function readFilter(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

export default async function ShopPage({ searchParams }: Props) {
  if (!(await isFeatureEnabled('shop_enabled'))) notFound()

  const query = await searchParams
  const filters: ShopSearchFilters = {
    q: readFilter(query.q),
    categorie: readFilter(query.categorie),
    marque: readFilter(query.marque),
    vendeur: readFilter(query.vendeur),
    prix: readFilter(query.prix),
  }

  const { products, facets, total } = await searchShopProducts(filters)
  const images = await signShopImages(products.map((p) => p.image_path))

  const withFilters = (patch: Partial<ShopSearchFilters>): string => {
    const params = new URLSearchParams()
    const next = { ...filters, ...patch }
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value)
    }
    const qs = params.toString()
    return qs === '' ? routes.shop() : `${routes.shop()}?${qs}`
  }

  const hasFilters = Boolean(
    filters.q || filters.categorie || filters.marque || filters.vendeur || filters.prix,
  )

  return (
    <main id="contenu" className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="font-display text-display-md leading-tight">{copy.title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
      </div>

      {total === 0 ? (
        <EmptyState title={copy.shelfEmptyTitle} description={copy.shelfEmptyBody} />
      ) : (
        <div className="flex flex-col gap-8 md:flex-row">
          <aside className="flex w-full flex-col gap-6 md:w-64 md:shrink-0">
            <form method="get" action={routes.shop()} className="flex flex-col gap-1.5">
              <label htmlFor="q" className="eyebrow">
                {copy.searchLabel}
              </label>
              <div className="flex gap-2">
                <input
                  id="q"
                  name="q"
                  type="search"
                  defaultValue={filters.q ?? ''}
                  placeholder={copy.searchPlaceholder}
                  className="border-rule bg-surface text-ink w-full rounded-[3px] border px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  className="border-rule text-ink rounded-[3px] border px-3 py-2 text-sm"
                >
                  {copy.searchSubmit}
                </button>
              </div>
              {filters.categorie ? (
                <input type="hidden" name="categorie" value={filters.categorie} />
              ) : null}
              {filters.marque ? <input type="hidden" name="marque" value={filters.marque} /> : null}
              {filters.vendeur ? (
                <input type="hidden" name="vendeur" value={filters.vendeur} />
              ) : null}
              {filters.prix ? <input type="hidden" name="prix" value={filters.prix} /> : null}
            </form>

            <Facet
              title={copy.facetCategory}
              options={facets.categories.map((f) => ({
                label: CATEGORY_LABELS[f.value] ?? f.value,
                count: f.count,
                href: withFilters({
                  categorie: filters.categorie === f.value ? undefined : f.value,
                }),
                active: filters.categorie === f.value,
              }))}
            />
            <Facet
              title={copy.facetBrand}
              options={facets.brands.map((f) => ({
                label: f.value,
                count: f.count,
                href: withFilters({ marque: filters.marque === f.value ? undefined : f.value }),
                active: filters.marque === f.value,
              }))}
            />
            <Facet
              title={copy.facetVendor}
              options={facets.vendors.map((f) => ({
                label: f.value,
                count: f.count,
                href: withFilters({ vendeur: filters.vendeur === f.slug ? undefined : f.slug }),
                active: filters.vendeur === f.slug,
              }))}
            />
            <Facet
              title={copy.facetPrice}
              options={facets.prices.map((f) => ({
                label: PRICE_LABELS[f.value] ?? f.value,
                count: f.count,
                href: withFilters({ prix: filters.prix === f.value ? undefined : f.value }),
                active: filters.prix === f.value,
              }))}
            />

            {hasFilters ? (
              <Link href={routes.shop()} className="text-ink-muted text-sm underline">
                {copy.clearFilters}
              </Link>
            ) : null}
          </aside>

          <section className="flex grow flex-col gap-4">
            <p className="text-ink-faint text-xs" role="status">
              {products.length === 1
                ? copy.resultOne
                : copy.resultCount.replace('{n}', String(products.length))}
            </p>
            {products.length === 0 ? (
              <EmptyState title={copy.emptyTitle} description={copy.emptyBody} />
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {products.map((product) => (
                  <li key={product.id} className="border-rule bg-surface rounded-[3px] border">
                    <Link
                      href={routes.shopProduct(product.slug)}
                      className="flex h-full flex-col gap-2 p-4"
                    >
                      {product.image_path && images.get(product.image_path) ? (
                        // eslint-disable-next-line @next/next/no-img-element -- signed URL
                        <img
                          src={images.get(product.image_path)}
                          alt=""
                          className="border-rule h-36 w-full rounded-[3px] border object-cover"
                        />
                      ) : (
                        <span className="border-rule text-ink-faint flex h-36 w-full items-center justify-center rounded-[3px] border text-xs">
                          {copy.noImage}
                        </span>
                      )}
                      <span className="leading-snug font-semibold">{product.title}</span>
                      <span className="text-ink-faint text-xs">
                        {product.brand ? `${product.brand} · ` : ''}
                        {CATEGORY_LABELS[product.category] ?? product.category}
                      </span>
                      <span className="text-ink-faint text-xs">
                        {copy.soldBy} {product.vendor?.name ?? '—'}
                      </span>
                      <span className="mt-auto font-mono text-sm">
                        {formatPrice(product.price_eur)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </main>
  )
}

function Facet({
  title,
  options,
}: {
  title: string
  options: Array<{ label: string; count: number; href: string; active: boolean }>
}) {
  if (options.length === 0) return null
  return (
    <nav aria-label={title} className="flex flex-col gap-1.5">
      <p className="eyebrow">{title}</p>
      <ul className="flex flex-col gap-1">
        {options.map((option) => (
          <li key={option.label}>
            <Link
              href={option.href}
              aria-current={option.active ? 'true' : undefined}
              className={`text-sm underline-offset-2 ${option.active ? 'text-accent underline' : 'text-ink-muted'}`}
            >
              {option.label} <span className="text-ink-faint">({option.count})</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
