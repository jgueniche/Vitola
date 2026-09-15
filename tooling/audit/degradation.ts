/**
 * La règle de l'ADR 0020, vérifiée en la provoquant.
 *
 *   pnpm build
 *   # 1. rien de cassé — le témoin
 *   pnpm start --port 3100
 *   SCENARIO=sain pnpm tsx tooling/audit/degradation.ts
 *
 *   # 2. une lecture ACCESSOIRE tombe (la facette d'origine du 14 septembre)
 *   VITOLA_FAIL_MATCH='select=origin_country' \
 *     NODE_OPTIONS="--import ./tooling/audit/fault-inject.mjs" pnpm start --port 3100
 *   SCENARIO=accessoire pnpm tsx tooling/audit/degradation.ts
 *
 *   # 3. le SUJET tombe
 *   VITOLA_FAIL_MATCH='commercial_name' \
 *     NODE_OPTIONS="--import ./tooling/audit/fault-inject.mjs" pnpm start --port 3100
 *   SCENARIO=sujet pnpm tsx tooling/audit/degradation.ts
 *
 * ## Pourquoi trois scénarios et pas un
 *
 * Sur un site qui marche, « la page rend 200 » et « la page dégrade bien » se
 * ressemblent : les deux affichent la page. La règle ne se vérifie qu'en
 * cassant **une** lecture pendant que les autres répondent — une vraie panne
 * casse tout à la fois et emporte le sujet avec l'accompagnement, donc elle ne
 * montre jamais la moitié intéressante.
 *
 * Le témoin (`sain`) est là pour la raison inverse : sans lui, un scénario qui
 * ne trouverait aucun encart « indisponible » pourrait être un succès (rien
 * n'est cassé) ou une lacune (l'encart n'existe pas). Les trois ensemble
 * distinguent les deux.
 *
 * ## Et une leçon qui a coûté un tour
 *
 * Le premier jet ne se connectait pas. `/cigares` ne rend alors NI facettes NI
 * pages — c'est l'aperçu visiteur — donc le contrôle cherchait un encart sur
 * un écran qui n'a pas de panneau de facettes, et rendait « non » avec
 * l'assurance d'un verdict. La présence de la cible est donc vérifiée **avant**
 * toute assertion à son sujet, et son absence est une LACUNE, pas un échec.
 */

import AxeBuilder from '@axe-core/playwright'
import { chromium, type Browser, type Page } from '@playwright/test'

const BASE = process.env.PARCOURS_BASE ?? 'http://127.0.0.1:3100'
const PASSWORD = process.env.PARCOURS_PASSWORD ?? 'cigardeur'
const MEMBER = process.env.PARCOURS_USER_ONE ?? 'test1@cigardeur.com'
const SCENARIO = process.env.SCENARIO ?? 'sain'

let passed = 0
const failures: string[] = []
const gaps: string[] = []

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1
    console.log(`  ok   ${label}`)
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function gap(message: string): void {
  gaps.push(message)
  console.log(`  LACUNE ${message}`)
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('load')
  await page.waitForTimeout(1200)
}

async function signIn(page: Page): Promise<void> {
  await page.goto(`${BASE}/majorite`)
  await settle(page)
  await page.locator('input[name="birthDate"]').fill('1985-04-02')
  await page
    .getByRole('button', { name: /entrer|valider|confirmer/i })
    .first()
    .click()
  await settle(page)
  await page.goto(`${BASE}/connexion`)
  await settle(page)
  await page.locator('input[name="email"]').fill(MEMBER)
  await page.locator('input[name="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await settle(page)
}

async function run(browser: Browser): Promise<void> {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await signIn(page)

  const response = await page.goto(`${BASE}/cigares`)
  await settle(page)
  const status = response?.status() ?? 0
  const body = (await page.locator('body').innerText()).toLocaleLowerCase()

  const isErrorScreen = body.includes("quelque chose n'a pas abouti")
  const saysUnavailable = body.includes('momentanément illisible')
  const sheets = await page.locator('main a[href^="/cigares/"]').count()
  const hasFacetPanel = (await page.locator('aside').count()) > 0

  console.log(`\nScénario « ${SCENARIO} » — /cigares a rendu ${status}`)

  if (SCENARIO === 'sujet') {
    check("le sujet qui tombe rend l'écran d'erreur", isErrorScreen)
    check('… avec un statut 500', status === 500, `reçu ${status}`)
    /* La question tranchée le 15 septembre : l'écran nu, plus un chemin. */
    const home = await page.locator('main a[href="/"]').count()
    const journal = await page.locator('main a[href="/journal"]').count()
    check("… et un chemin de retour vers l'accueil", home > 0)
    check('… et vers le journal', journal > 0)
    await ctx.close()
    return
  }

  /* La cible d'abord : sans panneau de facettes, un « non » ne veut rien dire. */
  if (!hasFacetPanel) {
    gap('aucun panneau de facettes sur /cigares — rien à vérifier')
    await ctx.close()
    return
  }

  check("l'écran d'erreur n'est pas rendu", !isErrorScreen)
  check('le statut est 200', status === 200, `reçu ${status}`)
  check('le sujet de la page est là', sheets > 3, `${sheets} lien(s) de fiche`)

  if (SCENARIO === 'accessoire') {
    check("l'accompagnement qui tombe LE DIT", saysUnavailable)

    /* L'audit a11y ne voit jamais cet état : il lit un site qui marche, donc
       il n'a pas d'encart « indisponible » à analyser. C'est la lacune de
       couverture du 14 septembre dans une peau de plus — un écran audité dans
       un seul de ses états — et le seul endroit d'où elle se referme est ici,
       où l'état existe. */
    const results = await new AxeBuilder({ page }).analyze()
    check(
      "l'écran dégradé ne viole rien (axe, tous impacts)",
      results.violations.length === 0,
      results.violations.map((violation) => violation.id).join(', '),
    )
  } else {
    check('rien ne se dit indisponible quand rien ne tombe', !saysUnavailable)
  }

  await ctx.close()
}

async function main(): Promise<void> {
  const executablePath = process.env.PARCOURS_CHROMIUM
  const browser = await chromium.launch(executablePath ? { executablePath } : {})
  try {
    await run(browser)
  } finally {
    await browser.close()
  }

  console.log(
    `\n${passed} assertion(s) passée(s), ${failures.length} échec(s), ${gaps.length} lacune(s).`,
  )
  for (const failure of failures) console.log(`  FAIL ${failure}`)
  for (const message of gaps) console.log(`  LACUNE ${message}`)
  if (failures.length > 0 || gaps.length > 0) process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
