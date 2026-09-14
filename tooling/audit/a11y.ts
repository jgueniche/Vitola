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
 * ## Deux fenêtres, depuis le 14 septembre 2026
 *
 * L'audit ne connaissait qu'une largeur : celle par défaut de Playwright,
 * 1280 × 720. La QA du 13 septembre a trouvé trois défauts qu'il ne pouvait
 * donc pas voir — un bouton de déconnexion qui n'existait pas sous `lg`, une
 * fiche de vingt faits en une colonne, un panneau de filtres au-dessus des
 * résultats. **Une largeur non testée est une largeur non vue**, et trois
 * écrans sur quatre du site sont regardés sur un téléphone.
 *
 * Il tourne donc deux fois, sur la MÊME liste de gabarits : 1280 × 720, puis
 * 390 × 844 (un iPhone 12, `isMobile`). `AUDIT_VIEWPORTS` choisit
 * (`desktop`, `mobile`, ou les deux par défaut).
 *
 * Et la passe mobile fait une chose de plus, sans quoi elle mentirait : elle
 * **ouvre ce que le mobile replie**. Un `<details>` fermé retire son contenu
 * du document — axe ne l'analyse pas, et un audit qui ne regarde que l'état
 * replié rend un vert là où se trouve précisément le risque. Le menu du site,
 * les filtres de `/cigares` et les deux replis d'une fiche sont donc audités
 * ouverts aussi. Le menu une fois par RÔLE et non par page : c'est le même
 * composant partout, mais son contenu dépend du rôle.
 *
 * `@axe-core/playwright` est la seule dépendance ajoutée pour P8, et sa
 * justification est le §9 lui-même : le critère de sortie la nomme.
 */

import AxeBuilder from '@axe-core/playwright'
import { chromium, type Browser, type Page } from '@playwright/test'

const BASE = process.env.PARCOURS_BASE ?? 'http://127.0.0.1:3100'
const PASSWORD = process.env.PARCOURS_PASSWORD ?? 'cigardeur'
const MEMBER = process.env.PARCOURS_USER_ONE ?? 'test1@cigardeur.com'
const MODERATOR = process.env.PARCOURS_EDITOR ?? 'jgueniche06@gmail.com'

/** Un gabarit par ligne — pas toutes les pages, tous les écrans. */
const PUBLIC_PAGES = ['/', '/majorite', '/journal', '/mentions-legales', '/sante']
const MEMBER_PAGES = [
  /* Les trois hubs — /decouvrir, /chez-moi, /autour — ont été retirés le
     12 septembre 2026 (QA) et répondent 308. Leurs sections s'auditent une par
     une ci-dessous, plus /suggestions et /aromes, qui sont nouveaux. */
  '/cercle',
  '/cigares',
  '/aromes',
  '/suggestions',
  '/cigares/undercrown-10-robusto',
  '/cigares/undercrown-10-robusto?geste=fumer',
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
  '/admin/fiches/relire',
  '/admin/fiches/relire?source=avec',
  '/admin/gammes',
  '/admin/boutique',
  '/admin/boutique/partenaires',
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
/* `/boutique/vendeurs/<slug>` left the list with the marketplace (migration
   0034): there is no shopfront to audit, because nobody sells here but us. */
const SHOP_PAGES = ['/boutique', '/boutique/panier']

type Viewport = {
  name: string
  width: number
  height: number
  isMobile: boolean
}

/* 1280 × 720 est ce que Playwright donne par défaut, donc ce que l'audit a
   toujours mesuré ; 390 × 844 est un iPhone 12, la largeur la plus étroite
   qu'un lecteur apporte en pratique. `isMobile` n'est pas cosmétique : il pose
   un viewport meta mobile et des événements tactiles, donc les cibles de touche
   et les survols se comportent comme sur l'appareil. */
const VIEWPORTS: Record<string, Viewport> = {
  desktop: { name: 'desktop 1280', width: 1280, height: 720, isMobile: false },
  mobile: { name: 'mobile 390', width: 390, height: 844, isMobile: true },
}

const REQUESTED = (process.env.AUDIT_VIEWPORTS ?? 'desktop,mobile')
  .split(',')
  .map((name) => name.trim())
  .filter((name) => name !== '')

type Finding = {
  viewport: string
  page: string
  impact: string
  id: string
  help: string
  nodes: number
}

const findings: Finding[] = []

/**
 * Les contrôles qui n'ont RIEN TROUVÉ À REGARDER.
 *
 * La première version de la passe mobile en a sauté trois sur cinq en écrivant
 * « rien à ouvrir », et le bilan a rendu 0 violation sur 47 écrans — un vert
 * dont trois cinquièmes de la partie neuve n'avaient rien vérifié. C'est la
 * vacuité que `CLAUDE.md` met en garde contre depuis P0 : « une assertion dont
 * la donnée de test n'existe pas réussit sans rien tester ».
 *
 * Un contrôle qui ne trouve pas sa cible est donc une LACUNE, comptée à part et
 * qui fait sortir en erreur. Pas une violation d'accessibilité — l'audit ne sait
 * pas si la page est accessible, et c'est précisément ce qu'il doit dire.
 */
const gaps: string[] = []

/**
 * Dans QUEL ÉTAT chaque écran a été regardé.
 *
 * La lacune de couverture du 14 septembre 2026, et la seule de l'audit qui ne
 * soit pas un contrôle manquant mais un contrôle **incomplet**. Beaucoup
 * d'écrans ont un état vide et un état peuplé ; l'audit ne voit jamais que
 * celui où le compte de test se trouve ce jour-là. Un `<dl>` invalide a vécu
 * trois semaines derrière `{nothingYet ? <EmptyState/> : …}` sous une bannière
 * « 0 violation, tous impacts confondus » — et la bannière ne mentait pas :
 * sur un compte sans entrée, le `<dl>` n'existait pas.
 *
 * L'audit **lit seulement** (pas de fixtures, pas d'écriture : c'est la règle
 * de l'outil et l'interdit de la session). Il ne peut donc pas auditer les
 * deux états. Ce qu'il peut faire, et ce qu'il fait désormais, c'est **dire
 * lequel des deux il a regardé**, écran par écran, et cesser d'annoncer une
 * couverture qu'il n'a pas. `data-empty-state` sur `EmptyState` est le seul
 * mot de code applicatif que cela coûte.
 */
const states: { viewport: string; page: string; state: 'vide' | 'peuplé' | 'mixte' }[] = []

function gap(message: string): void {
  gaps.push(message)
  console.log(`  LACUNE ${message}`)
}

/** La fenêtre de la passe en cours — lue par `auditCurrent`, posée par `runPass`. */
let current: Viewport = VIEWPORTS.desktop as Viewport

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
  /* Compté AVANT axe, sur le document tel qu'il est analysé. Un écran peut
     porter plusieurs états vides (trois sur `/statistiques`) : s'il en porte
     et qu'il porte aussi autre chose, il est « mixte », et la moitié peuplée
     est celle qui a été vue. */
  const emptyBlocks = await page.locator('[data-empty-state]').count()
  const mainText = (
    (await page
      .locator('main')
      .innerText()
      .catch(() => '')) ?? ''
  ).trim()
  states.push({
    viewport: current.name,
    page: label,
    state: emptyBlocks === 0 ? 'peuplé' : mainText.length > 600 ? 'mixte' : 'vide',
  })

  const results = await new AxeBuilder({ page }).analyze()
  for (const violation of results.violations) {
    findings.push({
      viewport: current.name,
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

/**
 * Le menu du site, ouvert — une fois par rôle.
 *
 * C'est le même composant sur chaque page, donc l'ouvrir sur les quarante-huit
 * serait quarante-huit fois la même analyse. Son CONTENU, lui, dépend du rôle :
 * un visiteur y lit trois sections et « Se connecter », un membre sept plus son
 * compte et le bouton de déconnexion, un admin une entrée de plus. Trois
 * analyses, donc, et pas une.
 */
async function auditMenuOpen(page: Page, role: string, path: string): Promise<void> {
  /* Une page de `app/(public)/` n'a PAS d'en-tête de site — seul
     `app/(app)/layout.tsx` porte `SiteHeader`. Le chemin est donc un argument,
     et il doit en être un de ce groupe, sans quoi le contrôle ne trouve rien et
     le dit à tort. Le premier jet visait `/journal` : le seul préfixe public du
     site, et celui qui n'a aucune navigation. */
  await page.goto(`${BASE}${path}`)
  await settle(page)
  const burger = page.locator('header button[aria-controls="menu-du-site"]')
  if ((await burger.count()) === 0) {
    gap(
      `aucun menu à ouvrir sur ${path} en ${role} — un écran du portail sans menu est lui-même une trouvaille`,
    )
    return
  }
  await burger.first().click()
  await settle(page)
  const opened = await burger.first().getAttribute('aria-expanded')
  if (opened !== 'true') {
    gap(`le menu de ${path} ne s'est pas ouvert en ${role} (aria-expanded=${opened})`)
    return
  }
  await auditCurrent(page, `menu du site ouvert (${role}, ${path})`)
}

/**
 * Les replis, ouverts.
 *
 * Un `<details>` fermé retire son contenu du document : axe ne l'analyse pas,
 * et une passe qui ne regarde que l'état replié rendrait un vert là où est
 * précisément le risque. Le fait que ces replis n'existent QUE sous `md`
 * (filtres) ou soient fermés par défaut (fiche) est la raison de cette
 * fonction, pas une excuse pour l'omettre.
 */
async function auditFoldsOpen(page: Page, path: string, expected: number): Promise<void> {
  /* `expected` est le nombre de replis que cette page DOIT avoir à cette
     largeur. Sans lui, une page qui n'a pas fini de rendre — l'API du projet
     répond en secondes quand elle va mal — se lit « aucun repli » et le
     contrôle se tait. */
  await page.goto(`${BASE}${path}`)
  await settle(page)
  const folds = page.locator('main details')
  let count = await folds.count()
  if (count !== expected) {
    /* Une seconde chance, et une seule : un rendu en retard n'est pas une
       absence, et un délai fixe de plus serait du sable dans les yeux. */
    await page.waitForSelector('main details', { timeout: 15000 }).catch(() => undefined)
    count = await folds.count()
  }
  if (count !== expected) {
    gap(`${path} rend ${count} repli(s) au lieu de ${expected} — non audité replié/déplié`)
    return
  }
  for (let i = 0; i < count; i += 1) await folds.nth(i).locator('summary').click()
  await settle(page)
  await auditCurrent(page, `${path} (${count} repli·s ouvert·s)`)
}

/**
 * Une passe complète, dans une fenêtre.
 *
 * Les contextes sont recréés à chaque passe : un contexte porte sa fenêtre et
 * ses cookies, et réutiliser celui de la passe précédente auditerait la
 * seconde largeur avec la première. C'est le genre d'erreur qui rend un audit
 * vert pour la raison qu'on ne voulait pas.
 */
async function runPass(browser: Browser, viewport: Viewport): Promise<void> {
  current = viewport
  const shape = {
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile,
  }
  console.log(`\n########## ${viewport.name} (${viewport.width} × ${viewport.height})`)

  console.log('— pages publiques, en visiteur')
  const anon = await (await browser.newContext(shape)).newPage()
  for (const path of PUBLIC_PAGES) await audit(anon, path)

  console.log('— pages du portail, en membre')
  const member = await (await browser.newContext(shape)).newPage()
  await signIn(member, MEMBER)
  for (const path of MEMBER_PAGES) await audit(member, path)

  /* L'espace vendeur a disparu avec la marketplace (migration 0034) : il
     n'y a plus de compte vendeur à auditer. */

  console.log('— la file, en modérateur')
  const moderator = await (await browser.newContext(shape)).newPage()
  await signIn(moderator, MODERATOR)
  for (const path of MODERATOR_PAGES) await audit(moderator, path)

  console.log('— la boutique publique, si le drapeau l’ouvre')
  const probe = await member.goto(`${BASE}/boutique`)
  if (probe?.status() === 404) {
    console.log('  (—) shop_enabled fermé — gabarits /boutique non audités (nommé, pas caché)')
  } else {
    for (const path of SHOP_PAGES) await audit(member, path)

    console.log('— le tunnel d’achat de démonstration, en passant (sans portail)')
    const passerby = await (await browser.newContext(shape)).newPage()
    await auditFunnel(passerby)
  }

  if (!viewport.isMobile) return

  /* Ce que la largeur étroite replie, et que la passe large n'a jamais eu à
     ouvrir parce que rien n'y était replié. */
  console.log('— ce que le mobile replie, ouvert')
  /* Les nombres sont ceux de la QA du 13 septembre : un repli de filtres sur la
     liste, deux replis de faits sur une fiche. Si l'un change, ce contrôle doit
     échouer et être relu — pas s'adapter en silence. */
  await auditFoldsOpen(member, '/cigares', 1)
  await auditFoldsOpen(member, '/cigares/undercrown-10-robusto', 2)

  /* `/boutique` pour le visiteur : le seul écran de `app/(app)/` — donc portant
     l'en-tête — qu'on atteint sans compte ni portail. */
  await auditMenuOpen(anon, 'visiteur', '/boutique')
  await auditMenuOpen(member, 'membre', '/cigares')
  await auditMenuOpen(moderator, 'admin', '/admin')
}

async function main(): Promise<void> {
  const viewports = REQUESTED.map((name) => VIEWPORTS[name]).filter(
    (viewport): viewport is Viewport => viewport !== undefined,
  )
  if (viewports.length === 0) {
    console.error(
      `AUDIT_VIEWPORTS ne nomme aucune fenêtre connue (${Object.keys(VIEWPORTS).join(', ')}).`,
    )
    process.exitCode = 1
    return
  }

  let browser: Browser | null = null
  try {
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
    })
    for (const viewport of viewports) await runPass(browser, viewport)
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
      console.log(
        `  [${finding.viewport}] ${finding.page}  [${finding.id}] ${finding.help} ` +
          `(${finding.nodes} noeud·s)`,
      )
    }
  }

  /* Par fenêtre aussi : un total de zéro ne dit pas laquelle des deux a été
     regardée, et c'est exactement la confusion qui a laissé passer trois
     défauts de mobile pendant neuf phases. */
  console.log('\n=== Bilan par fenêtre')
  for (const viewport of Object.values(VIEWPORTS)) {
    const seen = findings.filter((finding) => finding.viewport === viewport.name)
    if (!REQUESTED.some((name) => VIEWPORTS[name]?.name === viewport.name)) {
      console.log(`${viewport.name} — non auditée (hors de AUDIT_VIEWPORTS)`)
      continue
    }
    console.log(`${viewport.name} — ${seen.length} violation(s)`)
  }

  if (gaps.length > 0) {
    console.log(`\n=== Lacunes — ${gaps.length} contrôle(s) qui n'ont rien trouvé à regarder`)
    for (const message of gaps) console.log(`  ${message}`)
    console.log(
      "  Un audit ne peut pas rendre « 0 violation » sur un écran qu'il n'a pas regardé :\n" +
        '  ces lignes sont un verdict manquant, pas un verdict favorable.',
    )
  }

  /* La couverture, dite plutôt que supposée. Ce bloc existe pour que le bilan
     cesse d'annoncer « 0 violation sur N écrans » sans dire de quels N. */
  const byState = { vide: 0, peuplé: 0, mixte: 0 }
  for (const entry of states) byState[entry.state] += 1
  const screens = new Set(states.map((entry) => entry.page)).size

  console.log(`\n=== Couverture — dans quel ÉTAT chaque écran a été regardé`)
  console.log(
    `  ${byState.peuplé} vu(s) peuplé(s), ${byState.vide} vu(s) vide(s), ` +
      `${byState.mixte} mixte(s), sur ${screens} écran(s) × ${states.length / Math.max(screens, 1)} fenêtre(s).`,
  )
  const emptyOnly = states.filter((entry) => entry.state === 'vide')
  if (emptyOnly.length > 0) {
    console.log(
      `  Les écrans ci-dessous n'ont été vus QUE vides. Leur état peuplé n'a pas été audité :`,
    )
    for (const entry of emptyOnly) console.log(`    [${entry.viewport}] ${entry.page}`)
  }
  console.log(
    "  L'audit lit seulement : il ne fabrique pas de données, donc il ne peut pas auditer\n" +
      "  les deux états d'un écran. Il dit lequel il a vu. « 0 violation sur " +
      `${screens} écrans » veut dire\n` +
      "  « 0 violation dans l'état où le compte de test les a trouvés », et rien de plus.",
  )

  const critical = byImpact.get('critical')?.length ?? 0
  console.log(`\nCritère §9 : ${critical} violation(s) critique(s).`)
  console.log(
    `Barre de P8 : ${findings.length} violation(s), tous impacts confondus, ` +
      `sur ${screens} écran(s) dans l'état décrit ci-dessus.`,
  )
  console.log(`Lacunes : ${gaps.length}.`)
  if (critical > 0 || gaps.length > 0) process.exitCode = 1
}

void main()
