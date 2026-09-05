/**
 * L'audit d'accessibilité de P8 — le critère de sortie du §9 : « Audit
 * axe-core 0 violation critique ».
 *
 *   pnpm build && pnpm start --port 3100
 *   pnpm tsx tooling/audit/a11y.ts
 *
 * Il parcourt un échantillon représentatif : chaque gabarit d'écran au moins
 * une fois — les pages publiques en visiteur, les pages du portail en membre
 * connecté, la file de modération en modérateur, et le tunnel d'achat de
 * démonstration en passant. Il **lit seulement** : aucune ligne n'est écrite
 * en base, rien à nettoyer. Le tunnel est la seule exception apparente, et
 * elle n'en est pas une : le panier, l'adresse et la commande de
 * démonstration sont des cookies du contexte de navigateur qui les a posés
 * (`lib/shop/cart.ts`), et le contexte se ferme avec l'audit.
 *
 * Le verdict est compté par impact. Le critère ne regarde que `critical`,
 * mais tout est rapporté en entier — un audit qui ne montre que ce qui
 * casse le build cache ce qui cassera le prochain. Depuis P8, la barre tenue
 * est 0 violation tous impacts confondus, et le bilan le compte aussi.
 *
 * `@axe-core/playwright` est la seule dépendance ajoutée pour P8, et sa
 * justification est le §9 lui-même : le critère de sortie la nomme.
 */

import AxeBuilder from '@axe-core/playwright'
import { chromium, type Browser, type Page } from '@playwright/test'

const BASE = process.env.PARCOURS_BASE ?? 'http://127.0.0.1:3100'
const PASSWORD = process.env.PARCOURS_PASSWORD ?? 'cigardeur'
const MEMBER = process.env.PARCOURS_USER_ONE ?? 'test1@cigardeur.com'
const VENDOR = process.env.PARCOURS_VENDOR ?? 'vendeur@cigardeur.com'
const MODERATOR = process.env.PARCOURS_EDITOR ?? 'jgueniche06@gmail.com'

/** Un gabarit par ligne — pas toutes les pages, tous les écrans. */
const PUBLIC_PAGES = ['/', '/majorite', '/journal', '/mentions-legales', '/sante']
const MEMBER_PAGES = [
  '/decouvrir',
  '/chez-moi',
  '/cercle',
  '/autour',
  '/cigares',
  '/cigares/undercrown-10-robusto',
  '/cigares/undercrown-10-robusto/degustation',
  '/marques',
  '/carnet',
  '/cave',
  '/fil',
  '/lieux',
  '/lieux/a-la-civette-paris',
  '/membres',
  '/clubs',
  '/evenements',
  '/messages',
  '/notifications',
  '/statistiques',
  '/parametres',
  '/contributions',
  '/codes-de-boite',
]
const MODERATOR_PAGES = [
  '/moderation',
  '/admin',
  '/admin/drapeaux',
  '/admin/fiches',
  '/admin/gammes',
  '/admin/boutique',
  '/admin/boutique/vendeurs',
]

/**
 * La boutique publique (ADR 0016) vit derrière `shop_enabled` — OUVERT au
 * repos depuis la 0023, mais l'audit **lit seulement**, donc il ne touche
 * pas le drapeau : il audite ce qui est joignable et NOMME ce qu'il saute.
 * Le panier s'audite vide (son état sans cookie) ici, puis plein dans le
 * tunnel ; les trois écrans du tunnel (commande, paiement, confirmation)
 * redirigent sans panier, donc `auditFunnel` en construit un d'abord — en
 * passant, sans portail ni compte, parce que c'est l'audience du tunnel.
 */
const SHOP_PAGES = ['/boutique', '/boutique/panier', '/boutique/vendeurs/comptoir-du-cedre']

type Finding = { page: string; impact: string; id: string; help: string; nodes: number }

const findings: Finding[] = []

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle').catch(() => undefined)
  await page.waitForTimeout(700)
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

/**
 * Analyse la page telle qu'elle est — sans naviguer. C'est ce qui permet
 * d'auditer un état atteint par un geste (un formulaire refusé, une
 * confirmation) et pas seulement une adresse.
 */
async function auditCurrent(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze()
  for (const violation of results.violations) {
    findings.push({
      page: label,
      impact: violation.impact ?? 'unknown',
      id: violation.id,
      help: violation.help,
      nodes: violation.nodes.length,
    })
  }
  const critical = results.violations.filter((v) => v.impact === 'critical').length
  console.log(
    `  ${critical > 0 ? 'FAIL' : 'ok  '} ${label} — ${results.violations.length} violation(s)`,
  )
}

async function audit(page: Page, path: string): Promise<void> {
  await page.goto(`${BASE}${path}`)
  await settle(page)
  await auditCurrent(page, path)
}

/**
 * Le tunnel d'achat de démonstration, écran par écran, avec ses refus.
 *
 * Trois écrans n'existent qu'avec un panier : /boutique/commande redirige
 * vers le panier sans ligne, /boutique/commande/paiement vers la commande
 * sans adresse, /boutique/commande/confirmation vers la boutique sans
 * instantané. On les atteint donc comme un passant les atteint — un produit
 * en stock, « Ajouter au panier », les coordonnées, la carte — et chaque
 * refus (code postal à deux chiffres, carte à quatre) est audité aussi :
 * c'est l'état où `aria-invalid` et `aria-describedby` doivent tenir, et un
 * audit du formulaire vierge ne les voit jamais.
 *
 * Rien n'est écrit en base : le paiement de démonstration vide les cookies
 * du panier et de l'adresse, et l'instantané de commande expire avec le
 * contexte. Les écrans nommés mais injoignables (aucun produit en stock)
 * sont dits, pas cachés.
 */
async function auditFunnel(page: Page): Promise<void> {
  await page.goto(`${BASE}/boutique`)
  await settle(page)
  const sheets = await page
    .locator('main ul a[href^="/boutique/"]')
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute('href') ?? '').filter((href) => href !== ''),
    )
  if (sheets.length === 0) {
    console.log(
      '  (—) aucun produit publié — le gabarit de la fiche produit et le tunnel attendent',
    )
    return
  }

  /* La première fiche audite le gabarit ; la première EN STOCK ouvre le
     tunnel — un produit épuisé n'a pas de bouton, et le catalogue de QA en
     tient un exprès. */
  await audit(page, sheets[0] ?? '')
  let opened = false
  for (const sheet of sheets) {
    await page.goto(`${BASE}${sheet}`)
    await settle(page)
    const add = page.getByRole('button', { name: 'Ajouter au panier' })
    if ((await add.count()) === 0) continue
    await add.click()
    await page.waitForURL(/\/boutique\/panier\?fait=ajout/, { timeout: 15000 })
    await settle(page)
    opened = true
    break
  }
  if (!opened) {
    console.log('  (—) aucun produit en stock — les trois écrans du tunnel attendent')
    return
  }

  await auditCurrent(page, '/boutique/panier (une ligne)')

  await page.getByRole('link', { name: 'Passer la commande' }).click()
  await page.waitForURL(/\/boutique\/commande$/, { timeout: 15000 })
  await settle(page)
  await auditCurrent(page, '/boutique/commande')

  await page.locator('input[name="fullName"]').fill('Camille Audit')
  await page.locator('input[name="email"]').fill('camille@example.org')
  await page.locator('input[name="address"]').fill('1 rue de l’Audit')
  await page.locator('input[name="postalCode"]').fill('75')
  await page.locator('input[name="city"]').fill('Paris')
  await page.getByRole('button', { name: 'Continuer vers le paiement' }).click()
  await page.locator('[role="alert"]:not(#__next-route-announcer__)').first().waitFor({
    timeout: 15000,
  })
  await settle(page)
  await auditCurrent(page, '/boutique/commande (code postal refusé)')

  await page.locator('input[name="postalCode"]').fill('75017')
  await page.getByRole('button', { name: 'Continuer vers le paiement' }).click()
  await page.waitForURL(/\/boutique\/commande\/paiement$/, { timeout: 15000 })
  await settle(page)
  await auditCurrent(page, '/boutique/commande/paiement')

  await page.locator('input[name="cardNumber"]').fill('4242')
  await page.getByRole('button', { name: /^Payer / }).click()
  await page.locator('[role="alert"]:not(#__next-route-announcer__)').first().waitFor({
    timeout: 15000,
  })
  await settle(page)
  await auditCurrent(page, '/boutique/commande/paiement (carte refusée)')

  await page.locator('input[name="cardNumber"]').fill('4242 4242 4242 4242')
  await page.getByRole('button', { name: /^Payer / }).click()
  await page.waitForURL(/\/boutique\/commande\/confirmation$/, { timeout: 15000 })
  await settle(page)
  await auditCurrent(page, '/boutique/commande/confirmation')
}

async function main(): Promise<void> {
  let browser: Browser | null = null
  try {
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
    })

    console.log('— pages publiques, en visiteur')
    const anon = await (await browser.newContext()).newPage()
    for (const path of PUBLIC_PAGES) await audit(anon, path)

    console.log('— pages du portail, en membre')
    const member = await (await browser.newContext()).newPage()
    await signIn(member, MEMBER)
    for (const path of MEMBER_PAGES) await audit(member, path)

    console.log('— l’espace vendeur, en vendeur')
    const vendor = await (await browser.newContext()).newPage()
    await signIn(vendor, VENDOR)
    await audit(vendor, '/vendeur')

    console.log('— la file, en modérateur')
    const moderator = await (await browser.newContext()).newPage()
    await signIn(moderator, MODERATOR)
    for (const path of MODERATOR_PAGES) await audit(moderator, path)

    console.log('— la boutique publique, si le drapeau l’ouvre')
    const probe = await member.goto(`${BASE}/boutique`)
    if (probe?.status() === 404) {
      console.log('  (—) shop_enabled fermé — gabarits /boutique non audités (nommé, pas caché)')
    } else {
      for (const path of SHOP_PAGES) await audit(member, path)

      console.log('— le tunnel d’achat de démonstration, en passant (sans portail)')
      const passerby = await (await browser.newContext()).newPage()
      await auditFunnel(passerby)
    }
  } finally {
    if (browser) await browser.close()
  }

  const byImpact = new Map<string, Finding[]>()
  for (const finding of findings) {
    const list = byImpact.get(finding.impact) ?? []
    list.push(finding)
    byImpact.set(finding.impact, list)
  }

  console.log('\n=== Bilan par impact')
  for (const impact of ['critical', 'serious', 'moderate', 'minor', 'unknown']) {
    const list = byImpact.get(impact) ?? []
    if (list.length === 0) continue
    console.log(`\n${impact} — ${list.length} :`)
    for (const finding of list) {
      console.log(`  ${finding.page}  [${finding.id}] ${finding.help} (${finding.nodes} noeud·s)`)
    }
  }

  const critical = byImpact.get('critical')?.length ?? 0
  console.log(`\nCritère §9 : ${critical} violation(s) critique(s).`)
  console.log(`Barre de P8 : ${findings.length} violation(s), tous impacts confondus.`)
  if (critical > 0) process.exitCode = 1
}

void main()
