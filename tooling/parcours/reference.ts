/**
 * Le parcours du comparateur et du décodeur, contre la vraie base.
 *
 *   pnpm build && pnpm start --port 3100
 *   pnpm tsx tooling/parcours/reference.ts
 *
 * Les deux pages sont en **lecture seule** : rien n'est écrit, donc rien n'est à
 * nettoyer. C'est la seule différence avec les autres parcours, et elle vaut
 * d'être dite — l'absence de nettoyage ici est un fait, pas un oubli.
 */

import { chromium, type Browser, type Page } from '@playwright/test'

const BASE = process.env.PARCOURS_BASE ?? 'http://127.0.0.1:3100'
const PASSWORD = process.env.PARCOURS_PASSWORD ?? 'cigardeur'
const ACCOUNT = process.env.PARCOURS_USER_ONE ?? 'test1@cigardeur.com'

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
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(700)
}

async function text(page: Page): Promise<string> {
  return (await page.locator('main').innerText().catch(() => '')) ?? ''
}

async function signIn(page: Page): Promise<void> {
  await page.goto(`${BASE}/majorite`)
  await settle(page)
  await page.locator('input[name="birthDate"]').fill('1985-04-02')
  await page.getByRole('button', { name: /entrer|valider|confirmer/i }).first().click()
  await settle(page)
  await page.goto(`${BASE}/connexion`)
  await settle(page)
  await page.locator('input[name="email"]').fill(ACCOUNT)
  await page.locator('input[name="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await settle(page)
}

async function main(): Promise<void> {
  const browser: Browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  })
  const page = await (await browser.newContext()).newPage()

  try {
    await signIn(page)

    /* ------------------------------------------------ le décodeur ------- */
    console.log('\n1. Le décodeur, sans code')
    await page.goto(`${BASE}/codes-de-boite`)
    await settle(page)
    let body = await text(page)
    check('la page rend', contains(body, 'Décoder un code'), body.slice(0, 120))
    check("l'état vide est une invitation", contains(body, 'Un code sous la main'))
    check('la table complète est là', contains(body, 'ENE') && contains(body, 'DIC'), '')
    check('les six sigles y sont aussi', contains(body, 'El Laguito'))
    check(
      'et la mise en garde sur ce que le décodeur ne prouve pas',
      contains(body, "il ne dit pas si une boîte est authentique"),
    )

    console.log('\n2. Un code complet')
    await page.locator('input[name="code"]').fill('EL ABR 19')
    await page.getByRole('button', { name: 'Décoder' }).click()
    await settle(page)
    body = await text(page)
    check('le code est dans l’URL, donc partageable', page.url().includes('code='), page.url())
    check('le mois est lu', contains(body, 'avril'), body.slice(0, 300))
    check("l'année est lue", contains(body, '2019'), body.slice(0, 300))
    check(
      "l'ambiguïté du siècle est dite, pas cachée",
      contains(body, '1919'),
      body.slice(0, 400),
    )
    check("l'usine est donnée avec son doute", contains(body, 'à vérifier'), body.slice(0, 400))

    console.log('\n3. Un groupe inconnu ne devient pas une usine probable')
    await page.goto(`${BASE}/codes-de-boite?code=ZZZ+19`)
    await settle(page)
    body = await text(page)
    check('il est dit non reconnu', contains(body, 'non reconnu'), body.slice(0, 300))
    check('et rien n’est deviné', !contains(body, 'ZZZ —'), body.slice(0, 300))

    console.log('\n4. Un code illisible le dit')
    await page.goto(`${BASE}/codes-de-boite?code=%2F%2F%2F`)
    await settle(page)
    check('rien à lire', contains(await text(page), 'Rien à lire'), (await text(page)).slice(0, 200))

    /* ---------------------------------------------- le comparateur ------ */
    console.log('\n5. Le comparateur, vide')
    await page.goto(`${BASE}/cigares/comparer`)
    await settle(page)
    body = await text(page)
    check('la page rend', contains(body, 'Comparer des cigares'), body.slice(0, 120))
    check("l'état vide dit pourquoi il en faut deux", contains(body, 'comparer une fiche à rien'))

    console.log('\n6. Ajouter deux fiches')
    await page.locator('input[name="q"]').fill('undercrown')
    await page.getByRole('button', { name: 'Chercher' }).click()
    await settle(page)
    check('la recherche répond', contains(await text(page), 'Undercrown'), (await text(page)).slice(0, 200))

    await page.getByRole('button', { name: 'Ajouter' }).first().click()
    await settle(page)
    body = await text(page)
    check('une seule fiche demande la seconde', contains(body, 'Ajoutez-en une seconde'), body.slice(0, 300))

    await page.getByRole('button', { name: 'Ajouter' }).first().click()
    await settle(page)
    check('deux fiches sont dans l’URL', (page.url().match(/c=/g) ?? []).length === 2, page.url())

    body = await text(page)
    check('le tableau compare les marques', contains(body, 'Marque'), body.slice(0, 300))
    check('ce qui manque est marqué manquant', contains(body, '—'), body.slice(0, 400))
    // Et surtout : le comparateur **n'affirme pas** qu'une fiche a été relue.
    // `verified_at` est rempli sur les 940 fiches, `verified_by` sur aucune, et
    // 862 n'ont jamais été lues par personne. Aucun écran ne montre cette
    // colonne ; celui-ci ne sera pas le premier.
    check(
      'aucune relecture n’est affirmée',
      !contains(body, 'Relue le'),
      body.slice(0, 500),
    )
    check('la page dit que la comparaison est une URL', contains(body, 'se copie'))

    console.log('\n7. Retirer une fiche')
    await page.getByRole('link', { name: 'Retirer' }).first().click()
    await settle(page)
    check('il n’en reste qu’une', (page.url().match(/c=/g) ?? []).length === 1, page.url())

    console.log('\n8. Au-delà de quatre, le tableau ne se lit plus')
    const slugs = ['undercrown-10-robusto', 'undercrown-10-toro']
    const many = `${BASE}/cigares/comparer?` + slugs.map((s) => `c=${s}`).join('&') + '&c=a&c=b&c=z'
    await page.goto(many)
    await settle(page)
    check(
      'les slugs inconnus sont ignorés plutôt que de casser la page',
      contains(await text(page), 'Undercrown'),
      (await text(page)).slice(0, 200),
    )
  } finally {
    await browser.close()
  }

  console.log(`\n${passed} assertions passées, ${failures.length} échec(s)`)
  for (const failure of failures) console.log(`  - ${failure}`)
  process.exit(failures.length === 0 ? 0 : 1)
}

void main()
