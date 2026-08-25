// useActionState — a refusal (tobacco wording, bad price, invalid image) must
// reappear next to what was typed, without losing it. The deletion is a client
// component for `window.confirm` alone.
'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { FieldError, FieldStatus, Input, Label, Select, Textarea } from '@/components/ui/field'
import type { ProductRow } from '@/lib/admin/queries'
import { m } from '@/lib/i18n'
import { Constants } from '@/lib/supabase/database.types'

import { createProduct, deleteProduct, updateProduct, type AdminState } from '../actions'

const copy = m.admin.shop
const CATEGORY_LABELS = copy.categories as Record<string, string>

function ProductFields({ product }: { product?: ProductRow }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="category">{copy.categoryLabel}</Label>
          <Select
            id="category"
            name="category"
            defaultValue={product?.category ?? ''}
            key={`category-${product?.category ?? 'none'}`}
          >
            {product ? null : <option value="" />}
            {Constants.shop.Enums.product_category.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value] ?? value}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="title">{copy.titleLabel}</Label>
          <Input id="title" name="title" maxLength={140} defaultValue={product?.title ?? ''} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">{copy.descriptionLabel}</Label>
        <Textarea
          id="description"
          name="description"
          maxLength={4000}
          rows={4}
          defaultValue={product?.description ?? ''}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="price">{copy.priceLabel}</Label>
          <Input
            id="price"
            name="price"
            inputMode="decimal"
            defaultValue={product ? product.price_eur.toFixed(2).replace('.', ',') : ''}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stock">{copy.stockLabel}</Label>
          <Input
            id="stock"
            name="stock"
            type="number"
            inputMode="numeric"
            min={0}
            defaultValue={product?.stock_qty ?? 0}
          />
          <p className="text-ink-muted text-xs">{copy.stockHint}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="image">{copy.imageLabel}</Label>
          <Input
            id="image"
            name="image"
            type="file"
            accept="image/webp,image/jpeg,image/png,image/avif"
          />
          <p className="text-ink-muted text-xs">{copy.imageHint}</p>
        </div>
      </div>
    </>
  )
}

export function CreateProductForm() {
  const [state, action, pending] = useActionState<AdminState, FormData>(createProduct, {})

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

export function EditProductForm({ product }: { product: ProductRow }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(updateProduct, {})

  return (
    /* Keyed on the row's own state, so a save re-mounts the fields on the
       stored truth — React 19 would otherwise reset each control to its
       mount-time default, the scope-selector bug. */
    <form
      action={action}
      className="flex flex-col gap-4"
      key={`${product.id}-${product.title}-${product.price_eur}-${product.stock_qty}-${product.category}`}
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
