// useActionState — a refusal (tobacco wording, bad price, invalid logo) must
// reappear next to what was typed. The retraction and the deletion are client
// forms for `window.confirm` alone: one cuts a live listing, the other is
// irreversible.
'use client'

import { useActionState } from 'react'

import { ProductFields } from '@/components/shop/product-fields'
import { Button } from '@/components/ui/button'
import { FieldError, FieldStatus, Input, Label, Textarea } from '@/components/ui/field'
import { m } from '@/lib/i18n'
import type { ShopProductRow, ShopVendorRow } from '@/lib/shop/queries'

import {
  actOnMyProduct,
  createMyProduct,
  updateMyProduct,
  updateMyStorefront,
  type VendorState,
} from './actions'

const copy = m.vendor

export function StorefrontForm({ vendor }: { vendor: ShopVendorRow }) {
  const [state, action, pending] = useActionState<VendorState, FormData>(updateMyStorefront, {})

  return (
    /* Keyed on the stored truth — the React 19 reset rule. */
    <form
      action={action}
      className="flex flex-col gap-4"
      key={`${vendor.name}-${vendor.description ?? ''}-${vendor.contact_email ?? ''}-${vendor.legal_name ?? ''}`}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sf-name">{copy.nameLabel}</Label>
          <Input id="sf-name" name="name" maxLength={120} defaultValue={vendor.name} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sf-logo">{copy.logoLabel}</Label>
          <Input
            id="sf-logo"
            name="logo"
            type="file"
            accept="image/webp,image/jpeg,image/png,image/avif"
          />
          <p className="text-ink-muted text-xs">{copy.logoHint}</p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sf-description">{copy.descriptionLabel}</Label>
        <Textarea
          id="sf-description"
          name="description"
          maxLength={2000}
          rows={4}
          defaultValue={vendor.description ?? ''}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sf-email">{copy.contactEmailLabel}</Label>
          <Input
            id="sf-email"
            name="contactEmail"
            type="email"
            maxLength={320}
            defaultValue={vendor.contact_email ?? ''}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sf-phone">{copy.contactPhoneLabel}</Label>
          <Input
            id="sf-phone"
            name="contactPhone"
            maxLength={40}
            defaultValue={vendor.contact_phone ?? ''}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="font-display text-xl">{copy.legalTitle}</h3>
        <p className="text-ink-muted measure text-xs leading-relaxed">{copy.legalLede}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sf-legal">{copy.legalNameLabel}</Label>
          <Input id="sf-legal" name="legalName" maxLength={200} defaultValue={vendor.legal_name ?? ''} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sf-registration">{copy.registrationLabel}</Label>
          <Input
            id="sf-registration"
            name="registration"
            maxLength={40}
            defaultValue={vendor.registration ?? ''}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sf-address">{copy.addressLabel}</Label>
        <Input id="sf-address" name="address" maxLength={500} defaultValue={vendor.address ?? ''} />
      </div>

      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {state.done ? <FieldStatus>{copy.saved}</FieldStatus> : null}
      <div>
        <Button type="submit" disabled={pending}>
          {m.admin.shop.save}
        </Button>
      </div>
    </form>
  )
}

export function VendorCreateProductForm() {
  const [state, action, pending] = useActionState<VendorState, FormData>(createMyProduct, {})

  return (
    <form action={action} className="flex flex-col gap-4">
      <ProductFields />
      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {state.done ? <FieldStatus>{copy.saved}</FieldStatus> : null}
      <div>
        <Button type="submit" disabled={pending}>
          {copy.create}
        </Button>
      </div>
    </form>
  )
}

export function VendorEditProductForm({ product }: { product: ShopProductRow }) {
  const [state, action, pending] = useActionState<VendorState, FormData>(updateMyProduct, {})

  return (
    <form
      action={action}
      className="flex flex-col gap-4"
      key={`${product.id}-${product.title}-${product.brand ?? ''}-${product.price_eur}-${product.stock_qty}-${product.category}`}
    >
      <input type="hidden" name="id" value={product.id} />
      {product.status === 'published' ? (
        <p className="border-rule text-ink measure border-l-2 pl-3 text-sm leading-relaxed">
          {copy.editWarning}
        </p>
      ) : null}
      <ProductFields product={product} />
      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {state.done ? <FieldStatus>{copy.saved}</FieldStatus> : null}
      <div>
        <Button type="submit" disabled={pending}>
          {copy.saveDraft}
        </Button>
      </div>
    </form>
  )
}

export function RetractProductForm({ id }: { id: string }) {
  return (
    <form
      action={actOnMyProduct}
      onSubmit={(event) => {
        if (!window.confirm(copy.retractConfirm)) event.preventDefault()
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="gesture" value="retirer-vente" />
      <Button type="submit" variant="secondary" size="sm">
        {copy.retract}
      </Button>
    </form>
  )
}

export function DeleteMyProductForm({ id }: { id: string }) {
  return (
    <form
      action={actOnMyProduct}
      onSubmit={(event) => {
        if (!window.confirm(copy.deleteConfirm)) event.preventDefault()
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="gesture" value="supprimer" />
      <Button type="submit" variant="ghost" size="sm">
        {copy.delete}
      </Button>
    </form>
  )
}
