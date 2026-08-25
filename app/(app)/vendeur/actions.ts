'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { attachProductImage, attachVendorLogo } from '@/lib/shop/images'
import {
  parseProductForm,
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_IMAGE_MIME,
  readProductImage,
  refuseTobaccoWording,
} from '@/lib/shop/model'
import { getMyVendor } from '@/lib/shop/queries'
import { clubSlug } from '@/lib/social/groups'
import { createSupabaseServerClient, currentUser } from '@/lib/supabase/server'

/**
 * The writes of the vendor space (ADR 0016).
 *
 * Everything runs on the vendor's session: `products_insert_vendor` and
 * `products_update_vendor` carry the WITH CHECK that makes publishing
 * impossible from here, whatever this file says — and this file never states
 * a status other than draft. Every write READS its result, because a policy
 * that declines does not raise (the /100 ↔ /20 lesson): zero rows is a
 * refusal, and the vendor deserves the sentence.
 *
 * Actions whose row survives return state (the storefront, the product
 * editor). Submitting, withdrawing, retracting and deleting change which
 * list the row belongs to, so they navigate with the outcome (`?fait=…`) —
 * the /contributions rule.
 */

export type VendorState = { error?: string; done?: boolean }

const copy = m.vendor.errors

async function requireMyVendor(): Promise<
  { vendor: NonNullable<Awaited<ReturnType<typeof getMyVendor>>> } | { error: string }
> {
  const user = await currentUser()
  if (!user) return { error: copy.notVendor }
  const vendor = await getMyVendor(user.id)
  if (!vendor) return { error: copy.notVendor }
  if (vendor.status === 'suspended') return { error: copy.suspended }
  return { vendor }
}

/* -------------------------------------------------------------------------- */
/* Storefront                                                                  */
/* -------------------------------------------------------------------------- */

const storefrontSchema = z.object({
  name: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(2, m.admin.errors.vendorNameNeeded).max(120, m.admin.errors.tooLong)),
  description: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().max(2000, m.admin.errors.tooLong))
      .nullable(),
  ),
  contactEmail: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().max(320, m.admin.errors.tooLong).nullable(),
  ),
  contactPhone: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().max(40, m.admin.errors.tooLong).nullable(),
  ),
  legalName: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().max(200, m.admin.errors.tooLong).nullable(),
  ),
  registration: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().max(40, m.admin.errors.tooLong).nullable(),
  ),
  address: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().max(500, m.admin.errors.tooLong).nullable(),
  ),
})

export async function updateMyStorefront(
  _previous: VendorState,
  formData: FormData,
): Promise<VendorState> {
  const gate = await requireMyVendor()
  if ('error' in gate) return { error: gate.error }

  const parsed = storefrontSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description'),
    contactEmail: formData.get('contactEmail'),
    contactPhone: formData.get('contactPhone'),
    legalName: formData.get('legalName'),
    registration: formData.get('registration'),
    address: formData.get('address'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? copy.unknown }

  const logoRaw = formData.get('logo')
  let logo: File | null = null
  if (logoRaw instanceof File && logoRaw.size > 0) {
    if (!PRODUCT_IMAGE_MIME.includes(logoRaw.type) || logoRaw.size > PRODUCT_IMAGE_MAX_BYTES) {
      return { error: m.admin.errors.imageInvalid }
    }
    logo = logoRaw
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .schema('shop')
    .from('vendors')
    .update({
      name: parsed.data.name,
      description: parsed.data.description,
      contact_email: parsed.data.contactEmail,
      contact_phone: parsed.data.contactPhone,
      legal_name: parsed.data.legalName,
      registration: parsed.data.registration,
      address: parsed.data.address,
    })
    .eq('id', gate.vendor.id)
    .select('id, logo_path')

  if (error) {
    if (error.code === '23514' && error.message.includes('VITOLA_TOBACCO_LISTING')) {
      return { error: m.admin.errors.titleRefused }
    }
    return { error: copy.unknown }
  }
  if (!data || data.length === 0) return { error: copy.unknown }

  if (logo) {
    const attach = await attachVendorLogo(gate.vendor.id, data[0]?.logo_path ?? null, logo)
    if (attach) return { error: attach }
  }

  revalidatePath(routes.vendorSpace())
  return { done: true }
}

/* -------------------------------------------------------------------------- */
/* Products                                                                    */
/* -------------------------------------------------------------------------- */

export async function createMyProduct(
  _previous: VendorState,
  formData: FormData,
): Promise<VendorState> {
  const gate = await requireMyVendor()
  if ('error' in gate) return { error: gate.error }

  const parsed = parseProductForm(formData)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? copy.unknown }

  const refused = refuseTobaccoWording(parsed.data.title, parsed.data.brand, parsed.data.description)
  if (refused) return { error: refused }

  const slug = clubSlug(parsed.data.title)
  if (slug === '') return { error: m.admin.errors.productTitleNeeded }

  const image = readProductImage(formData)
  if (image.error) return { error: image.error }

  const user = await currentUser()
  if (!user) return { error: copy.notVendor }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .schema('shop')
    .from('products')
    .insert({
      vendor_id: gate.vendor.id,
      category: parsed.data.category,
      title: parsed.data.title,
      slug,
      brand: parsed.data.brand,
      description: parsed.data.description,
      price_eur: parsed.data.price,
      stock_qty: parsed.data.stock,
      created_by: user.id,
    })
    .select('id')

  if (error) {
    if (error.code === '23505') return { error: m.admin.errors.productExists }
    if (error.code === '23514' && error.message.includes('VITOLA_TOBACCO_LISTING')) {
      return { error: m.admin.errors.titleRefused }
    }
    if (error.code === '42501') return { error: copy.suspended }
    return { error: copy.unknown }
  }
  if (!data || data.length === 0) return { error: copy.unknown }

  const productId = data[0]?.id
  if (image.file && productId) {
    const attach = await attachProductImage(productId, null, image.file)
    if (attach) {
      revalidatePath(routes.vendorSpace())
      return { error: attach }
    }
  }

  revalidatePath(routes.vendorSpace())
  return { done: true }
}

export async function updateMyProduct(
  _previous: VendorState,
  formData: FormData,
): Promise<VendorState> {
  const gate = await requireMyVendor()
  if ('error' in gate) return { error: gate.error }

  const id = z.uuid().safeParse(formData.get('id'))
  const parsed = parseProductForm(formData)
  if (!id.success || !parsed.success) {
    return {
      error: parsed.success ? copy.unknown : (parsed.error.issues[0]?.message ?? copy.unknown),
    }
  }

  const refused = refuseTobaccoWording(parsed.data.title, parsed.data.brand, parsed.data.description)
  if (refused) return { error: refused }

  const image = readProductImage(formData)
  if (image.error) return { error: image.error }

  const supabase = await createSupabaseServerClient()
  /* `status: 'draft'` is not a default, it is the D3 rule made visible:
     editing a published sheet retracts it — the vendor's UPDATE can only land
     on a draft (WITH CHECK), so the retraction is stated rather than implied
     by a policy error. The screen warns before the gesture. */
  const { data, error } = await supabase
    .schema('shop')
    .from('products')
    .update({
      category: parsed.data.category,
      title: parsed.data.title,
      brand: parsed.data.brand,
      description: parsed.data.description,
      price_eur: parsed.data.price,
      stock_qty: parsed.data.stock,
      status: 'draft',
    })
    .eq('id', id.data)
    .select('id, image_path')

  if (error) {
    if (error.code === '23514' && error.message.includes('VITOLA_TOBACCO_LISTING')) {
      return { error: m.admin.errors.titleRefused }
    }
    if (error.code === '42501') return { error: copy.suspended }
    return { error: copy.unknown }
  }
  if (!data || data.length === 0) return { error: copy.unknown }

  if (image.file) {
    const attach = await attachProductImage(id.data, data[0]?.image_path ?? null, image.file)
    if (attach) return { error: attach }
  }

  revalidatePath(routes.vendorSpace())
  return { done: true }
}

/** submit / withdraw / retract / delete — the row changes list, so navigate. */
const gestureSchema = z.object({
  id: z.uuid(),
  gesture: z.enum(['soumettre', 'retirer-soumission', 'retirer-vente', 'supprimer']),
})

const GESTURE_OUTCOME: Record<z.infer<typeof gestureSchema>['gesture'], string> = {
  soumettre: 'produit-soumis',
  'retirer-soumission': 'soumission-retiree',
  'retirer-vente': 'produit-retire',
  supprimer: 'produit-supprime',
}

export async function actOnMyProduct(formData: FormData): Promise<void> {
  const parsed = gestureSchema.safeParse({
    id: formData.get('id'),
    gesture: formData.get('gesture'),
  })
  if (!parsed.success) return

  const supabase = await createSupabaseServerClient()
  let written = 0

  if (parsed.data.gesture === 'supprimer') {
    const { data } = await supabase
      .schema('shop')
      .from('products')
      .delete()
      .eq('id', parsed.data.id)
      .select('id, image_path')
    written = data?.length ?? 0
    const imagePath = data?.[0]?.image_path
    if (imagePath) await supabase.storage.from('shop-images').remove([imagePath])
  } else {
    const patch =
      parsed.data.gesture === 'soumettre'
        ? { submitted_at: new Date().toISOString() }
        : parsed.data.gesture === 'retirer-soumission'
          ? { submitted_at: null }
          : { status: 'draft' as const, submitted_at: null }
    const { data } = await supabase
      .schema('shop')
      .from('products')
      .update(patch)
      .eq('id', parsed.data.id)
      .select('id')
    written = data?.length ?? 0
  }

  const fait = written > 0 ? GESTURE_OUTCOME[parsed.data.gesture] : 'refus'
  const keepPanel = parsed.data.gesture !== 'supprimer' ? `produit=${parsed.data.id}&` : ''
  revalidatePath(routes.vendorSpace())
  redirect(`${routes.vendorSpace()}?${keepPanel}fait=${fait}`)
}
