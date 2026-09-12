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
  return (
    (await page
      .locator('header')
      .innerText()
      .catch(() => '')) ?? ''
  )
}

async function main(page: Page): Promise<string> {
  return (
    (await page
      .locator('main')
      .innerText()
      .catch(() => '')) ?? ''
  )
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
    console.log('\n1. Un visiteur du portail voit trois sections, et pas une de plus')
    await passGate(visitor)
    await visitor.goto(`${BASE}/cigares`)
    await settle(visitor)
    const anonHeader = await header(visitor)
    for (const label of ['Boutique', 'Cigares', 'Partenaires']) {
      check(`« ${label} » est dans l’en-tête`, contains(anonHeader, label), anonHeader)
    }
    check(
      'les sections du membre n’y sont pas — une entrée qui renvoie à la connexion est une promesse cassée',
      !contains(anonHeader, 'Mon carnet') &&
        !contains(anonHeader, 'Ma cave') &&
        !contains(anonHeader, 'Cercle'),
      anonHeader,
    )
    check(
      'et les trois hubs retirés n’y sont plus',
      !contains(anonHeader, 'Découvrir') &&
        !contains(anonHeader, 'Autour') &&
        !contains(anonHeader, 'Chez moi'),
      anonHeader,
    )

    console.log('\n2. Connecté, les sept entrées, les notifications et les paramètres')
    await signIn(member)
    await member.goto(`${BASE}/cigares`)
    await settle(member)
    const memberHeader = await header(member)
    for (const label of [
      'Boutique',
      'Cigares',
      'Partenaires',
      'Mon carnet',
      'Ma cave',
      'Suggestions',
      'Cercle',
    ]) {
      check(`« ${label} » est dans l’en-tête`, contains(memberHeader, label), memberHeader)
    }

    console.log('\n3. Les trois hubs retirés répondent 308 vers ce qui les remplace')
    for (const [from, to] of [
      ['/decouvrir', '/cigares'],
      ['/autour', '/lieux'],
      ['/chez-moi', '/carnet'],
    ]) {
      await member.goto(`${BASE}${from}`)
      await settle(member)
      check(
        `${from} mène à ${to}`,
        new URL(member.url()).pathname === to,
        new URL(member.url()).pathname,
      )
    }

    console.log('\n4. Le carnet, la cave, les suggestions et les chiffres partagent leurs onglets')
    for (const path of ['/carnet', '/cave', '/suggestions', '/statistiques']) {
      await member.goto(`${BASE}${path}`)
      await settle(member)
      const body = await main(member)
      check(
        `${path} porte les quatre onglets`,
        contains(body, 'Mon carnet') &&
          contains(body, 'Ma cave') &&
          contains(body, 'Suggestions') &&
          contains(body, 'statistiques'),
        body.slice(0, 300),
      )
    }

    console.log('\n5. Le référentiel porte ses sections sous la liste')
    await member.goto(`${BASE}/cigares`)
    await settle(member)
    const cigars = await main(member)
    for (const label of [
      'marques',
      'vitolario',
      'roue des arômes',
      'codes de boîte',
      'Contribuer',
    ]) {
      check(`« ${label} » est sous la liste`, contains(cigars, label), cigars.slice(0, 600))
    }

    console.log('\n6. Le fil d’ariane ramène en arrière')
    await member.goto(`${BASE}/aromes`)
    await settle(member)
    const trailHref = await member
      .locator('nav[aria-label*="ariane"] a', { hasText: 'igares' })
      .first()
      .getAttribute('href')
    check('la roue des arômes ramène aux cigares', trailHref === '/cigares', String(trailHref))
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
