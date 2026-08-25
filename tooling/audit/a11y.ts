/**
 * L'audit d'accessibilité de P8 — le critère de sortie du §9 : « Audit
 * axe-core 0 violation critique ».
 *
 *   pnpm build && pnpm start --port 3100
 *   pnpm tsx tooling/audit/a11y.ts
 *
 * Il parcourt un échantillon représentatif : chaque gabarit d'écran au moins
 * une fois — les pages publiques en visiteur, les pages du portail en membre
 * connecté, la file de modération en modérateur. Il **lit seulement** : aucune
 * écriture, rien à nettoyer.
 *
 * Le verdict est compté par impact. Le critère ne regarde que `critical`,
 * mais `serious` est rapporté en entier — un audit qui ne montre que ce qui
 * casse le build cache ce qui cassera le prochain.
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
const MODERATOR_PAGES = ['/moderation', '/admin', '/admin/drapeaux', '/admin/fiches', '/admin/gammes']

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

async function audit(page: Page, path: string): Promise<void> {
  await page.goto(`${BASE}${path}`)
  await settle(page)
  const results = await new AxeBuilder({ page }).analyze()
  for (const violation of results.violations) {
    findings.push({
      page: path,
      impact: violation.impact ?? 'unknown',
      id: violation.id,
      help: violation.help,
      nodes: violation.nodes.length,
    })
  }
  const critical = results.violations.filter((v) => v.impact === 'critical').length
  console.log(
    `  ${critical > 0 ? 'FAIL' : 'ok  '} ${path} — ${results.violations.length} violation(s)`,
  )
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

    console.log('— la file, en modérateur')
    const moderator = await (await browser.newContext()).newPage()
    await signIn(moderator, MODERATOR)
    for (const path of MODERATOR_PAGES) await audit(moderator, path)
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
  if (critical > 0) process.exitCode = 1
}

void main()
