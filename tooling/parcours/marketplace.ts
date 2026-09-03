/**
 * Le parcours de la marketplace (ADR 0016), contre la vraie base, quatre
 * rôles : un visiteur (portail passé, sans compte), un membre (`test_un`), le
 * vendeur (`vendeur` — rattaché à la boutique de QA « Comptoir du Cèdre »,
 * fixture durable comme les comptes) et l'admin (`jeremy`).
 *
 *   pnpm build && pnpm start --port 3100
 *   pnpm tsx tooling/parcours/marketplace.ts
 *
 * Ce qu'il met en scène, dans l'ordre où la vie le fera : le coupe-circuit
 * d'abord (drapeau fermé PAR L'ÉCRAN, tout /boutique répond 404, même à un
 * produit publié), l'espace vendeur refusé à qui n'a pas de boutique, le
 * cycle brouillon → soumission → refus motivé → re-soumission → publication,
 * la réouverture du drapeau, les deux entrées publiques (recherche facettée
 * et vitrine) SANS portail — la boutique est publique depuis le 25 août
 * 2026 —, le tunnel d'achat de démonstration de bout en bout (panier,
 * coordonnées refusées puis acceptées, carte refusée puis acceptée,
 * confirmation QA-), le signalement DSA de la fiche produit (migration 0024 :
 * un passant lit le lien de connexion, un membre connecté DEPUIS la boutique
 * bute sur le portail et y revient, le dossier arrive dans /moderation avec
 * le titre, le vendeur, le lien et le bras de l'administration, sans verbe
 * de masquage), la suspension qui coupe tout, le retrait puis la suppression
 * par le vendeur.
 *
 * Il nettoie derrière lui : le produit part par l'espace vendeur (ligne et
 * image), la boutique jetable par l'écran des vendeurs, et le drapeau
 * REVIENT À OUVERT — c'est son état de repos depuis la 0023. Les bascules
 * restent dans audit_log — un journal ne se nettoie pas, et le dossier de
 * signalement tranché non plus : `mod.reports` n'a aucun DELETE client, par
 * construction. Ce qui reste en base : les vendeurs durables, le catalogue
 * de QA, et un dossier tranché de plus.
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
const STAMP = Date.now()
const REPORT_DETAIL = `Signalement de produit parcours ${STAMP}`

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
  return (
    (await page
      .locator('main')
      .innerText()
      .catch(() => '')) ?? ''
  )
}

/** Polls the main text for a sentence: a fetch answer lands after the click. */
async function seen(page: Page, needle: string, timeoutMs = 15000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (contains(await text(page), needle)) return true
    if (Date.now() > deadline) return false
    await page.waitForTimeout(400)
  }
}

/** Opens the report panel on the current page and sends the §2 reason. */
async function reportProduct(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Signaler ce produit' }).click()
  await page.waitForTimeout(400)
  await page.locator('select[name="reason"]').selectOption('tobacco_promotion')
  await page.locator('textarea[name="detail"]').fill(REPORT_DETAIL)
  await page.getByRole('button', { name: 'Envoyer le signalement' }).click()
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
  await page
    .getByRole('button', { name: /entrer|valider|confirmer/i })
    .first()
    .click()
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
 * Idempotent variant for the walkthrough's opening move: since 0023 the
 * flag's resting state is OPEN, and a rerun after a failed run may find it
 * either way. The button's label says which state the flag is in.
 */
async function ensureShopFlag(admin: Page, want: 'Activer' | 'Couper'): Promise<boolean> {
  await admin.goto(`${BASE}/admin/drapeaux`)
  await settle(admin)
  const form = admin.locator('form:has(input[name="key"][value="shop_enabled"])')
  if ((await form.getByRole('button', { name: want, exact: true }).count()) === 0) return true
  await form.getByRole('button', { name: want, exact: true }).click()
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
    console.log('\n1. Le coupe-circuit : drapeau fermé, toute la boutique répond 404')
    await passGate(visitor)
    await signIn(admin, ADMIN)
    check('le drapeau se ferme depuis l’écran', await ensureShopFlag(admin, 'Couper'))
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

    console.log('\n3. Le vendeur entre chez lui par /parametres — et par l’en-tête')
    await signIn(vendor, VENDOR)
    await vendor.goto(`${BASE}/parametres`)
    await settle(vendor)
    check('le lien « Gérer ma boutique » est là', contains(await text(vendor), 'Gérer ma boutique'))
    check(
      'l’en-tête porte « Espace vendeur »',
      (await vendor.locator('header a', { hasText: 'Espace vendeur' }).count()) > 0,
    )
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
    await productForm(vendor)
      .locator('select[name="category"]')
      .selectOption({ value: 'hygrometre' })
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
    await admin.goto(`${BASE}/admin/boutique`)
    await settle(admin)
    const queue = await text(admin)
    check('la file porte la soumission', contains(queue, PRODUCT))
    check('et le nom du vendeur', contains(queue, 'Comptoir du Cèdre'))
    await admin
      .locator(`main li:has-text("${PRODUCT}") textarea[name="note"]`)
      .fill('Précisez le diamètre du cadran.')
    await admin
      .locator(`main li:has-text("${PRODUCT}")`)
      .getByRole('button', { name: 'Refuser' })
      .click()
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
    await admin
      .locator(`main li:has-text("${PRODUCT}")`)
      .getByRole('button', { name: 'Publier' })
      .click()
    check('la publication confirme', await landed(admin, 'produit-publie'), admin.url())
    check(
      'produit publié, boutique toujours 404 : le drapeau décide',
      await is404(visitor, `${BASE}/boutique`),
    )

    console.log('\n10. L’admin rouvre le drapeau depuis /admin/drapeaux')
    check('la bascule confirme', await toggleShopFlag(admin, 'Activer'))
    check(
      'le tableau de bord dit « Boutique ouverte »',
      await (async () => {
        await admin.goto(`${BASE}/admin`)
        await settle(admin)
        return contains(await text(admin), 'Boutique ouverte au public')
      })(),
    )

    console.log('\n11. La boutique est PUBLIQUE : un passant sans portail y entre')
    const passerby = await (await browser.newContext()).newPage()
    await passerby.goto(`${BASE}/boutique`)
    await settle(passerby)
    check('pas de détour par /majorite', !passerby.url().includes('majorite'), passerby.url())
    check('le rayon se lit sans cookie', contains(await text(passerby), PRODUCT))
    check(
      'le bandeau de démonstration est posé',
      contains((await passerby.locator('body').innerText()) ?? '', 'démonstration'),
    )

    console.log('\n11 bis. La recherche transversale : facettes et texte')
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
    check(
      'une facette vide est un écran',
      contains(await text(visitor), 'Aucun produit ne correspond'),
    )

    console.log('\n12. La fiche produit : prix, liens, et le bouton d’achat')
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
    check(
      '« Ajouter au panier » est là',
      (await visitor.getByRole('button', { name: 'Ajouter au panier' }).count()) > 0,
    )
    check('la fiche dit que la commande est une démonstration', contains(sheet, 'démonstration'))
    check('les avis attendent la caisse', contains(sheet, 'achat vérifié'))

    console.log('\n12 bis. Le tunnel d’achat de démonstration, de bout en bout, sans portail')
    await passerby.goto(`${BASE}${href}`)
    await settle(passerby)
    await passerby.locator('main input[name="qty"]').fill('2')
    await passerby.getByRole('button', { name: 'Ajouter au panier' }).click()
    await passerby.waitForURL(/\/boutique\/panier\?fait=ajout/, { timeout: 15000 })
    await settle(passerby)
    const cart = await text(passerby)
    check('le panier porte la ligne', contains(cart, PRODUCT))
    check('le total ligne est juste (2 × 34,50)', contains(cart, '69,00'))
    check('la livraison démo est comptée', contains(cart, 'Livraison'))
    await passerby.getByRole('link', { name: 'Passer la commande' }).click()
    await passerby.waitForURL(/\/boutique\/commande/, { timeout: 15000 })
    await settle(passerby)
    await passerby.locator('input[name="fullName"]').fill('Camille Parcours')
    await passerby.locator('input[name="email"]').fill('camille@example.org')
    await passerby.locator('input[name="address"]').fill('1 rue du Parcours')
    await passerby.locator('input[name="postalCode"]').fill('75')
    await passerby.locator('input[name="city"]').fill('Paris')
    await passerby.getByRole('button', { name: 'Continuer vers le paiement' }).click()
    const badPostal = await settled(passerby)
    check('un code postal à deux chiffres se refuse en place', !badPostal.ok, badPostal.message)
    await passerby.locator('input[name="postalCode"]').fill('75017')
    await passerby.getByRole('button', { name: 'Continuer vers le paiement' }).click()
    await passerby.waitForURL(/\/boutique\/commande\/paiement/, { timeout: 15000 })
    await settle(passerby)
    check(
      'le paiement se dit fictif avant tout champ',
      contains(await text(passerby), 'Aucun prestataire de paiement'),
    )
    await passerby.locator('input[name="cardNumber"]').fill('4242')
    await passerby.getByRole('button', { name: /^Payer / }).click()
    const badCard = await settled(passerby)
    check('une carte à quatre chiffres se refuse en place', !badCard.ok, badCard.message)
    await passerby.locator('input[name="cardNumber"]').fill('4242 4242 4242 4242')
    await passerby.getByRole('button', { name: /^Payer / }).click()
    await passerby.waitForURL(/\/boutique\/commande\/confirmation/, { timeout: 15000 })
    await settle(passerby)
    const confirmation = await text(passerby)
    check('la confirmation se dit démonstration', contains(confirmation, 'démonstration'))
    check('la référence est marquée QA-', contains(confirmation, 'QA-'))
    check('les articles y sont', contains(confirmation, PRODUCT))
    await passerby.goto(`${BASE}/boutique/panier`)
    await settle(passerby)
    check('payer a vidé le panier', contains(await text(passerby), 'Le panier est vide'))

    console.log('\n12 ter. Le signalement DSA d’un produit — trois personnes, trois portes')
    /* Le passant n'a pas de session : la phrase et le lien de connexion, avec
       le chemin de retour, tiennent lieu de bouton. Le mécanisme demande une
       session parce que la décision se communique à qui signale (ADR 0013). */
    await passerby.goto(`${BASE}${href}`)
    await settle(passerby)
    check(
      'un passant lit « connectez-vous pour le signaler »',
      contains(await text(passerby), 'Connectez-vous pour le signaler'),
    )
    check(
      'le lien de connexion porte le retour vers la fiche',
      (await passerby
        .locator(`main a[href="/connexion?suite=${encodeURIComponent(href ?? '')}"]`)
        .count()) > 0,
    )
    check(
      'et aucun bouton Signaler pour un passant',
      (await passerby.getByRole('button', { name: 'Signaler ce produit' }).count()) === 0,
    )

    /* Le retardataire se connecte DEPUIS la boutique — /connexion est public,
       la fiche aussi — donc il n'a jamais franchi le portail. La route répond
       403, le dialogue tend le portail avec le retour, et le second envoi
       passe. C'est la décision consignée : la route ne bouge pas, le bouton
       fait le détour. */
    const sheetPath = href ?? ''
    const latecomer = await (await browser.newContext()).newPage()
    await latecomer.goto(`${BASE}/connexion?suite=${encodeURIComponent(sheetPath)}`)
    await settle(latecomer)
    await latecomer.locator('input[name="email"]').fill(MEMBER)
    await latecomer.locator('input[name="password"]').fill(PASSWORD)
    await latecomer.getByRole('button', { name: 'Se connecter' }).click()
    await latecomer.waitForURL(`**${sheetPath}`, { timeout: 15000 })
    await settle(latecomer)
    check(
      'connecté depuis la boutique, sans détour par le portail',
      !latecomer.url().includes('majorite'),
    )
    await reportProduct(latecomer)
    check('la route refuse : le portail d’abord', await seen(latecomer, 'portail 18+'))
    check(
      'jamais « connectez-vous » à quelqu’un qui l’est déjà',
      !contains(await text(latecomer), 'Connectez-vous pour signaler'),
    )
    await latecomer.getByRole('link', { name: 'Passer le portail' }).click()
    await latecomer.waitForURL(/\/majorite\?suite=/, { timeout: 15000 })
    await settle(latecomer)
    await latecomer.locator('input[name="birthDate"]').fill('1985-04-02')
    await latecomer
      .getByRole('button', { name: /entrer|valider|confirmer/i })
      .first()
      .click()
    await latecomer.waitForURL(`**${sheetPath}`, { timeout: 15000 })
    await settle(latecomer)
    check('le portail ramène sur la fiche', latecomer.url().endsWith(sheetPath), latecomer.url())
    await reportProduct(latecomer)
    check('le signalement est transmis', await seen(latecomer, 'Signalement transmis'))

    /* L'admin relève la file — c'est le seul compte qui passe la garde
       has_min_role('moderator'). Titre, vendeur, lien : le dossier se lit sans
       ouvrir la boutique, et l'acte est tendu vers l'administration parce
       qu'un produit n'a pas de colonnes de masquage (0024). */
    await admin.goto(`${BASE}/moderation`)
    await settle(admin)
    const queueDesk = await text(admin)
    check('la file porte le dossier', contains(queueDesk, REPORT_DETAIL))
    check('nommé « Produit de la boutique »', contains(queueDesk, 'Produit de la boutique'))
    check('avec le motif §2', contains(queueDesk, 'Incite à consommer du tabac'))
    await admin
      .locator(`main li:has-text("${REPORT_DETAIL}")`)
      .getByRole('link', { name: 'Ouvrir le dossier' })
      .click()
    await admin.waitForURL(/\/moderation\/[0-9a-f-]+/, { timeout: 15000 })
    await settle(admin)
    const dossier = await text(admin)
    check('le dossier cite le titre du produit', contains(dossier, PRODUCT))
    check('et son vendeur', contains(dossier, 'Vendu par Comptoir du Cèdre'))
    check(
      '« Voir en situation » pointe sur la fiche',
      (await admin.locator(`main a[href="${href}"]`).count()) > 0,
    )
    check(
      'l’acte est tendu vers l’administration',
      (await admin.locator('main a[href^="/admin/boutique?produit="]').count()) > 0,
    )
    check(
      'aucun verbe de masquage sur un produit',
      (await admin.getByRole('radio', { name: 'Masquer le contenu' }).count()) === 0,
    )
    await admin.getByRole('radio', { name: /Rejeté/ }).check()
    await admin.locator('textarea[name="note"]').fill(`Fiche de QA, rien a reprocher ${STAMP}`)
    await admin.getByRole('button', { name: 'Enregistrer la décision' }).click()
    await admin.waitForURL('**/moderation?fait=dossier-tranche', { timeout: 15000 })
    check('le dossier se tranche sans acte', await seen(admin, 'Dossier tranché'))

    console.log('\n13. La vitrine — la seconde entrée')
    await visitor.goto(`${BASE}/boutique/vendeurs/comptoir-du-cedre`)
    await settle(visitor)
    const front = await text(visitor)
    check('la vitrine porte le nom', contains(front, 'Comptoir du Cèdre'))
    check('et le produit', contains(front, PRODUCT))
    await member.goto(`${BASE}/boutique/vendeurs/comptoir-du-cedre`)
    await settle(member)
    check(
      'un membre y trouve « Signaler cette boutique »',
      (await member.getByRole('button', { name: 'Signaler cette boutique' }).count()) > 0,
    )

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
    await storefrontForm
      .locator('input[name="address"]')
      .fill('1 rue du Parcours, 75000 Paris (QA)')
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
    check(
      'la vitrine répond 404',
      await is404(visitor, `${BASE}/boutique/vendeurs/comptoir-du-cedre`),
    )
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
    check(
      'la vitrine revit',
      !(await is404(visitor, `${BASE}/boutique/vendeurs/comptoir-du-cedre`)),
    )

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
    check(
      'l’écran prévient : modifier, c’est retirer',
      contains(await text(vendor), 'retire de la vente'),
    )
    await vendor.getByRole('button', { name: 'Retirer de la vente' }).click()
    check('le retrait confirme', await landed(vendor, 'produit-retire'), vendor.url())
    await settle(vendor)
    await vendor.getByRole('button', { name: 'Supprimer' }).click()
    check('la suppression confirme', await landed(vendor, 'produit-supprime'), vendor.url())
    check('l’atelier est revenu à vide', contains(await text(vendor), 'Aucun produit'))

    console.log('\n20. Le coupe-circuit joue dans les deux sens — et l’état de repos est OUVERT')
    check('la coupure confirme', await toggleShopFlag(admin, 'Couper'))
    check('/boutique répond 404, coupée', await is404(visitor, `${BASE}/boutique`))
    check('la réouverture confirme', await toggleShopFlag(admin, 'Activer'))
    check('/boutique répond de nouveau', !(await is404(visitor, `${BASE}/boutique`)))
  } catch (cause) {
    failures.push(`exception : ${String(cause)}`)
    console.log(`  FAIL exception : ${String(cause)}`)
  } finally {
    await browser.close()
  }

  console.log(`\n${passed} assertions passées, ${failures.length} échec(s)`)
  for (const failure of failures) console.log(`  - ${failure}`)
  console.log(
    '\n→ La session rend la base comme elle l’a trouvée : le produit de parcours est parti, les vendeurs durables et le catalogue de QA restent, le drapeau est revenu à OUVERT (son état de repos depuis la 0023).',
  )
  console.log(
    '→ Les bascules de shop_enabled restent dans audit_log : un journal ne se nettoie pas.',
  )
  console.log(
    '→ Le dossier de signalement tranché reste dans mod.reports : aucun DELETE client, par construction — retrait privilégié à faire en partant, et à compter.',
  )
  process.exit(failures.length === 0 ? 0 : 1)
}

void main()
