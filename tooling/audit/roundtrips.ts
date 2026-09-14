/**
 * Le compte d'allers-retours par page — le point 2 de `docs/audit-2026-09-14.md`.
 *
 *   pnpm build
 *   VITOLA_TRACE_FILE=/tmp/roundtrips.jsonl \
 *     NODE_OPTIONS="--import ./tooling/audit/trace-roundtrips.mjs" pnpm start --port 3100
 *   VITOLA_TRACE_FILE=/tmp/roundtrips.jsonl pnpm tsx tooling/audit/roundtrips.ts
 *
 * Il MESURE, il ne relit pas le code. `lib/CLAUDE.md` promet trois
 * allers-retours au carnet, un seul appel au fil (`feed_page`) et un seul à la
 * boîte de réception (`conversation_inbox`) ; ces phrases ont été écrites avant
 * sept migrations et deux refontes, et une promesse tenue par une discipline se
 * vérifie en comptant.
 *
 * ## Trois pièges, appris en écrivant ce fichier
 *
 * 1. **Next précharge.** Un `<Link>` visible déclenche le rendu serveur de sa
 *    cible, donc ses requêtes, donc un compte qui n'est celui d'aucune page.
 *    Toute requête portant `next-router-prefetch` est refusée ici.
 * 2. **Deux côtés comptent.** Le serveur lit par `globalThis.fetch` (le
 *    préchargement ci-dessus), le navigateur peut lire directement ; les deux
 *    sont comptés, et rapportés séparément parce qu'ils ne coûtent pas la même
 *    chose.
 * 3. **Une fenêtre de temps n'est une attribution que si les visites sont
 *    sérielles.** Elles le sont, une par une, et chacune attend le repos du
 *    réseau avant de fermer sa fenêtre.
 */

import { readFileSync, writeFileSync } from 'node:fs'

import { chromium, type Browser, type Page } from '@playwright/test'

const BASE = process.env.PARCOURS_BASE ?? 'http://127.0.0.1:3100'
const PASSWORD = process.env.PARCOURS_PASSWORD ?? 'cigardeur'
const MEMBER = process.env.PARCOURS_USER_ONE ?? 'test1@cigardeur.com'
const TRACE = process.env.VITOLA_TRACE_FILE ?? '/tmp/roundtrips.jsonl'

/** Le seuil du point 2 de l'audit : au-delà, on propose la fonction SQL qui les remplace. */
const BUDGET = 5

type Hit = { t: number; ms: number; method: string; target: string; status: number; side: string }

type Visit = {
  page: string
  role: 'visiteur' | 'membre'
  from: number
  to: number
  wall: number
  browser: string[]
}

const visits: Visit[] = []

/** Les gabarits les plus lourds, plus ceux dont `lib/CLAUDE.md` chiffre la promesse. */
const VISITOR_PAGES = ['/', '/journal']
const MEMBER_PAGES = [
  '/cigares',
  '/cigares/undercrown-10-robusto',
  '/carnet',
  '/cave',
  '/fil',
  '/messages',
  '/lieux',
  '/statistiques',
  '/suggestions',
  '/boutique',
  '/notifications',
  '/membres',
]

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('load')
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(1200)
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

/** Une visite, et sa fenêtre de temps. Rien d'autre ne tourne pendant. */
async function visit(page: Page, path: string, role: Visit['role']): Promise<void> {
  const browser: string[] = []
  const listener = (request: { url: () => string }) => {
    const url = request.url()
    if (url.includes('/rest/v1/') || url.includes('/auth/v1/')) browser.push(url)
  }
  page.on('request', listener)

  const from = Date.now()
  await page.goto(`${BASE}${path}`)
  await settle(page)
  const to = Date.now()

  page.off('request', listener)
  visits.push({ page: path, role, from, to, wall: to - from, browser })
  process.stdout.write(`  vu   ${role.padEnd(9)} ${path}\n`)
}

function hitsIn(hits: Hit[], visit: Visit): Hit[] {
  return hits.filter((hit) => hit.t >= visit.from && hit.t <= visit.to)
}

async function run(browser: Browser): Promise<void> {
  const visitor = await browser.newContext()
  const visitorPage = await visitor.newPage()
  /* Piège 1 : un préchargement rend une AUTRE page côté serveur. */
  await visitorPage.route('**/*', (route) => {
    const headers = route.request().headers()
    if (headers['next-router-prefetch'] === '1') return route.abort()
    return route.continue()
  })

  console.log('\nVisiteur (sans portail, sans compte)')
  for (const path of VISITOR_PAGES) await visit(visitorPage, path, 'visiteur')
  await visitor.close()

  const member = await browser.newContext()
  const memberPage = await member.newPage()
  await memberPage.route('**/*', (route) => {
    const headers = route.request().headers()
    if (headers['next-router-prefetch'] === '1') return route.abort()
    return route.continue()
  })

  console.log('\nMembre connecté')
  await signIn(memberPage)
  for (const path of MEMBER_PAGES) await visit(memberPage, path, 'membre')
  await member.close()
}

async function main(): Promise<void> {
  writeFileSync(TRACE, '')
  /* `PARCOURS_CHROMIUM` pour les environnements où le binaire de Playwright
     n'est pas celui que la version épinglée attend (conteneur de session). */
  const executablePath = process.env.PARCOURS_CHROMIUM
  const browser = await chromium.launch(executablePath ? { executablePath } : {})
  try {
    await run(browser)
  } finally {
    await browser.close()
  }

  const hits: Hit[] = readFileSync(TRACE, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Hit)

  console.log(
    '\n\n  page                                rôle       serveur  navigateur  mur      détail',
  )
  console.log(`  ${'-'.repeat(110)}`)

  const over: string[] = []
  for (const v of visits) {
    const mine = hitsIn(hits, v)
    const byTarget = new Map<string, number>()
    for (const hit of mine) byTarget.set(hit.target, (byTarget.get(hit.target) ?? 0) + 1)
    const detail = [...byTarget.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([target, n]) => (n > 1 ? `${target}×${n}` : target))
      .join(' ')

    const flag = mine.length > BUDGET ? ' !' : '  '
    console.log(
      `  ${v.page.padEnd(36)}${v.role.padEnd(11)}${String(mine.length).padStart(5)}${flag}${String(v.browser.length).padStart(9)}${`${(v.wall / 1000).toFixed(1)}s`.padStart(9)}  ${detail}`,
    )
    if (mine.length > BUDGET) over.push(`${v.page} (${mine.length})`)
  }

  const slowest = [...hits].sort((a, b) => b.ms - a.ms).slice(0, 5)
  console.log(`\n  Les cinq appels les plus lents :`)
  for (const hit of slowest) {
    console.log(`    ${String(hit.ms).padStart(6)} ms  ${hit.target} (${hit.status})`)
  }

  console.log(`\n  ${hits.length} appels tracés, ${visits.length} pages visitées.`)
  if (over.length > 0) {
    console.log(`\n  Au-dessus du budget de ${BUDGET} : ${over.join(', ')}`)
  } else {
    console.log(`\n  Aucune page au-dessus du budget de ${BUDGET}.`)
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
