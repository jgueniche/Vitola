'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { isKnownFlag, PAYLOAD_FIELDS } from '@/lib/admin/flags'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { attachProductImage } from '@/lib/shop/images'
import { parseProductForm, readProductImage, refuseTobaccoWording } from '@/lib/shop/model'
import { clubSlug } from '@/lib/social/groups'
import { Constants } from '@/lib/supabase/database.types'
import { createSupabaseServerClient, referential } from '@/lib/supabase/server'

/**
 * The writes of the admin area (ADR 0014).
 *
 * Only the flag goes through a door — `admin_set_flag`, because feature_flags
 * has no client write grant and the change must carry its audit_log trace in
 * the same transaction. Everything else writes through the caller's session,
 * under `cigars_update_editor`, `lines_*_editor` and `lines_delete_admin`:
 * this file never re-checks a role, and a member who forged their way to a
 * button writes zero rows — which every action below READS, because a policy
 * that declines does not raise (the /100 ↔ /20 lesson).
 *
 * Actions whose row survives return state (the flags). Actions that remove
 * their row from the list it was clicked in — reviewing a sheet under the
 * "non relues" filter, deleting a line — navigate, and the outcome travels in
 * the URL (`?fait=…`), because the form holding a returned state unmounts in
 * the same render (the /contributions rule).
 */

export type AdminState = { error?: string; done?: boolean }

const copy = m.admin.errors

/* -------------------------------------------------------------------------- */
/* Flags                                                                       */
/* -------------------------------------------------------------------------- */

const flagSchema = z.object({
  key: z.string().min(1),
  enabled: z.enum(['true', 'false']),
  hours: z.string().optional(),
  minRole: z.string().optional(),
})

export async function setFlag(_previous: AdminState, formData: FormData): Promise<AdminState> {
  const parsed = flagSchema.safeParse({
    key: formData.get('key'),
    /* The « Enregistrer » submitter carries the current state as its own
       value, so saving a payload does not flip the flag. */
    enabled: formData.get('enabledOverride') ?? formData.get('enabled'),
    hours: formData.get('hours') ?? undefined,
    minRole: formData.get('minRole') ?? undefined,
  })
  if (!parsed.success) return { error: copy.unknown }

  const { key } = parsed.data
  /* The payload is built here, never forwarded raw: the screen only edits the
     one field a flag declares in PAYLOAD_FIELDS, and a flag without a declared
     shape keeps its stored payload untouched (the door coalesces on null). */
  let payload: { hours: number } | { min_role: string } | undefined
  if (isKnownFlag(key)) {
    const field = PAYLOAD_FIELDS[key]
    if (field?.kind === 'hours' && parsed.data.hours !== undefined && parsed.data.hours !== '') {
      const hours = Number.parseInt(parsed.data.hours, 10)
      if (!Number.isInteger(hours) || hours < field.min || hours > field.max) {
        return { error: copy.hoursRange }
      }
      payload = { hours }
    }
    if (field?.kind === 'role' && parsed.data.minRole) {
      if (!field.roles.includes(parsed.data.minRole)) return { error: copy.unknown }
      payload = { min_role: parsed.data.minRole }
    }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc('admin_set_flag', {
    p_key: key,
    p_enabled: parsed.data.enabled === 'true',
    ...(payload !== undefined ? { p_payload: payload } : {}),
  })

  if (error) {
    if (error.code === '42501') return { error: copy.notAdmin }
    if (error.message.includes('VITOLA_FLAG_UNKNOWN')) return { error: copy.flagUnknown }
    return { error: copy.unknown }
  }

  revalidatePath(routes.adminFlags())
  revalidatePath(routes.admin())
  return { done: true }
}

/* -------------------------------------------------------------------------- */
/* Sheets — review, unpublish, republish                                       */
/* -------------------------------------------------------------------------- */

const sheetSchema = z.object({
  id: z.uuid(),
  verb: z.enum(['relire', 'depublier', 'republier']),
  filtre: z.string().optional(),
  q: z.string().optional(),
})

const SHEET_OUTCOME: Record<z.infer<typeof sheetSchema>['verb'], string> = {
  relire: 'relue',
  depublier: 'depubliee',
  republier: 'republiee',
}

export async function actOnSheet(formData: FormData): Promise<void> {
  const parsed = sheetSchema.safeParse({
    id: formData.get('id'),
    verb: formData.get('verb'),
    filtre: formData.get('filtre') ?? undefined,
    q: formData.get('q') ?? undefined,
  })
  if (!parsed.success) return

  const supabase = await createSupabaseServerClient()
  const { data: session } = await supabase.auth.getUser()
  if (!session.user) return

  const ref = await referential()
  const patch =
    parsed.data.verb === 'relire'
      ? /* verified_at becomes a review timestamp — the meaning the column
           should always have had; until now it carried the publication date
           and verified_by was null on all 940 sheets (ADR 0014). */
        { verified_by: session.user.id, verified_at: new Date().toISOString() }
      : parsed.data.verb === 'depublier'
        ? { status: 'draft' as const }
        : { status: 'published' as const }

  const { data } = await ref.from('cigars').update(patch).eq('id', parsed.data.id).select('id')

  const params = new URLSearchParams()
  params.set('fait', data && data.length > 0 ? SHEET_OUTCOME[parsed.data.verb] : 'refus')
  if (parsed.data.filtre) params.set('filtre', parsed.data.filtre)
  if (parsed.data.q) params.set('q', parsed.data.q)

  revalidatePath(routes.adminSheets())
  redirect(`${routes.adminSheets()}?${params.toString()}`)
}

/* -------------------------------------------------------------------------- */
/* Lines                                                                       */
/* -------------------------------------------------------------------------- */

const createLineSchema = z.object({
  brandId: z.uuid(m.admin.errors.brandNeeded),
  name: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, m.admin.errors.lineNameNeeded).max(120, m.admin.errors.tooLong)),
})

export async function createLine(_previous: AdminState, formData: FormData): Promise<AdminState> {
  const parsed = createLineSchema.safeParse({
    brandId: formData.get('brandId'),
    name: formData.get('name'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? copy.unknown }

  const slug = clubSlug(parsed.data.name)
  if (slug === '') return { error: copy.lineNameNeeded }

  const supabase = await createSupabaseServerClient()
  const { data: session } = await supabase.auth.getUser()
  if (!session.user) return { error: copy.notAdmin }

  const ref = await referential()
  /* Born a draft by default (0019): publishing is the separate, visible
     gesture, even for the editor who just created it. */
  const { data, error } = await ref
    .from('lines')
    .insert({
      brand_id: parsed.data.brandId,
      name: parsed.data.name,
      slug,
      created_by: session.user.id,
    })
    .select('id')

  if (error) {
    if (error.code === '23505') return { error: copy.lineExists }
    if (error.code === '42501') return { error: copy.notAdmin }
    return { error: copy.unknown }
  }
  if (!data || data.length === 0) return { error: copy.notAdmin }

  revalidatePath(routes.adminLines())
  revalidatePath(routes.admin())
  return { done: true }
}

const lineStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(['published', 'draft']),
})

export async function setLineStatus(formData: FormData): Promise<void> {
  const parsed = lineStatusSchema.safeParse({
    id: formData.get('id'),
    status: formData.get('status'),
  })
  if (!parsed.success) return

  const ref = await referential()
  const { data } = await ref
    .from('lines')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.id)
    .select('id')

  const fait =
    !data || data.length === 0
      ? 'refus'
      : parsed.data.status === 'published'
        ? 'gamme-publiee'
        : 'gamme-depubliee'

  revalidatePath(routes.adminLines())
  redirect(`${routes.adminLines()}?fait=${fait}`)
}

export async function deleteLine(formData: FormData): Promise<void> {
  const parsed = z.object({ id: z.uuid() }).safeParse({ id: formData.get('id') })
  if (!parsed.success) return

  const ref = await referential()
  const { data } = await ref.from('lines').delete().eq('id', parsed.data.id).select('id')

  revalidatePath(routes.adminLines())
  redirect(`${routes.adminLines()}?fait=${!data || data.length === 0 ? 'refus' : 'gamme-supprimee'}`)
}

/* -------------------------------------------------------------------------- */
/* Shop catalogue (ADR 0015)                                                   */
/* -------------------------------------------------------------------------- */

function productRefusal(code: string | undefined, message: string): string {
  if (code === '42501') return copy.notAdmin
  if (code === '23505') return copy.productExists
  if (code === '23514' && message.includes('VITOLA_TOBACCO_LISTING')) return copy.titleRefused
  return copy.unknown
}

export async function createProduct(
  _previous: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const vendor = z.uuid(copy.vendorNeeded).safeParse(formData.get('vendor'))
  if (!vendor.success) return { error: copy.vendorNeeded }
  const parsed = parseProductForm(formData)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? copy.unknown }

  const refused = refuseTobaccoWording(parsed.data.title, parsed.data.brand, parsed.data.description)
  if (refused) return { error: refused }

  const slug = clubSlug(parsed.data.title)
  if (slug === '') return { error: copy.productTitleNeeded }

  const image = readProductImage(formData)
  if (image.error) return { error: image.error }

  const supabase = await createSupabaseServerClient()
  const { data: session } = await supabase.auth.getUser()
  if (!session.user) return { error: copy.notAdmin }

  const { data, error } = await supabase
    .schema('shop')
    .from('products')
    .insert({
      vendor_id: vendor.data,
      category: parsed.data.category,
      title: parsed.data.title,
      slug,
      brand: parsed.data.brand,
      description: parsed.data.description,
      price_eur: parsed.data.price,
      stock_qty: parsed.data.stock,
      created_by: session.user.id,
    })
    .select('id')

  if (error) return { error: productRefusal(error.code, error.message) }
  if (!data || data.length === 0) return { error: copy.notAdmin }

  const productId = data[0]?.id
  if (image.file && productId) {
    const attach = await attachProductImage(productId, null, image.file)
    if (attach) {
      /* The product exists without its image — a visible, repairable state:
         it shows « Sans image » in the list and the edit panel retries. */
      revalidatePath(routes.adminShop())
      return { error: attach }
    }
  }

  revalidatePath(routes.adminShop())
  revalidatePath(routes.admin())
  return { done: true }
}

export async function updateProduct(
  _previous: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const id = z.uuid().safeParse(formData.get('id'))
  const parsed = parseProductForm(formData)
  if (!id.success || !parsed.success) {
    return { error: parsed.success ? copy.unknown : (parsed.error.issues[0]?.message ?? copy.unknown) }
  }

  const refused = refuseTobaccoWording(parsed.data.title, parsed.data.brand, parsed.data.description)
  if (refused) return { error: refused }

  const image = readProductImage(formData)
  if (image.error) return { error: image.error }

  const supabase = await createSupabaseServerClient()
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
    })
    .eq('id', id.data)
    .select('id, image_path')

  if (error) return { error: productRefusal(error.code, error.message) }
  if (!data || data.length === 0) return { error: copy.notAdmin }

  if (image.file) {
    const attach = await attachProductImage(id.data, data[0]?.image_path ?? null, image.file)
    if (attach) return { error: attach }
  }

  revalidatePath(routes.adminShop())
  return { done: true }
}

const productStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(Constants.shop.Enums.product_status),
})

const PRODUCT_OUTCOME: Record<string, string> = {
  published: 'produit-publie',
  draft: 'produit-depublie',
  archived: 'produit-archive',
}

export async function setProductStatus(formData: FormData): Promise<void> {
  const parsed = productStatusSchema.safeParse({
    id: formData.get('id'),
    status: formData.get('status'),
  })
  if (!parsed.success) return

  const supabase = await createSupabaseServerClient()
  /* Publishing answers the submission and closes the refusal: the queue is
     `submitted_at is not null`, and a stale note under a published sheet
     would read as a live reproach. */
  const patch =
    parsed.data.status === 'published'
      ? { status: parsed.data.status, submitted_at: null, review_note: null }
      : { status: parsed.data.status }
  const { data } = await supabase
    .schema('shop')
    .from('products')
    .update(patch)
    .eq('id', parsed.data.id)
    .select('id')

  const fait = !data || data.length === 0 ? 'refus' : (PRODUCT_OUTCOME[parsed.data.status] ?? 'refus')
  revalidatePath(routes.adminShop())
  redirect(`${routes.adminShop()}?produit=${parsed.data.id}&fait=${fait}`)
}

/**
 * The refusal half of the review (ADR 0016, D3): back to draft with the
 * reason the vendor will read. The row leaves the queue it was clicked in, so
 * the outcome navigates (the /contributions rule). `review_note` is guarded
 * by a trigger — only an admin session gets past it — and zero written rows
 * is a policy refusal, not a success.
 */
const refuseProductSchema = z.object({
  id: z.uuid(),
  note: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1).max(500)),
})

export async function refuseProduct(formData: FormData): Promise<void> {
  const parsed = refuseProductSchema.safeParse({
    id: formData.get('id'),
    note: formData.get('note'),
  })
  if (!parsed.success) return

  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .schema('shop')
    .from('products')
    .update({ submitted_at: null, review_note: parsed.data.note })
    .eq('id', parsed.data.id)
    .select('id')

  revalidatePath(routes.adminShop())
  redirect(`${routes.adminShop()}?fait=${data && data.length > 0 ? 'produit-refuse' : 'refus'}`)
}

/* -------------------------------------------------------------------------- */
/* Marketplace vendors (ADR 0016)                                              */
/* -------------------------------------------------------------------------- */

const createVendorSchema = z.object({
  name: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(2, m.admin.errors.vendorNameNeeded).max(120, m.admin.errors.tooLong)),
  ownerHandle: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z
      .string()
      .transform((value) => value.trim().toLowerCase())
      .nullable(),
  ),
})

/**
 * D1: the entry is human. A vendor is born `pending` (status is outside the
 * INSERT grant), attached to an account when a handle is given — looked up
 * under `profiles_select_directory`, so a hidden profile reads as unknown.
 */
export async function createVendor(_previous: AdminState, formData: FormData): Promise<AdminState> {
  const parsed = createVendorSchema.safeParse({
    name: formData.get('name'),
    ownerHandle: formData.get('ownerHandle'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? copy.unknown }

  const slug = clubSlug(parsed.data.name)
  if (slug === '') return { error: copy.vendorNameNeeded }

  const supabase = await createSupabaseServerClient()

  let ownerId: string | null = null
  if (parsed.data.ownerHandle) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('handle', parsed.data.ownerHandle)
      .maybeSingle()
    if (!profile) return { error: copy.handleUnknown }
    ownerId = profile.id
  }

  const { data, error } = await supabase
    .schema('shop')
    .from('vendors')
    .insert({ name: parsed.data.name, slug, owner_id: ownerId })
    .select('id')

  if (error) {
    if (error.code === '42501') return { error: copy.notAdmin }
    if (error.code === '23505' && error.message.includes('vendors_owner_key')) {
      return { error: copy.handleTaken }
    }
    if (error.code === '23505') return { error: copy.vendorExists }
    if (error.code === '23514' && error.message.includes('VITOLA_TOBACCO_LISTING')) {
      return { error: copy.titleRefused }
    }
    return { error: copy.unknown }
  }
  if (!data || data.length === 0) return { error: copy.notAdmin }

  revalidatePath(routes.adminShopVendors())
  return { done: true }
}

const vendorStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(Constants.shop.Enums.vendor_status),
})

const VENDOR_OUTCOME: Record<string, string> = {
  active: 'vendeur-active',
  suspended: 'vendeur-suspendu',
}

export async function setVendorStatus(formData: FormData): Promise<void> {
  const parsed = vendorStatusSchema.safeParse({
    id: formData.get('id'),
    status: formData.get('status'),
  })
  if (!parsed.success) return

  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .schema('shop')
    .from('vendors')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.id)
    .select('id')

  const fait = !data || data.length === 0 ? 'refus' : (VENDOR_OUTCOME[parsed.data.status] ?? 'refus')
  revalidatePath(routes.adminShopVendors())
  redirect(`${routes.adminShopVendors()}?fait=${fait}`)
}

/**
 * Deleting a vendor is the rare gesture of an empty shop: the FK on products
 * is ON DELETE RESTRICT, so a stocked shop refuses with its reason —
 * suspending is the normal verb (ADR 0016, D4).
 */
export async function deleteVendor(formData: FormData): Promise<void> {
  const parsed = z.object({ id: z.uuid() }).safeParse({ id: formData.get('id') })
  if (!parsed.success) return

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .schema('shop')
    .from('vendors')
    .delete()
    .eq('id', parsed.data.id)
    .select('id')

  const fait = error?.code === '23503' ? 'vendeur-plein' : data && data.length > 0 ? 'vendeur-supprime' : 'refus'
  revalidatePath(routes.adminShopVendors())
  redirect(`${routes.adminShopVendors()}?fait=${fait}`)
}

const attachOwnerSchema = z.object({
  id: z.uuid(),
  handle: z
    .string()
    .transform((value) => value.trim().toLowerCase())
    .pipe(z.string().min(1, m.admin.errors.handleUnknown)),
})

export async function attachVendorOwner(
  _previous: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const parsed = attachOwnerSchema.safeParse({
    id: formData.get('id'),
    handle: formData.get('handle'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? copy.unknown }

  const supabase = await createSupabaseServerClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('handle', parsed.data.handle)
    .maybeSingle()
  if (!profile) return { error: copy.handleUnknown }

  const { data, error } = await supabase
    .schema('shop')
    .from('vendors')
    .update({ owner_id: profile.id })
    .eq('id', parsed.data.id)
    .select('id')

  if (error) {
    if (error.code === '23505') return { error: copy.handleTaken }
    if (error.code === '42501') return { error: copy.notAdmin }
    return { error: copy.unknown }
  }
  if (!data || data.length === 0) return { error: copy.notAdmin }

  revalidatePath(routes.adminShopVendors())
  return { done: true }
}

export async function deleteProduct(formData: FormData): Promise<void> {
  const parsed = z.object({ id: z.uuid() }).safeParse({ id: formData.get('id') })
  if (!parsed.success) return

  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .schema('shop')
    .from('products')
    .delete()
    .eq('id', parsed.data.id)
    .select('id, image_path')

  const deleted = data?.[0]
  if (deleted?.image_path) {
    await supabase.storage.from('shop-images').remove([deleted.image_path])
  }

  revalidatePath(routes.adminShop())
  redirect(`${routes.adminShop()}?fait=${deleted ? 'produit-supprime' : 'refus'}`)
}
