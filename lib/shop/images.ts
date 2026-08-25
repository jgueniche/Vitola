import { m } from '@/lib/i18n'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Uploads the file, points the row at it, and only then drops the old object —
 * in that order, so a failure anywhere leaves a row whose image still renders
 * (decisions-log, ADR 0015). Shared by the admin catalogue and the vendor
 * space: both write under their own session, so the RLS of `shop.products`
 * and the storage policies decide — an admin reaches everything, a vendor
 * only their own prefixes.
 *
 * Returns null on success, the refusal sentence otherwise.
 */
export async function attachProductImage(
  productId: string,
  previousPath: string | null,
  file: File,
): Promise<string | null> {
  const supabase = await createSupabaseServerClient()
  const path = `products/${productId}/${Date.now()}.${file.type.split('/')[1] ?? 'webp'}`

  const { error: uploadError } = await supabase.storage
    .from('shop-images')
    .upload(path, file, { contentType: file.type })
  if (uploadError) return m.admin.errors.unknown

  const { data } = await supabase
    .schema('shop')
    .from('products')
    .update({ image_path: path })
    .eq('id', productId)
    .select('id')
  if (!data || data.length === 0) return m.admin.errors.unknown

  if (previousPath) await supabase.storage.from('shop-images').remove([previousPath])
  return null
}

/** Same order, same reasons, for a shopfront logo (`vendors/<id>/…`). */
export async function attachVendorLogo(
  vendorId: string,
  previousPath: string | null,
  file: File,
): Promise<string | null> {
  const supabase = await createSupabaseServerClient()
  const path = `vendors/${vendorId}/${Date.now()}.${file.type.split('/')[1] ?? 'webp'}`

  const { error: uploadError } = await supabase.storage
    .from('shop-images')
    .upload(path, file, { contentType: file.type })
  if (uploadError) return m.admin.errors.unknown

  const { data } = await supabase
    .schema('shop')
    .from('vendors')
    .update({ logo_path: path })
    .eq('id', vendorId)
    .select('id')
  if (!data || data.length === 0) return m.admin.errors.unknown

  if (previousPath) await supabase.storage.from('shop-images').remove([previousPath])
  return null
}
