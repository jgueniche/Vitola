import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { EmptyState } from '@/components/layout/empty-state'
import { ReportDialog } from '@/components/moderation/report-dialog'
import { isFeatureEnabled } from '@/lib/flags'
import { m } from '@/lib/i18n'
import { reportSlaHours } from '@/lib/moderation/queries'
import { routes } from '@/lib/routes'
import { formatPrice } from '@/lib/shop/model'
import { getShopVendorBySlug, listVendorShelf, signShopImages } from '@/lib/shop/queries'
import { currentUser } from '@/lib/supabase/server'

const copy = m.shop
const CATEGORY_LABELS = m.admin.shop.categories as Record<string, string>

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const vendor = await getShopVendorBySlug(slug)
  return { title: vendor ? vendor.name : copy.title }
}

/**
 * The shopfront — the second entry of the marketplace (ADR 0016): « la
 * boutique Elie Bleu ». A pending or suspended vendor answers 404, never
 * « accès refusé » : the tab filter and the RLS agree on that. The contact is
 * the vendor's own professional address — they typed it for this page.
 *
 * « Signaler cette boutique » is the same control as on the product sheet
 * (migration 0024): a shopfront is the vendor's own presentation, in front of
 * the age gate, and the art. 30 traceability behind it is what a notice about
 * it questions. Member: the dialog. Visitor: the sign-in link, way back included.
 */
export default async function ShopVendorPage({ params }: Props) {
  if (!(await isFeatureEnabled('shop_enabled'))) notFound()

  const { slug } = await params
  const vendor = await getShopVendorBySlug(slug)
  if (!vendor) notFound()

  const [shelf, user, slaHours] = await Promise.all([
    listVendorShelf(vendor.id),
    currentUser(),
    reportSlaHours(),
  ])
  const images = await signShopImages([vendor.logo_path, ...shelf.map((p) => p.image_path)])
  const logoUrl = vendor.logo_path ? images.get(vendor.logo_path) : undefined
  const here = routes.shopVendor(vendor.slug)

  return (
    <main id="contenu" className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-12">
      <p className="text-sm">
        <Link href={routes.shop()} className="text-ink-muted underline">
          {copy.backToShop}
        </Link>
      </p>

      <div className="flex flex-wrap items-start gap-6">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL
          <img
            src={logoUrl}
            alt=""
            className="border-rule h-24 w-24 rounded-[3px] border object-contain"
          />
        ) : null}
        <div className="flex min-w-0 flex-col gap-2">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1 className="font-display text-display-md leading-tight">{vendor.name}</h1>
          {vendor.description ? (
            <p className="text-ink-muted measure text-sm leading-relaxed">{vendor.description}</p>
          ) : null}
          {vendor.contact_email ? (
            <p className="text-ink-faint text-xs">
              {copy.vendorContact} : {vendor.contact_email}
              {vendor.contact_phone ? ` · ${vendor.contact_phone}` : ''}
            </p>
          ) : null}
          <div className="mt-2">
            {user ? (
              <ReportDialog
                kind="vendor"
                id={vendor.id}
                slaHours={slaHours}
                label={m.moderation.report.triggerVendor}
              />
            ) : (
              <p className="text-ink-muted text-sm">
                <Link
                  href={`${routes.signIn()}?suite=${encodeURIComponent(here)}`}
                  className="text-accent hover:underline"
                >
                  {copy.reportVendorSignedOut}
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-display-sm">{copy.vendorShelfTitle}</h2>
        {shelf.length === 0 ? (
          <EmptyState title={copy.vendorShelfEmpty} description={copy.shelfEmptyBody} />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shelf.map((product) => (
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
                  <span className="mt-auto font-mono text-sm">
                    {formatPrice(product.price_eur)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
