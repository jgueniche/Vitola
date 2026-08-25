// The one product form, shared by the admin catalogue and the vendor space
// (ADR 0016: « réutilise les formulaires du catalogue admin »). Client because
// its parents are `useActionState` forms; it renders inputs only.
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
 * `vendorOptions` renders the seller select — the admin's create form only.
 * The vendor space never shows it: a vendor writes at home, the policy makes
 * anything else a forged POST that writes zero rows. On edit the select is
 * absent everywhere: a product does not change vendor (migration 0022).
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
          <Select id="vendor" name="vendor" defaultValue={vendorOptions[0]?.id ?? ''}>
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
