/**
 * Les visuels de démonstration de la boutique — rendus depuis leurs sources,
 * téléversés dans le bucket `shop-images`, rattachés aux lignes.
 *
 *   pnpm tsx tooling/scripts/shop-demo-images.ts             # rend, puis téléverse
 *   pnpm tsx tooling/scripts/shop-demo-images.ts --dry-run   # rend seulement
 *   pnpm tsx tooling/scripts/shop-demo-images.ts --replace   # remplace un visuel déjà posé
 *
 * Les sources sont les SVG de `supabase/seed/shop-images/` : un fichier par
 * slug de produit (`<slug>.svg`) et un par vendeur (`vendor-<slug>.svg`). Ce
 * sont **nos propres planches** — dessinées pour ce projet, sans marque
 * réelle et sans tabac, dans le style de la planche de l'accueil : un objet
 * en trait, des cotes en mesures et non en adjectifs. Leur provenance est
 * consignée dans `supabase/seed/PROVENANCE.md`, §8.
 *
 * Le rendu passe par le Chromium de Playwright, déjà dans le dépôt : le
 * bucket n'accepte pas le SVG (webp, jpeg, png, avif — migration 0021), et
 * ajouter un rasteriseur pour douze images serait une dépendance sans
 * justification (§3).
 *
 * Le téléversement se fait **sous la session de l'admin**, avec la clé
 * publiable — jamais la clé de service : `storage_shop_images_insert`
 * (0021) autorise un admin partout dans le bucket, `products_update_admin`
 * et `vendors_update_admin` posent le chemin. La RLS décide, comme pour
 * l'écran. L'ordre est celui de `lib/shop/images.ts` (ADR 0015) :
 * téléverser, pointer la ligne, retirer l'ancien objet — un échec au milieu
 * laisse une ligne dont l'image se rend encore.
 *
 * Trois refus, parce qu'un visuel de démonstration ne remplace jamais ce
 * qu'une personne a posé :
 *   - un produit qui a un `created_by` n'est pas un produit seedé — la
 *     planche est ignorée et dite ;
 *   - une image ou un logo déjà en place n'est pas écrasé sans `--replace` ;
 *   - un slug sans ligne en base est dit, pas inventé.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

import type { Database } from '../../lib/supabase/database.types'

const SOURCES = 'supabase/seed/shop-images'
const BUCKET = 'shop-images'

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const REPLACE = args.includes('--replace')
const OUT =
  args.find((arg) => arg.startsWith('--out='))?.slice('--out='.length) ??
  join(process.env.TMPDIR ?? '/tmp', 'vitola-shop-images')

const ADMIN = process.env.PARCOURS_ADMIN ?? 'jgueniche06@gmail.com'
const PASSWORD = process.env.PARCOURS_PASSWORD ?? 'cigardeur'

type Plate = { file: string; kind: 'product' | 'vendor'; slug: string; svg: string }

function plates(): Plate[] {
  return readdirSync(SOURCES)
    .filter((file) => file.endsWith('.svg'))
    .sort()
    .map((file) => {
      const stem = basename(file, '.svg')
      const vendor = stem.startsWith('vendor-')
      return {
        file,
        kind: vendor ? 'vendor' : 'product',
        slug: vendor ? stem.slice('vendor-'.length) : stem,
        svg: readFileSync(join(SOURCES, file), 'utf8'),
      }
    })
}

function dimensions(svg: string): { width: number; height: number } {
  const width = Number(/\swidth="(\d+)"/.exec(svg)?.[1] ?? '0')
  const height = Number(/\sheight="(\d+)"/.exec(svg)?.[1] ?? '0')
  if (width === 0 || height === 0)
    throw new Error('un SVG sans width/height ne se rend pas à taille fixe')
  return { width, height }
}

/** Rend chaque planche en PNG, à sa taille nominale, facteur 1. */
async function rasterise(sources: Plate[]): Promise<Map<string, Buffer>> {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  })
  const rendered = new Map<string, Buffer>()
  try {
    const context = await browser.newContext({ deviceScaleFactor: 1 })
    const page = await context.newPage()
    for (const plate of sources) {
      const { width, height } = dimensions(plate.svg)
      await page.setViewportSize({ width, height })
      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">${plate.svg}</body></html>`,
      )
      await page.waitForTimeout(150)
      const png = await page.locator('svg').screenshot({ type: 'png' })
      rendered.set(plate.file, png)
    }
  } finally {
    await browser.close()
  }
  return rendered
}

async function main(): Promise<void> {
  const sources = plates()
  if (sources.length === 0) throw new Error(`aucune planche dans ${SOURCES}`)

  console.log(`— rendu de ${sources.length} planche(s) depuis ${SOURCES}`)
  const rendered = await rasterise(sources)
  mkdirSync(OUT, { recursive: true })
  for (const [file, png] of rendered) {
    const target = join(OUT, file.replace(/\.svg$/, '.png'))
    writeFileSync(target, png)
    console.log(`  ${file} → ${target} (${Math.round(png.byteLength / 1024)} Ko)`)
  }
  if (DRY_RUN) {
    console.log('\n— --dry-run : rien n’est téléversé.')
    return
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY sont nécessaires — la clé publiable, jamais la clé de service.',
    )
  }
  const db = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const signed = await db.auth.signInWithPassword({ email: ADMIN, password: PASSWORD })
  if (signed.error) throw new Error(`connexion admin refusée : ${signed.error.message}`)

  console.log(`\n— téléversement sous la session de ${ADMIN}`)
  let attached = 0
  let skipped = 0
  const problems: string[] = []

  for (const plate of sources) {
    const png = rendered.get(plate.file)
    if (!png) continue

    if (plate.kind === 'product') {
      const { data: row, error } = await db
        .schema('shop')
        .from('products')
        .select('id, slug, title, image_path, created_by')
        .eq('slug', plate.slug)
        .maybeSingle()
      if (error) {
        problems.push(`${plate.file} : lecture refusée — ${error.message}`)
        continue
      }
      if (!row) {
        console.log(`  (—) ${plate.file} : aucun produit au slug « ${plate.slug} »`)
        skipped += 1
        continue
      }
      if (row.created_by !== null) {
        console.log(
          `  (—) ${plate.file} : « ${row.title} » a un auteur — pas un produit seedé, ignoré`,
        )
        skipped += 1
        continue
      }
      if (row.image_path !== null && !REPLACE) {
        console.log(
          `  (—) ${plate.file} : « ${row.title} » a déjà une image — --replace pour la remplacer`,
        )
        skipped += 1
        continue
      }
      const path = `products/${row.id}/${Date.now()}.png`
      const upload = await db.storage.from(BUCKET).upload(path, png, { contentType: 'image/png' })
      if (upload.error) {
        problems.push(`${plate.file} : téléversement refusé — ${upload.error.message}`)
        continue
      }
      const { data: pointed, error: pointError } = await db
        .schema('shop')
        .from('products')
        .update({ image_path: path })
        .eq('id', row.id)
        .select('id')
      if (pointError || !pointed || pointed.length === 0) {
        problems.push(
          `${plate.file} : la ligne n’a pas pris le chemin — ${pointError?.message ?? '0 ligne'}`,
        )
        continue
      }
      if (row.image_path) await db.storage.from(BUCKET).remove([row.image_path])
      console.log(`  ok  ${plate.file} → ${path} (« ${row.title} »)`)
      attached += 1
    } else {
      const { data: row, error } = await db
        .schema('shop')
        .from('vendors')
        .select('id, slug, name, logo_path')
        .eq('slug', plate.slug)
        .maybeSingle()
      if (error) {
        problems.push(`${plate.file} : lecture refusée — ${error.message}`)
        continue
      }
      if (!row) {
        console.log(`  (—) ${plate.file} : aucun vendeur au slug « ${plate.slug} »`)
        skipped += 1
        continue
      }
      if (row.logo_path !== null && !REPLACE) {
        console.log(
          `  (—) ${plate.file} : « ${row.name} » a déjà un logo — --replace pour le remplacer`,
        )
        skipped += 1
        continue
      }
      const path = `vendors/${row.id}/${Date.now()}.png`
      const upload = await db.storage.from(BUCKET).upload(path, png, { contentType: 'image/png' })
      if (upload.error) {
        problems.push(`${plate.file} : téléversement refusé — ${upload.error.message}`)
        continue
      }
      const { data: pointed, error: pointError } = await db
        .schema('shop')
        .from('vendors')
        .update({ logo_path: path })
        .eq('id', row.id)
        .select('id')
      if (pointError || !pointed || pointed.length === 0) {
        problems.push(
          `${plate.file} : la ligne n’a pas pris le chemin — ${pointError?.message ?? '0 ligne'}`,
        )
        continue
      }
      if (row.logo_path) await db.storage.from(BUCKET).remove([row.logo_path])
      console.log(`  ok  ${plate.file} → ${path} (« ${row.name} »)`)
      attached += 1
    }
  }

  await db.auth.signOut()

  console.log(
    `\n${attached} visuel(s) rattaché(s), ${skipped} ignoré(s), ${problems.length} problème(s)`,
  )
  for (const problem of problems) console.log(`  - ${problem}`)
  if (problems.length > 0) process.exitCode = 1
}

void main().catch((cause) => {
  console.error(String(cause))
  process.exitCode = 1
})
