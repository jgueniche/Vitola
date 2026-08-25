/**
 * Le parcours du catalogue (ADR 0015), contre la vraie base, deux rôles.
 *
 *   pnpm build && pnpm start --port 3100
 *   pnpm tsx tooling/parcours/boutique.ts
 *
 * Il écrit un vrai produit (image comprise, dans le bucket privé) et nettoie
 * PAR LE PRODUIT : la suppression retire la ligne et son image — le compte en
 * base et dans le bucket se fait par la session après coup. Le garde-fou
 * lexical est mis en scène des deux côtés : le refus à l'écran ici, le refus
 * du trigger dans supabase/tests/16_shop_rls.sql.
 */

import { chromium, type Browser, type Page } from '@playwright/test'

const BASE = process.env.PARCOURS_BASE ?? 'http://127.0.0.1:3100'
const PASSWORD = process.env.PARCOURS_PASSWORD ?? 'cigardeur'
const MEMBER = process.env.PARCOURS_USER_ONE ?? 'test1@cigardeur.com'
const ADMIN = process.env.PARCOURS_ADMIN ?? 'jgueniche06@gmail.com'
const PRODUCT = 'Coupe-cigare Parcours'

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

let passed = 0
const failures: string[] = []

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1
    console.log(`  ok   ${label}`)
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function contains(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase())
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('load')
  await page.waitForTimeout(1000)
}

async function text(page: Page): Promise<string> {
  return (await page.locator('main').innerText().catch(() => '')) ?? ''
}

async function settled(page: Page, timeoutMs = 20000): Promise<{ ok: boolean; message: string }> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const alerts = (await page.locator('[role="alert"]').allInnerTexts()).filter(
      (item) => item.trim() !== '',
    )
    if (alerts.length > 0) return { ok: false, message: alerts[0] ?? '' }
    if ((await page.locator('[role="status"]').count()) > 0) return { ok: true, message: '' }
    await page.waitForTimeout(300)
  }
  return { ok: false, message: '(aucune réponse en 20 s)' }
}

async function landed(page: Page, fait: string): Promise<boolean> {
  try {
    await page.waitForURL(new RegExp(`fait=${fait}`), { timeout: 15000 })
    await settle(page)
    return true
  } catch {
    return false
  }
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto(`${BASE}/majorite`)
  await settle(page)
  await page.locator('input[name="birthDate"]').fill('1985-04-02')
  await page.getByRole('button', { name: /entrer|valider|confirmer/i }).first().click()
  await settle(page)
  await page.goto(`${BASE}/connexion`)
  await settle(page)
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await settle(page)
}

async function main(): Promise<void> {
  const browser: Browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  })
  const member = await (await browser.newContext()).newPage()
  const admin = await (await browser.newContext()).newPage()
  admin.on('dialog', (dialog) => void dialog.accept())

  try {
    console.log('\n1. Un membre lit pourquoi le catalogue lui est fermé')
    await signIn(member, MEMBER)
    await member.goto(`${BASE}/admin/boutique`)
    await settle(member)
    check('le catalogue se refuse', contains(await text(member), 'Réservé aux administrateurs'))

    console.log('\n2. Le garde-fou lexical refuse à l’écran, en français')
    await signIn(admin, ADMIN)
    await admin.goto(`${BASE}/admin/boutique`)
    await settle(admin)
    check('le catalogue est vide, et c’est un écran', contains(await text(admin), 'catalogue est vide'))

    await admin.locator('select[name="category"]').selectOption({ value: 'autre' })
    await admin.locator('input[name="title"]').fill('Boîte de 25 havanes')
    await admin.locator('input[name="price"]').fill('100')
    await admin.getByRole('button', { name: 'Créer en brouillon' }).click()
    const tobacco = await settled(admin)
    check(
      'un produit du tabac est refusé avec le §2',
      !tobacco.ok && contains(tobacco.message, 'accessoires'),
      tobacco.message,
    )

    console.log('\n3. Un accessoire se crée — virgule française, image comprise')
    await admin.goto(`${BASE}/admin/boutique`)
    await settle(admin)
    await admin.locator('select[name="category"]').selectOption({ value: 'coupe' })
    await admin.locator('input[name="title"]').fill(PRODUCT)
    await admin.locator('textarea[name="description"]').fill('Double lame, acier inoxydable.')
    await admin.locator('input[name="price"]').fill('24,90')
    await admin.locator('input[name="stock"]').fill('5')
    await admin.locator('input[name="image"]').setInputFiles({
      name: 'coupe.png',
      mimeType: 'image/png',
      buffer: PNG_1PX,
    })
    await admin.getByRole('button', { name: 'Créer en brouillon' }).click()
    const created = await settled(admin)
    check('la création confirme', created.ok, created.message)
    await settle(admin)
    const list = await text(admin)
    check('le produit est au catalogue, en brouillon', contains(list, PRODUCT) && contains(list, 'Brouillon'))
    check('au prix français', contains(list, '24,90'))

    console.log('\n4. Le panneau d’édition vit dans l’URL, l’image se voit')
    await admin.locator('main a', { hasText: 'Modifier' }).first().click()
    await admin.waitForURL(/produit=/, { timeout: 15000 })
    await settle(admin)
    check('le panneau porte le produit', contains(await text(admin), 'Modifier le produit'))
    check(
      'l’image téléversée se rend (URL signée sur bucket privé)',
      (await admin.locator('main img').count()) > 0,
    )

    await admin.locator('input[name="price"]').fill('19,90')
    await admin.getByRole('button', { name: 'Enregistrer' }).click()
    const saved = await settled(admin)
    check('la modification confirme', saved.ok, saved.message)
    await settle(admin)
    check('et le prix a bougé', contains(await text(admin), '19,90'), (await text(admin)).slice(0, 400))

    console.log('\n5. Publier, archiver, ressortir — l’état navigue avec sa confirmation')
    await admin.getByRole('button', { name: 'Publier' }).click()
    check('publié', await landed(admin, 'produit-publie'), admin.url())
    check('le panneau est resté ouvert', contains(await text(admin), 'Modifier le produit'))
    await admin.getByRole('button', { name: 'Archiver' }).click()
    check('archivé', await landed(admin, 'produit-archive'), admin.url())
    await admin.getByRole('button', { name: /Ressortir/ }).click()
    check('ressorti en brouillon', await landed(admin, 'produit-depublie'), admin.url())

    console.log('\n6. Supprimer retire le produit et son image')
    await admin.getByRole('button', { name: 'Supprimer' }).click()
    check('la suppression confirme', await landed(admin, 'produit-supprime'), admin.url())
    check('le catalogue est revenu à vide', contains(await text(admin), 'catalogue est vide'))
  } catch (cause) {
    failures.push(`exception : ${String(cause)}`)
    console.log(`  FAIL exception : ${String(cause)}`)
  } finally {
    await browser.close()
  }

  console.log(`\n${passed} assertions passées, ${failures.length} échec(s)`)
  for (const failure of failures) console.log(`  - ${failure}`)
  console.log('\n→ La session compte en base : 0 produit, 0 objet dans shop-images.')
  process.exit(failures.length === 0 ? 0 : 1)
}

void main()
