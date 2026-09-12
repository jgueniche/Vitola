// The one product form. It was shared with the vendor space (ADR 0016); the
// marketplace is gone (migration 0034) and the admin catalogue is now its only
// caller. Client because its parent is a `useActionState` form; it renders
// inputs only.
'use client'

import { Input, Label, Select, Textarea } from '@/components/ui/field'
import { m } from '@/lib/i18n'
import { Constants } from '@/lib/supabase/database.types'

const copy = m.admin.shop
const CATEGORY_LABELS = copy.categories as Record<string, string>

export type ProductFieldValues = {
  category: string
  title: string
  brand: string | null
  description: string | null
  price_eur: number
  stock_qty: number
}

export type VendorChoice = { id: string; name: string }

/**
 * `vendorOptions` renders the PARTNER select — who we bought the item from.
 * Optional in both senses: the caller may omit the prop, and the select
 * carries an empty option, because `products.vendor_id` became nullable with
 * migration 0034. An item bought before anyone wrote the partner down is still
 * an item we sell.
 */
export function ProductFields({
  product,
  vendorOptions,
}: {
  product?: ProductFieldValues
  vendorOptions?: VendorChoice[]
}) {
  return (
    <>
      {vendorOptions ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vendor">{copy.vendorLabel}</Label>
          <Select id="vendor" name="vendor" defaultValue="">
            <option value="">{copy.vendorNone}</option>
            {vendorOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </Select>
          <p className="text-ink-muted text-xs">{copy.vendorHint}</p>
        </div>
      ) : null}

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
        <Label htmlFor="brand">{copy.brandLabel}</Label>
        <Input id="brand" name="brand" maxLength={80} defaultValue={product?.brand ?? ''} />
        <p className="text-ink-muted text-xs">{copy.brandHint}</p>
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
