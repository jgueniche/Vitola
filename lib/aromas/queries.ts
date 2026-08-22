import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * The aroma wheel (§5.4), read as the tree it is.
 *
 * `public.aroma_taxonomy` is reference data — public read, editor write — and
 * the seed keeps it exactly two levels deep: a family, its descriptors, nothing
 * below. `01_seed_integrity.sql` fails if a third level ever appears, so this
 * function is allowed to assume the shape rather than recurse.
 *
 * One query, grouped in memory. Eighty-seven rows is not a place to be clever.
 */

export type AromaDescriptor = {
  id: number
  slug: string
  label: string
}

export type AromaFamily = AromaDescriptor & {
  family: string
  descriptors: AromaDescriptor[]
}

export async function listAromaWheel(): Promise<AromaFamily[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('aroma_taxonomy')
    .select('id, parent_id, family, slug, label_fr')
    .order('id', { ascending: true })

  if (error) throw new Error(`Could not read the aroma wheel: ${error.message}`)

  const rows = data ?? []
  const families = new Map<number, AromaFamily>()

  for (const row of rows) {
    if (row.parent_id === null) {
      families.set(row.id, {
        id: row.id,
        slug: row.slug,
        label: row.label_fr,
        family: row.family,
        descriptors: [],
      })
    }
  }

  for (const row of rows) {
    if (row.parent_id === null) continue
    // A descriptor whose family is missing is a broken tree, and the seed
    // refuses to load one. Skipping is the right behaviour if it ever happens:
    // an incomplete wheel beats a page that will not render.
    families.get(row.parent_id)?.descriptors.push({
      id: row.id,
      slug: row.slug,
      label: row.label_fr,
    })
  }

  return [...families.values()]
}
