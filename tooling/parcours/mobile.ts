/**
 * Les trois points de la QA du 13 septembre 2026, mesurés à 390 px — la largeur
 * d'un iPhone 12.
 *
 *   pnpm build && pnpm start
 *   pnpm tsx tooling/parcours/mobile.ts
 *
 * Pourquoi un parcours de plus, et pourquoi à cette largeur : les trois défauts
 * signalés sont INVISIBLES au-dessus de `lg`. La déconnexion existait, dans un
 * rail `hidden lg:flex` ; la fiche tenait ses vingt faits en trois colonnes ;
 * les filtres étaient une colonne de 16 rem à côté des résultats. Un parcours
 * qui ne fixe pas sa fenêtre ne les voit pas, et les 66 assertions de P3 ne les
 * ont jamais vus.
 *
 * Deux mesures de ce fichier ont d'abord mesuré autre chose, et les deux
 * erreurs sont consignées à l'endroit où elles ont été faites : un sélecteur
 * qui attrapait la liste « Les marques » au lieu d'une carte de cigare, et la
 * position d'une barre `fixed` lue en coordonnées de document. Une mesure qui
 * ne change pas quand la page change mesure autre chose que ce qu'on croit.
 */
import { chromium, type Page } from '@playwright/test'

const BASE = process.env.PARCOURS_BASE ?? 'http://localhost:3000'
const PASSWORD = process.env.PARCOURS_PASSWORD ?? 'cigardeur'
const MEMBER = process.env.PARCOURS_USER_ONE ?? 'test1@cigardeur.com'

let pass = 0
let fail = 0

function ok(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    pass += 1
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    fail += 1
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

async function scrollHeight(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollHeight)
}

async function main(): Promise<void> {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()

  // --- le portail, puis la connexion ---------------------------------------
  await page.goto(`${BASE}/majorite?suite=%2Fcigares`)
  await page.locator('input[name="birthDate"]').fill('1985-05-05')
  await page.locator('button[type="submit"]').first().click()
  await page.waitForLoadState('networkidle')

  await page.goto(`${BASE}/connexion`)
  await page.locator('input[name="email"]').fill(MEMBER)
  await page.locator('input[name="password"]').fill(PASSWORD)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForLoadState('networkidle')

  console.log('\n=== 1 · se déconnecter depuis un téléphone')
  await page.goto(`${BASE}/cigares`)
  const railVisible = await page
    .locator('header button[type="submit"]', { hasText: 'Se déconnecter' })
    .first()
    .isVisible()
    .catch(() => false)
  ok('le bouton de déconnexion est caché avant d ouvrir le menu', !railVisible)

  const burger = page.locator('header button[aria-controls="menu-du-site"]')
  ok('le menu existe', (await burger.count()) === 1)
  ok('le menu est replié', (await burger.getAttribute('aria-expanded')) === 'false')
  await burger.click()
  ok('le menu s ouvre', (await burger.getAttribute('aria-expanded')) === 'true')

  const signOut = page.locator('#menu-du-site button[type="submit"]')
  const signOutVisible = await signOut.isVisible().catch(() => false)
  ok('le bouton « Se déconnecter » est DANS le menu, et visible', signOutVisible)
  const signedInAs = await page.locator('#menu-du-site').innerText()
  ok('le menu dit quel compte est connecté', signedInAs.includes(MEMBER), MEMBER)

  if (signOutVisible) {
    await signOut.click()
    await page.waitForLoadState('networkidle')
    await page.goto(`${BASE}/cigares`)
    await page.locator('header button[aria-controls="menu-du-site"]').click()
    const menuText = await page.locator('#menu-du-site').innerText()
    ok(
      'après le clic, la session est fermée (le menu propose de se connecter)',
      menuText.includes('Se connecter') && !menuText.includes('Se déconnecter'),
    )
  }

  // --- on se reconnecte pour la suite --------------------------------------
  await page.goto(`${BASE}/connexion`)
  await page.locator('input[name="email"]').fill(MEMBER)
  await page.locator('input[name="password"]').fill(PASSWORD)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForLoadState('networkidle')

  console.log('\n=== 2 · la fiche cigare : trois faits, le reste replié')
  await page.goto(`${BASE}/cigares`)
  const firstSheet = await page
    .locator('main a[href^="/cigares/"]')
    .filter({ hasNotText: 'comparer' })
    .first()
    .getAttribute('href')
  await page.goto(`${BASE}${firstSheet}`)
  await page.waitForLoadState('networkidle')

  /* `.eyebrow` met en capitales par CSS, et innerText rend le TEXTE RENDU :
     comparer à « Cepo » échoue sur « CEPO ». Le premier jet de ce fichier l'a
     fait, et l'échec disait la bonne chose de la mauvaise façon. */
  const eyebrows = await page.locator('main dl dt.eyebrow').allInnerTexts()
  const three = eyebrows.slice(0, 3).map((t) => t.trim().toLocaleLowerCase('fr'))
  ok(
    'les trois premiers faits sont Cepo, Force, Arômes',
    three[0]?.startsWith('cepo') === true && three[1] === 'force' && three[2] === 'arômes',
    eyebrows.slice(0, 3).join(' → '),
  )

  const folds = page.locator('main details')
  const foldCount = await folds.count()
  ok('la fiche a des replis', foldCount >= 2, `${foldCount} replis`)
  const openFolds = await page.locator('main details[open]').count()
  ok('tous les replis sont fermés à l arrivée', openFolds === 0)

  /* Ce qui compte est la position de ce qui vient APRÈS le référentiel : « vous
     et ce cigare », la note des membres, les entrées de carnet. Le geste
     « j'en fume un », lui, ne bouge pas et n'a pas à bouger — sur téléphone
     c'est une barre `fixed` sous le pouce, et la mesurer en coordonnées de
     document ne mesure que le défilement. Le premier jet de ce fichier l'a
     cru mobile et a lu 0 px puis 693 px sur une barre qui n'avait pas bougé
     d'un pixel. */
  const railTop = () =>
    page.evaluate(() => {
      const el = document.querySelector('main aside')
      return el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : -1
    })

  const beforeFolds = await scrollHeight(page)
  const railCollapsed = await railTop()
  for (let i = 0; i < foldCount; i += 1) await folds.nth(i).locator('summary').click()
  await page.waitForTimeout(250)
  const afterFolds = await scrollHeight(page)
  const railExpanded = await railTop()
  ok(
    'déplier rallonge la page — donc les replis retenaient bien du contenu',
    afterFolds > beforeFolds,
    `${beforeFolds} px → ${afterFolds} px`,
  )
  ok(
    'la note des membres et le carnet remontent',
    railCollapsed > 0 && railExpanded > railCollapsed,
    `replié : ${railCollapsed} px · déplié (l ancienne fiche) : ${railExpanded} px`,
  )

  console.log('\n=== 3 · /cigares : les filtres repliés par défaut')
  await page.goto(`${BASE}/cigares`)
  await page.waitForLoadState('networkidle')
  const facetFold = page.locator('main details').first()
  ok('les filtres sont dans un repli', (await facetFold.count()) === 1)
  ok('le repli est fermé à l arrivée', (await facetFold.getAttribute('open')) === null)

  const strengthChip = page.locator('main a', { hasText: 'Moyen-corsé' }).first()
  ok('aucune facette n est visible avant de déplier', !(await strengthChip.isVisible()))

  /* Où commencent les résultats : `main section`, et pas `main ul li` — le
     premier jet mesurait la liste « Les marques », qui est AVANT le panneau et
     ne bouge donc jamais. Une mesure qui ne change pas quand on déplie mesure
     autre chose que ce qu'on croit. */
  const resultsTop = () =>
    page.evaluate(() => {
      const el = document.querySelector('main section')
      return el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : -1
    })

  const beforeFacets = await scrollHeight(page)
  const topCollapsed = await resultsTop()
  await facetFold.locator('summary').click()
  await page.waitForTimeout(250)
  const afterFacets = await scrollHeight(page)
  const topExpanded = await resultsTop()
  ok(
    'déplier montre les facettes',
    (await strengthChip.isVisible()) && afterFacets > beforeFacets,
    `${beforeFacets} px → ${afterFacets} px`,
  )
  ok(
    'les résultats sont dans le premier écran, replié',
    topCollapsed > 0 && topCollapsed < 844 && topExpanded > topCollapsed,
    `replié : ${topCollapsed} px · déplié (l ancienne page) : ${topExpanded} px · écran : 844 px`,
  )

  await browser.close()
  console.log(`\n${pass} assertion(s) passées, ${fail} échec(s).`)
  if (fail > 0) process.exit(1)
}

await main()
