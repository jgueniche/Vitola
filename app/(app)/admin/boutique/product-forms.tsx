// useActionState — a refusal (tobacco wording, bad price, invalid image) must
// reappear next to what was typed, without losing it. The deletion is a client
// component for `window.confirm` alone.
'use client'

import { useActionState } from 'react'

import { ProductFields, type VendorChoice } from '@/components/shop/product-fields'
import { Button } from '@/components/ui/button'
import { FieldError, FieldStatus } from '@/components/ui/field'
import type { ProductRow } from '@/lib/admin/queries'
import { m } from '@/lib/i18n'

import { createProduct, deleteProduct, updateProduct, type AdminState } from '../actions'

const copy = m.admin.shop

export function CreateProductForm({ vendorOptions }: { vendorOptions: VendorChoice[] }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(createProduct, {})

  return (
    <form action={action} className="flex flex-col gap-4">
      <ProductFields vendorOptions={vendorOptions} />
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

export function EditProductForm({ product }: { product: ProductRow }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(updateProduct, {})

  return (
    /* Keyed on the row's own state, so a save re-mounts the fields on the
       stored truth — React 19 would otherwise reset each control to its
       mount-time default, the scope-selector bug. */
    <form
      action={action}
      className="flex flex-col gap-4"
      key={`${product.id}-${product.title}-${product.brand ?? ''}-${product.price_eur}-${product.stock_qty}-${product.category}`}
    >
      <input type="hidden" name="id" value={product.id} />
      <ProductFields product={product} />
      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {state.done ? <FieldStatus>{copy.saved}</FieldStatus> : null}
      <div>
        <Button type="submit" disabled={pending}>
          {copy.save}
        </Button>
      </div>
    </form>
  )
}

export function DeleteProductForm({ id }: { id: string }) {
  return (
    <form
      action={deleteProduct}
      onSubmit={(event) => {
        if (!window.confirm(copy.deleteConfirm)) event.preventDefault()
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm">
        {copy.delete}
      </Button>
    </form>
  )
}
