import type { Metadata } from 'next'
import Link from 'next/link'

import { EmptyState } from '@/components/layout/empty-state'
import { Button } from '@/components/ui/button'
import { listVendors, type AdminVendorRow } from '@/lib/admin/queries'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'

import { setVendorStatus } from '../../actions'
import { AdminRestricted, adminView } from '../../shell'
import {
  AttachOwnerForm,
  CreateVendorForm,
  DeleteVendorForm,
  SuspendVendorForm,
} from './vendor-forms'

export const metadata: Metadata = { title: m.admin.vendors.title }

const copy = m.admin.vendors

const CONFIRMATIONS: Record<string, string> = {
  'vendeur-active': m.admin.confirmations.vendeurActive,
  'vendeur-suspendu': m.admin.confirmations.vendeurSuspendu,
  'vendeur-supprime': m.admin.confirmations.vendeurSupprime,
  'vendeur-plein': m.admin.errors.vendorHasProducts,
  refus: m.admin.confirmations.refus,
}

const STATUS_LABELS: Record<string, string> = {
  pending: copy.statusPending,
  active: copy.statusActive,
  suspended: copy.statusSuspended,
}

/**
 * The art. 30 gaps of one vendor, named rather than counted: an activation
 * screen that said « incomplete » without saying what would send the admin
 * back to SQL. The hard CHECK ships with the checkout (ADR 0016, D1).
 */
function missingTraceability(vendor: AdminVendorRow): string[] {
  const missing: string[] = []
  if (!vendor.legal_name) missing.push(copy.traceLegalName)
  if (!vendor.registration) missing.push(copy.traceRegistration)
  if (!vendor.address) missing.push(copy.traceAddress)
  if (!vendor.contact_email) missing.push(copy.traceContactEmail)
  return missing
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function AdminVendorsPage({ searchParams }: Props) {
  const isAdmin = await adminView(routes.adminShopVendors())
  if (!isAdmin) return <AdminRestricted />

  const query = await searchParams
  const done = typeof query.fait === 'string' ? CONFIRMATIONS[query.fait] : undefined

  const vendors = await listVendors()

  return (
    <main id="contenu" className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{m.admin.eyebrow}</p>
        <h1 className="font-display text-4xl leading-tight">{copy.title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
        <p className="text-sm">
          <Link href={routes.adminShop()} className="text-ink underline">
            {m.admin.shop.title}
          </Link>
        </p>
      </div>

      {done ? (
        <p role="status" className="border-rule text-ink rounded-[3px] border px-4 py-3 text-sm">
          {done}
        </p>
      ) : null}

      <section className="border-rule bg-surface flex flex-col gap-4 rounded-[3px] border p-4">
        <h2 className="font-display text-2xl">{copy.createTitle}</h2>
        <CreateVendorForm />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl">{copy.listTitle}</h2>
        {vendors.length === 0 ? (
          <EmptyState title={copy.emptyTitle} description={copy.emptyBody} />
        ) : (
          <ul className="flex flex-col gap-3">
            {vendors.map((vendor) => {
              const missing = missingTraceability(vendor)
              return (
                <li
                  key={vendor.id}
                  className="border-rule bg-surface flex flex-col gap-3 rounded-[3px] border px-4 py-3"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="flex flex-col">
                      <span className="font-semibold">{vendor.name}</span>
                      <span className="text-ink-faint text-xs">
                        /{vendor.slug}
                        {' · '}
                        {copy.productsCount.replace('{n}', String(vendor.productCount))}
                        {' · '}
                        {vendor.ownerHandle
                          ? `${copy.ownerPrefix} @${vendor.ownerHandle}`
                          : vendor.owner_id === null && vendor.slug === 'vitola'
                            ? copy.ownerNoneHouse
                            : copy.ownerNone}
                      </span>
                    </span>
                    <span className="eyebrow">{STATUS_LABELS[vendor.status] ?? vendor.status}</span>
                  </div>

                  <p className="text-ink-faint text-xs">
                    {copy.traceTitle}
                    {' — '}
                    {missing.length === 0
                      ? copy.traceComplete
                      : copy.traceMissing.replace('{fields}', missing.join(', '))}
                  </p>

                  <div className="flex flex-wrap items-center gap-3">
                    {vendor.status !== 'active' ? (
                      <form action={setVendorStatus}>
                        <input type="hidden" name="id" value={vendor.id} />
                        <input type="hidden" name="status" value="active" />
                        <Button type="submit" size="sm">
                          {vendor.status === 'suspended' ? copy.reinstate : copy.activate}
                        </Button>
                      </form>
                    ) : (
                      <SuspendVendorForm vendorId={vendor.id} />
                    )}
                    {vendor.slug !== 'vitola' ? <AttachOwnerForm vendorId={vendor.id} /> : null}
                    {vendor.slug !== 'vitola' && vendor.productCount === 0 ? (
                      <DeleteVendorForm vendorId={vendor.id} />
                    ) : null}
                    {vendor.status === 'active' ? (
                      <Link
                        href={routes.shopVendor(vendor.slug)}
                        className="text-accent text-sm underline"
                      >
                        {copy.shopfrontLink}
                      </Link>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </main>
  )
}
