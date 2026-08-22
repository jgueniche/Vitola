/**
 * Le parcours de la cave, en navigateur, contre la vraie base.
 *
 * Ce fichier n'est pas un test e2e et ne doit pas le devenir : la CI n'a pas de
 * base de données, et `/cigares` y lève une exception. Il vit dans `tooling/`
 * pour la même raison que les autres parcours — `test-results/` est gitignoré,
 * donc Node n'y résoudrait pas `@playwright/test`.
 *
 *   pnpm build && pnpm start --port 3100
 *   pnpm tsx tooling/parcours/cave.ts
 *
 * Il **nettoie derrière lui** : caves, lots, relevés et entrées de carnet créés
 * ici sont effacés à la fin, sinon la recette humaine commence sur une cave qui
 * n'est pas la sienne. Le grand livre part avec ses lots ; `audit_log`, lui, ne
 * s'efface jamais.
 *
 * Un piège appris à nos dépens et respecté partout ci-dessous : **les
 * formulaires sont câblés par l'hydratation**. Cliquer avant que React n'ait
 * attaché l'action ne soumet rien, en silence. `networkidle` ne suffit pas ; il
 * faut y ajouter une attente.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { chromium, type Browser, type Page } from '@playwright/test'

const BASE = process.env.PARCOURS_BASE ?? 'http://127.0.0.1:3100'
const PASSWORD = process.env.PARCOURS_PASSWORD ?? 'cigardeur'
const ACCOUNTS = {
  un: process.env.PARCOURS_USER_ONE ?? 'test1@cigardeur.com',
  deux: process.env.PARCOURS_USER_TWO ?? 'test2@cigardeur.com',
}

const CAVE_NAME = `Cave de parcours ${Date.now()}`

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

/** `.eyebrow` uppercases by CSS: compare without case, always. */
function contains(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase())
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(900)
}

/**
 * Attend qu'un texte apparaisse dans `main`, plutôt que de le lire une fois.
 *
 * `settle()` ne suffit pas après une écriture : une Server Action qui appelle
 * `revalidatePath` renvoie d'abord, et le rendu serveur arrive **ensuite**. Une
 * lecture immédiate voit donc la page d'avant, et l'assertion échoue sur un
 * produit qui marche — c'est arrivé deux fois avant que ceci existe.
 */
async function seen(page: Page, needle: string, timeoutMs = 15000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const text = (await page.locator('main').innerText().catch(() => '')) ?? ''
    if (contains(text, needle)) return true
    await page.waitForTimeout(400)
  }
  return false
}

/** Le texte de `main`, pour les messages d'échec. */
async function body(page: Page): Promise<string> {
  return ((await page.locator('main').innerText().catch(() => '')) ?? '').slice(0, 300)
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

  const one = await browser.newContext()
  const two = await browser.newContext()
  const page = await one.newPage()
  const other = await two.newPage()

  let humidorUrl = ''
  const createdEntries: string[] = []

  try {
    /* ------------------------------------------------ 1. la cave est vide */
    console.log('\n1. Une cave vide est une invitation')
    await signIn(page, ACCOUNTS.un)
    await page.goto(`${BASE}/cave`)
    await settle(page)

    check('/cave répond à un membre connecté', page.url().includes('/cave'), page.url())
    const emptyText = (await page.locator('main').innerText()) ?? ''
    check(
      'la page nomme la cave',
      contains(emptyText, 'Ma cave'),
      emptyText.slice(0, 80),
    )
    check(
      'le formulaire de création est présent',
      await page.locator('input[name="name"]').isVisible(),
    )

    /* ------------------------------------------------- 2. créer une cave */
    console.log('\n2. Créer une cave')
    await page.locator('input[name="name"]').fill(CAVE_NAME)
    await page.locator('input[name="capacity"]').fill('50')
    await page.locator('input[name="targetRh"]').fill('69')
    await page.getByRole('button', { name: 'Créer la cave' }).click()
    await settle(page)

    check('la cave apparaît dans la liste', await seen(page, CAVE_NAME), await body(page))
    check('elle est marquée par défaut', await seen(page, 'Par défaut'))

    await page.getByRole('link', { name: new RegExp(CAVE_NAME.slice(0, 20), 'i') }).first().click()
    await settle(page)
    humidorUrl = page.url()
    check('la cave a sa page', /\/cave\/[0-9a-f-]{36}/.test(humidorUrl), humidorUrl)

    const detail = await page.locator('main').innerText()
    check('elle annonce son état vide comme une invitation', contains(detail, 'Cette cave est vide'))
    check('elle affiche sa jauge', contains(detail, '0 / 50'), detail.slice(0, 200))

    /* -------------------------------------------------- 3. ranger un lot */
    console.log('\n3. Ranger un cigare')
    await page.locator('input[name="q"]').fill('undercrown')
    await page.getByRole('button', { name: 'Chercher' }).click()
    await settle(page)

    const results = await page.locator('main').innerText()
    check('la recherche trouve des fiches', contains(results, 'Undercrown'), results.slice(0, 200))

    await page.getByRole('button', { name: 'Mettre en cave' }).first().click()
    await settle(page)

    await page.locator('input[name="qty"]').first().waitFor({ state: 'visible', timeout: 15000 })
    check('le formulaire de lot apparaît', true)
    await page.locator('input[name="qty"]').fill('5')
    await page.locator('input[name="price"]').fill('12.50')
    // Antérieure à l'achat, exprès : une boîte achetée vieillie se repose
    // depuis avant nous, et c'est ce cas qui a fait tomber la contrainte.
    await page.locator('input[name="agingStartDate"]').fill('2024-01-15')
    await page.getByRole('button', { name: 'Ranger dans la cave' }).click()
    await settle(page)

    check('le lot est rangé', await seen(page, 'Rangé dans votre cave'), await body(page))

    await page.goto(humidorUrl)
    await settle(page)
    check('la jauge a bougé', await seen(page, '5 / 50'), await body(page))
    check('le cigare est nommé dans l inventaire', await seen(page, 'Undercrown'), await body(page))
    check('la valorisation est calculée', await seen(page, '62,50'), await body(page))
    check(
      'un âge de vieillissement antérieur à l achat est accepté et affiché',
      (await seen(page, 'mois')) || (await seen(page, 'ans')),
      await body(page),
    )

    /* ----------------------------------- 4. fumer : le critère de sortie */
    console.log('\n4. Fumer depuis la cave — le critère de sortie de P2')
    await page.getByRole('link', { name: /Undercrown/i }).first().click()
    await settle(page)

    check('le grand livre est ouvert', await seen(page, 'Grand livre'), await body(page))
    check("l'entrée en cave y figure", await seen(page, 'Entrée en cave'), await body(page))

    await page.locator('textarea[name="body"]').first().fill('Parcours : première note de cave.')
    await page.locator('input[name="score"]').first().fill('88')
    await page.getByRole('button', { name: "J'en fume un" }).first().click()
    await settle(page)

    check('la confirmation nomme le carnet', await seen(page, 'noté au carnet'), await body(page))

    const entryLink = page.getByRole('link', { name: "Ouvrir l'entrée" }).first()
    if (await entryLink.isVisible()) {
      const href = await entryLink.getAttribute('href')
      if (href) createdEntries.push(href.split('/').pop() ?? '')
    }

    await page.goto(humidorUrl)
    await settle(page)
    check('le stock est décrémenté', await seen(page, '4 / 50'), await body(page))

    /* ----------------------------- 5. fumer sans rien noter (ADR 0006 D2) */
    console.log('\n5. Fumer sans rien noter')
    await page.getByRole('link', { name: /Undercrown/i }).first().click()
    await settle(page)
    await page.getByRole('button', { name: "J'en fume un" }).first().click()
    await settle(page)

    const decremented = await seen(page, 'Décompté de votre cave')
    check(
      "aucune entrée n'est promise quand rien n'est noté",
      decremented && !contains(await body(page), 'noté au carnet'),
      await body(page),
    )

    await page.goto(humidorUrl)
    await settle(page)
    check('le stock a quand même baissé', await seen(page, '3 / 50'), await body(page))

    /* ------------------------------------- 6. refus : plus que le stock */
    //
    // Deux refus, et ils ne sont pas au même endroit. Le navigateur arrête
    // l'impossible — `max` vaut ce qui reste — et le serveur arrête le
    // **périmé** : un panneau ouvert pendant qu'on fume ailleurs propose encore
    // une quantité qui n'existe plus. C'est le second qui compte, parce qu'il
    // est le seul que `pnpm check` ne verrait jamais.
    console.log('\n6. Un refus qui dit ce qui reste')
    await page.getByRole('link', { name: /Undercrown/i }).first().click()
    await settle(page)

    const smokeQty = page.locator('input[name="qty"]').first()
    check(
      "l'interface borne la quantité à ce qui reste",
      (await smokeQty.getAttribute('max')) === '3',
      (await smokeQty.getAttribute('max')) ?? 'aucun max',
    )

    // Le panneau reste ouvert ici, et un second onglet vide le lot.
    await smokeQty.fill('3')
    const twin = await one.newPage()
    await twin.goto(humidorUrl)
    await settle(twin)
    await twin.getByRole('link', { name: /Undercrown/i }).first().click()
    await settle(twin)
    await twin.getByRole('button', { name: "J'en fume un" }).first().click()
    await settle(twin)
    check('le second onglet a bien fumé', await seen(twin, 'Décompté de votre cave'), await body(twin))
    await twin.close()

    await page.getByRole('button', { name: "J'en fume un" }).first().click()
    await settle(page)
    check(
      'le serveur refuse une demande périmée, et dit ce qui reste',
      await seen(page, 'reste que 2'),
      await body(page),
    )

    /* ----------------------------------------------- 7. l'hygrométrie */
    console.log("\n7. Un relevé d'hygrométrie")
    await page.goto(humidorUrl)
    await settle(page)
    await page.locator('input[name="rh"]').fill('66.5')
    await page.locator('input[name="tempC"]').fill('19')
    await page.getByRole('button', { name: 'Relever' }).click()
    await settle(page)

    check(
      'le relevé est enregistré',
      (await seen(page, '66,5')) || (await seen(page, '66.5')),
      await body(page),
    )
    check("l'écart avec la cible est dit", await seen(page, 'Écart'), await body(page))

    /* --------------------------------------------- 8. depuis la fiche */
    console.log('\n8. Depuis la fiche cigare')
    await page.goto(`${BASE}/cigares/undercrown-10-robusto`)
    await settle(page)
    const cigarPage = await page.locator('main').innerText()
    check(
      'la fiche dit ce que j’en ai en cave',
      contains(cigarPage, 'Dans votre cave'),
      cigarPage.slice(0, 200),
    )

    /* ------------------------------------------------ 9. statistiques */
    console.log('\n9. Les statistiques')
    await page.goto(`${BASE}/statistiques`)
    await settle(page)
    const stats = await page.locator('main').innerText()
    check('la page rend', contains(stats, 'Mes statistiques'), stats.slice(0, 200))
    check('elle compte les cigares fumés', contains(stats, 'cigares fumés'), stats.slice(0, 400))
    check('elle compte ce qui reste en cave', contains(stats, 'cigares en cave'))
    check('elle dit que la portée ne filtre rien', contains(stats, 'quelle que soit leur portée'))

    /* ------------------------------------------------------ 10. le CSV */
    //
    // Cliqué, pas requêté. `page.request` ne porte pas les cookies du contexte
    // — vérifié : il reçoit un 307 vers le portail même sur `/cave` — donc un
    // export testé par là échoue pour une raison qui n'existe pas dans un
    // navigateur. Ce que fait une personne, c'est cliquer, et ce qui arrive,
    // c'est un téléchargement.
    console.log('\n10. Export CSV')
    await page.goto(`${BASE}/cave`)
    await settle(page)
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Exporter ma cave/i }).first().click(),
    ])

    check('le fichier est nommé', download.suggestedFilename() === 'vitola-cave.csv', download.suggestedFilename())
    const csvPath = await download.path()
    const csvText = csvPath ? readFileSync(csvPath, 'utf8') : ''
    check("l'en-tête est celui qu'on documente", contains(csvText, 'cigar_slug,qty'), csvText.slice(0, 120))
    check('il nomme le cigare par son slug', contains(csvText, 'undercrown'), csvText.slice(0, 200))
    check("il n'expose aucun identifiant interne", !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(csvText))

    /* --------------------------------------------------- 10b. l'import */
    console.log("\n10b. Import CSV")
    await page.goto(humidorUrl)
    await settle(page)
    const importPath = join(tmpdir(), `vitola-import-${Date.now()}.csv`)
    writeFileSync(importPath, 'cigar_slug,qty,purchase_price_eur\nundercrown-10-robusto,2,9.90\n', 'utf8')
    await page.locator('input[name="file"]').setInputFiles(importPath)
    await page.getByRole('button', { name: 'Importer', exact: true }).click()
    check("l'import annonce ce qu'il a fait", await seen(page, 'Inventaire importé'), await body(page))

    await page.goto(humidorUrl)
    await settle(page)
    check('le lot importé est arrivé', await seen(page, '19,80'), await body(page))

    const badPath = join(tmpdir(), `vitola-bad-${Date.now()}.csv`)
    writeFileSync(badPath, 'cigar_slug,qty\nce-slug-nexiste-pas,2\n', 'utf8')
    await page.locator('input[name="file"]').setInputFiles(badPath)
    await page.getByRole('button', { name: 'Importer', exact: true }).click()
    check(
      'un identifiant inconnu est nommé, pas ignoré',
      await seen(page, "ce-slug-nexiste-pas"),
      await body(page),
    )

    /* --------------------------------------- 11. la cave d'autrui : 404 */
    console.log("\n11. La cave d'autrui")
    await signIn(other, ACCOUNTS.deux)
    await other.goto(humidorUrl)
    await settle(other)
    const foreign = await other.locator('body').innerText()
    check(
      "la cave d'un autre membre est une 404, pas un refus",
      contains(foreign, '404') || contains(foreign, 'introuvable') || contains(foreign, 'trouvée'),
      foreign.slice(0, 200),
    )
    check(
      'et elle ne nomme rien de son contenu',
      !contains(foreign, CAVE_NAME) && !contains(foreign, 'Undercrown'),
    )

    await other.goto(`${BASE}/cave`)
    await settle(other)
    check(
      "l'autre membre a sa propre cave vide",
      !contains(await other.locator('main').innerText(), CAVE_NAME),
    )
  } finally {
    /* ------------------------------------------------------ nettoyage */
    console.log('\nNettoyage')
    try {
      for (const id of createdEntries.filter(Boolean)) {
        await page.goto(`${BASE}/carnet/${id}`)
        await settle(page)
        page.once('dialog', (dialog) => void dialog.accept())
        const del = page.getByRole('button', { name: /Supprimer/i }).first()
        if (await del.isVisible()) {
          await del.click()
          await settle(page)
        }
      }

      if (humidorUrl) {
        await page.goto(humidorUrl)
        await settle(page)
        page.once('dialog', (dialog) => void dialog.accept())
        const del = page.getByRole('button', { name: 'Supprimer cette cave' })
        if (await del.isVisible()) {
          await del.click()
          await settle(page)
        }
        await page.goto(`${BASE}/cave`)
        await settle(page)
        const left = await page.locator('main').innerText()
        check('la cave de parcours a bien été effacée', !contains(left, CAVE_NAME))
      }
    } catch (cause) {
      console.log(`  nettoyage incomplet : ${String(cause)}`)
    }

    await browser.close()
  }

  console.log(`\n${passed} assertions passées, ${failures.length} échec(s)`)
  for (const failure of failures) console.log(`  - ${failure}`)
  process.exit(failures.length === 0 ? 0 : 1)
}

void main()
