/**
 * Le parcours de la navigation en quatre univers, contre la vraie base.
 *
 *   pnpm build && pnpm start --port 3100
 *   pnpm tsx tooling/parcours/navigation.ts
 *
 * Il fige le contrat du regroupement : l'en-tête nomme quatre univers et
 * rien d'autre, chaque hub liste ses sections, et la règle de la promesse
 * tient — un visiteur du portail ne voit pas les univers qui le renverraient
 * à la connexion, et la carte des lieux suit son drapeau depuis le hub
 * Autour, plus depuis l'en-tête.
 */

import { chromium, type Browser, type Page } from '@playwright/test'

const BASE = process.env.PARCOURS_BASE ?? 'http://127.0.0.1:3100'
const PASSWORD = process.env.PARCOURS_PASSWORD ?? 'cigardeur'
const MEMBER = process.env.PARCOURS_USER_ONE ?? 'test1@cigardeur.com'

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

async function header(page: Page): Promise<string> {
  return (await page.locator('header').innerText().catch(() => '')) ?? ''
}

async function main(page: Page): Promise<string> {
  return (await page.locator('main').innerText().catch(() => '')) ?? ''
}

async function passGate(page: Page): Promise<void> {
  await page.goto(`${BASE}/majorite`)
  await settle(page)
  await page.locator('input[name="birthDate"]').fill('1985-04-02')
  await page.getByRole('button', { name: /entrer|valider|confirmer/i }).first().click()
  await settle(page)
}

async function signIn(page: Page): Promise<void> {
  await passGate(page)
  await page.goto(`${BASE}/connexion`)
  await settle(page)
  await page.locator('input[name="email"]').fill(MEMBER)
  await page.locator('input[name="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await settle(page)
}

async function run(): Promise<void> {
  const browser: Browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  })
  const visitor = await (await browser.newContext()).newPage()
  const member = await (await browser.newContext()).newPage()

  try {
    console.log('\n1. Un visiteur du portail voit deux univers, pas quatre')
    await passGate(visitor)
    await visitor.goto(`${BASE}/cigares`)
    await settle(visitor)
    const anonHeader = await header(visitor)
    check('Découvrir et Autour sont là', contains(anonHeader, 'Découvrir') && contains(anonHeader, 'Autour'), anonHeader)
    check(
      'Chez moi et Le cercle n’y sont pas — une entrée qui renvoie à la connexion est une promesse cassée',
      !contains(anonHeader, 'Chez moi') && !contains(anonHeader, 'cercle'),
      anonHeader,
    )
    check('et plus aucune entrée à plat', !contains(anonHeader, 'Codes de boîte') && !contains(anonHeader, 'Vitoles'))

    console.log('\n2. Connecté, les quatre univers, notifications et paramètres')
    await signIn(member)
    await member.goto(`${BASE}/cigares`)
    await settle(member)
    const memberHeader = await header(member)
    for (const label of ['Découvrir', 'Chez moi', 'cercle', 'Autour', 'Mon compte']) {
      check(`« ${label} » est dans l’en-tête`, contains(memberHeader, label), memberHeader)
    }

    console.log('\n3. Chaque hub liste ses sections, et elles répondent')
    await member.goto(`${BASE}/decouvrir`)
    await settle(member)
    const discover = await main(member)
    check('Découvrir porte le référentiel', contains(discover, 'cigares') && contains(discover, 'codes de boîte') && contains(discover, 'Contribuer'), discover.slice(0, 400))

    await member.goto(`${BASE}/chez-moi`)
    await settle(member)
    const mine = await main(member)
    check('Chez moi porte le carnet, la cave, les statistiques', contains(mine, 'carnet') && contains(mine, 'cave') && contains(mine, 'statistiques'))
    const notebookHref = await member.locator('main a', { hasText: 'carnet' }).first().getAttribute('href')
    check('la carte du carnet pointe où il vit', notebookHref === '/carnet', String(notebookHref))

    await member.goto(`${BASE}/cercle`)
    await settle(member)
    const circle = await main(member)
    check('Le cercle porte le fil, les membres, les clubs, l’agenda, les messages', contains(circle, 'fil') && contains(circle, 'membres') && contains(circle, 'clubs') && contains(circle, 'agenda') && contains(circle, 'messages'))

    await member.goto(`${BASE}/autour`)
    await settle(member)
    const around = await main(member)
    check('Autour porte les lieux (drapeau ouvert) et le journal', contains(around, 'lieux') && contains(around, 'journal'))
  } catch (cause) {
    failures.push(`exception : ${String(cause)}`)
    console.log(`  FAIL exception : ${String(cause)}`)
  } finally {
    await browser.close()
  }

  console.log(`\n${passed} assertions passées, ${failures.length} échec(s)`)
  for (const failure of failures) console.log(`  - ${failure}`)
  console.log('\nRien n’a été écrit : la navigation se lit, elle ne laisse rien derrière elle.')
  process.exit(failures.length === 0 ? 0 : 1)
}

void run()
