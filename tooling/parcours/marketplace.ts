/**
 * Le parcours de la marketplace (ADR 0016), contre la vraie base, quatre
 * rôles : un visiteur (portail passé, sans compte), un membre (`test_un`), le
 * vendeur (`vendeur` — rattaché à la boutique de QA « Comptoir du Cèdre »,
 * fixture durable comme les comptes) et l'admin (`jeremy`).
 *
 *   pnpm build && pnpm start --port 3100
 *   pnpm tsx tooling/parcours/marketplace.ts
 *
 * Ce qu'il met en scène, dans l'ordre où la vie le fera : le drapeau fermé
 * (tout /boutique répond 404, même à un produit publié), l'espace vendeur
 * refusé à qui n'a pas de boutique, le cycle brouillon → soumission → refus
 * motivé → re-soumission → publication, l'ouverture du drapeau PAR L'ÉCRAN
 * des drapeaux, les deux entrées publiques (recherche facettée et vitrine),
 * la suspension qui coupe tout, le retrait puis la suppression par le
 * vendeur, et la fermeture du drapeau.
 *
 * Il nettoie derrière lui : le produit part par l'espace vendeur (ligne et
 * image), la boutique jetable par l'écran des vendeurs, le drapeau se
 * referme. Les bascules du drapeau restent dans audit_log — un journal ne se
 * nettoie pas. Ce qui reste en base : les deux vendeurs durables (« Vitola »
 * et « Comptoir du Cèdre »), zéro produit.
 */

import { chromium, type Browser, type Page } from '@playwright/test'

const BASE = process.env.PARCOURS_BASE ?? 'http://127.0.0.1:3100'
const PASSWORD = process.env.PARCOURS_PASSWORD ?? 'cigardeur'
const MEMBER = process.env.PARCOURS_USER_ONE ?? 'test1@cigardeur.com'
const VENDOR = process.env.PARCOURS_VENDOR ?? 'vendeur@cigardeur.com'
const ADMIN = process.env.PARCOURS_ADMIN ?? 'jgueniche06@gmail.com'

const PRODUCT = 'Hygromètre à cheveu Parcours'
const BRAND = 'Les Fines Lames'
const THROWAWAY = 'Éphémère Parcours'

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
    /* Le route announcer de Next porte role="alert" et annonce le TITRE de la
       page après une navigation côté client : sans l'exclure, un formulaire
       ouvert par un <Link> lit « Ma boutique — … » comme un refus. */
    const alerts = (
      await page.locator('[role="alert"]:not(#__next-route-announcer__)').allInnerTexts()
    ).filter((item) => item.trim() !== '')
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

async function is404(page: Page, url: string): Promise<boolean> {
  const response = await page.goto(url)
  await settle(page)
  return response?.status() === 404
}

async function passGate(page: Page): Promise<void> {
  await page.goto(`${BASE}/majorite`)
  await settle(page)
  await page.locator('input[name="birthDate"]').fill('1985-04-02')
  await page.getByRole('button', { name: /entrer|valider|confirmer/i }).first().click()
  await settle(page)
}

async function signIn(page: Page, email: string): Promise<void> {
  await passGate(page)
  await page.goto(`${BASE}/connexion`)
  await settle(page)
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await settle(page)
}

/** The one flag toggle: the button inside shop_enabled's own form. */
async function toggleShopFlag(admin: Page, direction: 'Activer' | 'Couper'): Promise<boolean> {
  await admin.goto(`${BASE}/admin/drapeaux`)
  await settle(admin)
  const form = admin.locator('form:has(input[name="key"][value="shop_enabled"])')
  await form.getByRole('button', { name: direction, exact: true }).click()
  const result = await settled(admin)
  return result.ok
}

/**
 * Le formulaire produit, borné : la page du vendeur porte AUSSI le formulaire
 * de vitrine, et deux `textarea[name="description"]` cohabitent — le mode
 * strict de Playwright refuse un sélecteur non borné (la leçon des deux
 * groupes de radios de P5). Le formulaire produit est le seul à porter le
 * sélecteur de catégorie.
 */
function productForm(page: Page) {
  return page.locator('form:has(select[name="category"])')
}

async function main(): Promise<void> {
  const browser: Browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  })
  const visitor = await (await browser.newContext()).newPage()
  const member = await (await browser.newContext()).newPage()
  const vendor = await (await browser.newContext()).newPage()
  const admin = await (await browser.newContext()).newPage()
  vendor.on('dialog', (dialog) => void dialog.accept())
  admin.on('dialog', (dialog) => void dialog.accept())

  try {
    console.log('\n1. Drapeau fermé : toute la boutique publique répond 404')
    await passGate(visitor)
    check('/boutique est un 404', await is404(visitor, `${BASE}/boutique`))
    check(
      'la vitrine du vendeur de QA aussi',
      await is404(visitor, `${BASE}/boutique/vendeurs/comptoir-du-cedre`),
    )

    console.log('\n2. L’espace vendeur se refuse à qui n’a pas de boutique')
    await signIn(member, MEMBER)
    await member.goto(`${BASE}/vendeur`)
    await settle(member)
    check(
      'un membre lit pourquoi, jamais une page blanche',
      contains(await text(member), 'Réservé aux vendeurs partenaires'),
    )

    console.log('\n3. Le vendeur entre chez lui par /parametres')
    await signIn(vendor, VENDOR)
    await vendor.goto(`${BASE}/parametres`)
    await settle(vendor)
    check('le lien « Gérer ma boutique » est là', contains(await text(vendor), 'Gérer ma boutique'))
    await vendor.goto(`${BASE}/vendeur`)
    await settle(vendor)
    check(
      'sa boutique porte son nom',
      contains(await text(vendor), 'Comptoir du Cèdre'),
      (await text(vendor)).slice(0, 300),
    )

    console.log('\n4. Le garde-fou lexical refuse au vendeur comme à l’admin')
    await productForm(vendor).locator('select[name="category"]').selectOption({ value: 'autre' })
    await productForm(vendor).locator('input[name="title"]').fill('Boîte de 25 havanes')
    await productForm(vendor).locator('input[name="price"]').fill('100')
    await productForm(vendor).getByRole('button', { name: 'Créer en brouillon' }).click()
    const tobacco = await settled(vendor)
    check(
      'un produit du tabac est refusé avec le §2',
      !tobacco.ok && contains(tobacco.message, 'accessoires'),
      tobacco.message,
    )

    console.log('\n5. Un accessoire naît en brouillon, avec sa marque et son image')
    await vendor.goto(`${BASE}/vendeur`)
    await settle(vendor)
    await productForm(vendor).locator('select[name="category"]').selectOption({ value: 'hygrometre' })
    await productForm(vendor).locator('input[name="title"]').fill(PRODUCT)
    await productForm(vendor).locator('input[name="brand"]').fill(BRAND)
    await productForm(vendor)
      .locator('textarea[name="description"]')
      .fill('Cadran laiton, étalonnage au sel. Se recale en dix minutes.')
    await productForm(vendor).locator('input[name="price"]').fill('34,50')
    await productForm(vendor).locator('input[name="stock"]').fill('3')
    await productForm(vendor).locator('input[name="image"]').setInputFiles({
      name: 'hygro.png',
      mimeType: 'image/png',
      buffer: PNG_1PX,
    })
    await productForm(vendor).getByRole('button', { name: 'Créer en brouillon' }).click()
    const created = await settled(vendor)
    check('la création confirme', created.ok, created.message)
    await settle(vendor)
    check('le produit est là, en brouillon', contains(await text(vendor), 'Brouillon'))
    check('aucun bouton « Publier » chez le vendeur', !(await text(vendor)).includes('Publier'))

    console.log('\n6. Soumettre à relecture')
    await vendor.locator('main a', { hasText: 'Modifier' }).first().click()
    await vendor.waitForURL(/produit=/, { timeout: 15000 })
    await settle(vendor)
    await vendor.getByRole('button', { name: 'Soumettre à relecture' }).click()
    check('la soumission confirme', await landed(vendor, 'produit-soumis'), vendor.url())
    check('le badge dit « Soumis à relecture »', contains(await text(vendor), 'Soumis à relecture'))

    console.log('\n7. L’admin refuse, avec un motif que le vendeur lira')
    await signIn(admin, ADMIN)
    await admin.goto(`${BASE}/admin/boutique`)
    await settle(admin)
    const queue = await text(admin)
    check('la file porte la soumission', contains(queue, PRODUCT))
    check('et le nom du vendeur', contains(queue, 'Comptoir du Cèdre'))
    await admin
      .locator(`main li:has-text("${PRODUCT}") textarea[name="note"]`)
      .fill('Précisez le diamètre du cadran.')
    await admin.locator(`main li:has-text("${PRODUCT}")`).getByRole('button', { name: 'Refuser' }).click()
    check('le refus confirme', await landed(admin, 'produit-refuse'), admin.url())

    console.log('\n8. Le vendeur lit le motif, corrige, re-soumet')
    await vendor.goto(`${BASE}/vendeur`)
    await settle(vendor)
    check('le motif est sur le brouillon', contains(await text(vendor), 'diamètre du cadran'))
    await vendor.locator('main a', { hasText: 'Modifier' }).first().click()
    await vendor.waitForURL(/produit=/, { timeout: 15000 })
    await settle(vendor)
    await productForm(vendor)
      .locator('textarea[name="description"]')
      .fill('Cadran laiton de 45 mm, étalonnage au sel. Se recale en dix minutes.')
    await productForm(vendor).getByRole('button', { name: 'Enregistrer le brouillon' }).click()
    const fixed = await settled(vendor)
    check('la correction confirme', fixed.ok, fixed.message)
    await settle(vendor)
    await vendor.getByRole('button', { name: 'Soumettre à relecture' }).click()
    check('la re-soumission confirme', await landed(vendor, 'produit-soumis'), vendor.url())

    console.log('\n9. L’admin publie — et le drapeau fermé tient toujours la porte')
    await admin.goto(`${BASE}/admin/boutique`)
    await settle(admin)
    await admin.locator(`main li:has-text("${PRODUCT}")`).getByRole('button', { name: 'Publier' }).click()
    check('la publication confirme', await landed(admin, 'produit-publie'), admin.url())
    check(
      'produit publié, boutique toujours 404 : le drapeau décide',
      await is404(visitor, `${BASE}/boutique`),
    )

    console.log('\n10. L’admin ouvre le drapeau depuis /admin/drapeaux')
    check('la bascule confirme', await toggleShopFlag(admin, 'Activer'))

    console.log('\n11. La recherche transversale : facettes et texte')
    await visitor.goto(`${BASE}/boutique`)
    await settle(visitor)
    const shelf = await text(visitor)
    check('le produit est au rayon', contains(shelf, PRODUCT))
    check('avec sa marque', contains(shelf, BRAND))
    check('et son vendeur', contains(shelf, 'Comptoir du Cèdre'))
    await visitor.goto(`${BASE}/boutique?marque=${encodeURIComponent(BRAND)}`)
    await settle(visitor)
    check('la facette marque filtre', contains(await text(visitor), PRODUCT))
    await visitor.goto(`${BASE}/boutique?prix=25-50`)
    await settle(visitor)
    check('la tranche de prix filtre', contains(await text(visitor), PRODUCT))
    await visitor.goto(`${BASE}/boutique?q=hygrometre`)
    await settle(visitor)
    check('la recherche replie les accents', contains(await text(visitor), PRODUCT))
    await visitor.goto(`${BASE}/boutique?categorie=coupe`)
    await settle(visitor)
    check('une facette vide est un écran', contains(await text(visitor), 'Aucun produit ne correspond'))

    console.log('\n12. La fiche produit : prix, liens, pas de promesse d’achat')
    await visitor.goto(`${BASE}/boutique`)
    await settle(visitor)
    const href = await visitor.locator(`main a:has-text("${PRODUCT}")`).first().getAttribute('href')
    check('la fiche a une adresse', href !== null, String(href))
    await visitor.goto(`${BASE}${href}`)
    await settle(visitor)
    const sheet = await text(visitor)
    check('le prix français', contains(sheet, '34,50'))
    check('« Vendu par » en lien', contains(sheet, 'Vendu par'))
    check('l’état du stock', contains(sheet, 'En stock'))
    check('la commande n’est pas promise', contains(sheet, 'pas encore ouverte'))
    check('les avis attendent la caisse', contains(sheet, 'achat vérifié'))
    check('aucun bouton d’achat', (await visitor.locator('main button').count()) === 0)

    console.log('\n13. La vitrine — la seconde entrée')
    await visitor.goto(`${BASE}/boutique/vendeurs/comptoir-du-cedre`)
    await settle(visitor)
    const front = await text(visitor)
    check('la vitrine porte le nom', contains(front, 'Comptoir du Cèdre'))
    check('et le produit', contains(front, PRODUCT))

    console.log('\n14. Le hub Autour offre la carte, drapeau ouvert')
    await member.goto(`${BASE}/autour`)
    await settle(member)
    check('la carte boutique est là', contains(await text(member), 'La boutique'))

    console.log('\n15. La vitrine s’édite, identité professionnelle comprise')
    await vendor.goto(`${BASE}/vendeur`)
    await settle(vendor)
    const storefrontForm = vendor.locator('form:has(input[name="legalName"])')
    await storefrontForm.locator('input[name="legalName"]').fill('Comptoir du Cèdre SARL (QA)')
    await storefrontForm.locator('input[name="registration"]').fill('000000000')
    await storefrontForm.locator('input[name="address"]').fill('1 rue du Parcours, 75000 Paris (QA)')
    await storefrontForm.locator('input[name="contactEmail"]').fill('vendeur@cigardeur.com')
    await storefrontForm.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    const storefront = await settled(vendor)
    check('la vitrine enregistre', storefront.ok, storefront.message)

    console.log('\n16. La suspension coupe tout — vitrine, produits, plume')
    await admin.goto(`${BASE}/admin/boutique/vendeurs`)
    await settle(admin)
    const desk = await text(admin)
    check('le bureau liste la boutique de QA', contains(desk, 'Comptoir du Cèdre'))
    check('rattachée à son compte', contains(desk, '@vendeur'))
    check('la traçabilité se lit', contains(desk, 'Traçabilité'))
    await admin
      .locator('main li:has-text("Comptoir du Cèdre")')
      .getByRole('button', { name: 'Suspendre' })
      .click()
    check('la suspension confirme', await landed(admin, 'vendeur-suspendu'), admin.url())
    check('la vitrine répond 404', await is404(visitor, `${BASE}/boutique/vendeurs/comptoir-du-cedre`))
    check('le produit publié aussi', await is404(visitor, `${BASE}${href}`))
    await visitor.goto(`${BASE}/boutique`)
    await settle(visitor)
    check('le rayon est redevenu vide', !contains(await text(visitor), PRODUCT))
    await vendor.goto(`${BASE}/vendeur`)
    await settle(vendor)
    check('le vendeur lit sa suspension', contains(await text(vendor), 'suspendue'))

    console.log('\n17. La réactivation rend tout')
    await admin
      .locator('main li:has-text("Comptoir du Cèdre")')
      .getByRole('button', { name: 'Réactiver' })
      .click()
    check('la réactivation confirme', await landed(admin, 'vendeur-active'), admin.url())
    check('la vitrine revit', !(await is404(visitor, `${BASE}/boutique/vendeurs/comptoir-du-cedre`)))

    console.log('\n18. Une boutique jetable : créer, activer, supprimer vide')
    await admin.goto(`${BASE}/admin/boutique/vendeurs`)
    await settle(admin)
    await admin.locator('input[name="name"]').fill(THROWAWAY)
    await admin.getByRole('button', { name: 'Créer (en attente)' }).click()
    const born = await settled(admin)
    check('la création confirme', born.ok, born.message)
    await settle(admin)
    check('née « En attente »', contains(await text(admin), 'En attente'))
    await admin
      .locator(`main li:has-text("${THROWAWAY}")`)
      .getByRole('button', { name: 'Activer' })
      .click()
    check('l’activation confirme', await landed(admin, 'vendeur-active'), admin.url())
    await admin
      .locator(`main li:has-text("${THROWAWAY}")`)
      .getByRole('button', { name: 'Suspendre' })
      .click()
    check('la suspension confirme', await landed(admin, 'vendeur-suspendu'), admin.url())
    await admin
      .locator(`main li:has-text("${THROWAWAY}")`)
      .getByRole('button', { name: 'Supprimer' })
      .click()
    check('une boutique vide se supprime', await landed(admin, 'vendeur-supprime'), admin.url())
    check('et n’est plus au bureau', !contains(await text(admin), THROWAWAY))

    console.log('\n19. Le vendeur retire sa fiche, puis la supprime — le nettoyage est le sien')
    await vendor.goto(`${BASE}/vendeur`)
    await settle(vendor)
    await vendor.locator('main a', { hasText: 'Modifier' }).first().click()
    await vendor.waitForURL(/produit=/, { timeout: 15000 })
    await settle(vendor)
    check('l’écran prévient : modifier, c’est retirer', contains(await text(vendor), 'retire de la vente'))
    await vendor.getByRole('button', { name: 'Retirer de la vente' }).click()
    check('le retrait confirme', await landed(vendor, 'produit-retire'), vendor.url())
    await settle(vendor)
    await vendor.getByRole('button', { name: 'Supprimer' }).click()
    check('la suppression confirme', await landed(vendor, 'produit-supprime'), vendor.url())
    check('l’atelier est revenu à vide', contains(await text(vendor), 'Aucun produit'))

    console.log('\n20. L’admin referme le drapeau — la porte retombe')
    check('la bascule confirme', await toggleShopFlag(admin, 'Couper'))
    check('/boutique est de nouveau un 404', await is404(visitor, `${BASE}/boutique`))
  } catch (cause) {
    failures.push(`exception : ${String(cause)}`)
    console.log(`  FAIL exception : ${String(cause)}`)
  } finally {
    await browser.close()
  }

  console.log(`\n${passed} assertions passées, ${failures.length} échec(s)`)
  for (const failure of failures) console.log(`  - ${failure}`)
  console.log(
    '\n→ La session compte en base : 0 produit, 2 vendeurs (Vitola, Comptoir du Cèdre), 0 objet dans shop-images.',
  )
  console.log('→ Les bascules de shop_enabled restent dans audit_log : un journal ne se nettoie pas.')
  process.exit(failures.length === 0 ? 0 : 1)
}

void main()
