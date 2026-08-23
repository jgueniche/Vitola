/**
 * Le parcours de la contribution wiki, contre la vraie base, avec deux rôles.
 *
 *   pnpm build && pnpm start --port 3100
 *   pnpm tsx tooling/parcours/contributions.ts
 *
 * C'est le seul parcours qui **écrit dans le référentiel**, et c'est donc le
 * seul dont le nettoyage est lui-même un parcours : la valeur d'origine est
 * relue au début et remise à la fin **par le produit** — une proposition, une
 * acceptation — parce qu'une remise en état qui court-circuite l'écran ne
 * prouve pas que l'écran sait la faire.
 *
 * Ce qu'il ne peut pas nettoyer : les lignes de `ref.cigar_revisions` décidées.
 * Une proposition décidée est de l'histoire, et aucun écran ne l'efface — c'est
 * voulu. Elles se retirent en SQL après coup si la recette humaine doit partir
 * d'une file vide ; le compte rendu de la session le dit.
 *
 * Le champ manipulé est `discontinued_year`, choisi parce qu'il est nul partout,
 * réversible par un champ vide, et qu'il ne change pas le nom d'une fiche.
 */

import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test'

const BASE = process.env.PARCOURS_BASE ?? 'http://127.0.0.1:3100'
const PASSWORD = process.env.PARCOURS_PASSWORD ?? 'cigardeur'
const MEMBER = process.env.PARCOURS_USER_ONE ?? 'test1@cigardeur.com'
const EDITOR = process.env.PARCOURS_EDITOR ?? 'jgueniche06@gmail.com'
const SLUG = process.env.PARCOURS_SLUG ?? 'undercrown-10-toro'

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
  await page.waitForTimeout(800)
}

async function text(page: Page): Promise<string> {
  return (await page.locator('main').innerText().catch(() => '')) ?? ''
}

/** Attend la réponse d'une écriture : confirmation ou refus. Voir parametres.ts. */
async function settled(page: Page, timeoutMs = 15000): Promise<{ ok: boolean; message: string }> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const alerts = (await page.locator('[role="alert"]').allInnerTexts()).filter(
      (item) => item.trim() !== '',
    )
    if (alerts.length > 0) return { ok: false, message: alerts[0] ?? '' }
    if ((await page.locator('[role="status"]').count()) > 0) return { ok: true, message: '' }
    await page.waitForTimeout(300)
  }
  return { ok: false, message: '(aucune réponse en 15 s)' }
}

/**
 * Attend la navigation qu'une décision provoque.
 *
 * `settle()` ne suffit pas et `settled()` encore moins : une décision **navigue**
 * — la confirmation est sur la page d'arrivée, pas dans le formulaire, qui a
 * disparu avec la proposition. Lire le DOM pendant que la navigation a lieu
 * renvoie ce qu'on trouve, c'est-à-dire n'importe quoi. `waitForURL` est la
 * primitive faite pour ça.
 */
async function decided(page: Page, outcome: 'approuvee' | 'refusee'): Promise<boolean> {
  try {
    await page.waitForURL(new RegExp(`decidee=${outcome}`), { timeout: 15000 })
    await settle(page)
    return true
  } catch {
    return false
  }
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

/** Dépose une proposition sur `discontinued_year`. Chaîne vide = remettre à nul. */
async function propose(page: Page, year: string, why: string): Promise<{ ok: boolean; message: string }> {
  await page.goto(`${BASE}/cigares/${SLUG}/proposer`)
  await settle(page)
  await page.locator('input[name="discontinued_year"]').fill(year)
  await page.locator('textarea[name="comment"]').fill(why)
  await page.getByRole('button', { name: 'Proposer' }).click()
  return settled(page)
}

async function main(): Promise<void> {
  const browser: Browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  })

  const memberContext: BrowserContext = await browser.newContext()
  const editorContext: BrowserContext = await browser.newContext()
  const member = await memberContext.newPage()
  const editor = await editorContext.newPage()

  let original = ''

  try {
    console.log('\n1. Le formulaire part de ce que la fiche contient déjà')
    await signIn(member, MEMBER)
    await member.goto(`${BASE}/cigares/${SLUG}/proposer`)
    await settle(member)

    check('la page rend', contains(await text(member), 'Proposer une correction'), await text(member))
    original = await member.locator('input[name="discontinued_year"]').inputValue()
    check(
      'les champs sont préremplis, pas vides',
      (await member.locator('input[name="commercial_name"]').inputValue()).length > 0,
    )
    check(
      'la fiche neuve est signalée comme non traitable, avec sa raison',
      contains(await text(member), 'created_by'),
      (await text(member)).slice(-300),
    )

    console.log('\n2. Une proposition qui ne propose rien est refusée par une phrase')
    await member.getByRole('button', { name: 'Proposer' }).click()
    const empty = await settled(member)
    check('elle dit qu’on n’a rien changé', empty.message.includes("rien changé"), empty.message)

    console.log('\n3. Deux propositions sur le même champ')
    const first = await propose(member, '2020', 'Parcours : première proposition.')
    check('la première est acceptée par le formulaire', first.ok, first.message)
    const second = await propose(member, '2021', 'Parcours : seconde proposition, même champ.')
    check('la seconde aussi', second.ok, second.message)

    console.log('\n4. Le membre voit les siennes, et pas la file')
    await member.goto(`${BASE}/contributions`)
    await settle(member)
    let body = await text(member)
    check('ses propositions sont là', contains(body, 'Année d’arrêt') || contains(body, "Année d'arrêt"), body.slice(0, 400))
    check('elles sont en attente', contains(body, 'En attente'), body.slice(0, 400))
    check(
      'la file lui est expliquée plutôt que cachée',
      contains(body, 'réservée aux relecteurs'),
      body.slice(-400),
    )
    check('et aucun bouton pour décider', !contains(body, 'Accepter et appliquer'))

    console.log('\n5. Le relecteur voit la file, la plus ancienne d’abord')
    await signIn(editor, EDITOR)
    await editor.goto(`${BASE}/contributions`)
    await settle(editor)
    body = await text(editor)
    check('la file est visible', contains(body, 'en attente'), body.slice(0, 300))
    check('avec le diff lisible', contains(body, '2020') && contains(body, '2021'), body.slice(0, 600))
    check('et de quoi décider', contains(body, 'Accepter et appliquer'))

    console.log('\n6. Un refus sans mot est refusé')
    await editor.getByRole('button', { name: 'Refuser' }).first().click()
    const noReason = await settled(editor)
    check('le refus demande un mot', noReason.message.includes('demande un mot'), noReason.message)

    console.log('\n7. Accepter applique à la fiche')
    await editor.goto(`${BASE}/contributions`)
    await settle(editor)
    await editor.locator('textarea[name="comment"]').first().fill('Parcours : accepté.')
    await editor.getByRole('button', { name: 'Accepter et appliquer' }).first().click()
    const landed = await decided(editor, 'approuvee')
    check(
      'la décision est annoncée sur la page où elle atterrit',
      landed && contains(await text(editor), 'Appliquée'),
      `${editor.url()} · ${(await text(editor)).slice(0, 200)}`,
    )

    await editor.goto(`${BASE}/cigares/${SLUG}/proposer`)
    await settle(editor)
    check(
      'la fiche porte la nouvelle valeur',
      (await editor.locator('input[name="discontinued_year"]').inputValue()) === '2020',
      await editor.locator('input[name="discontinued_year"]').inputValue(),
    )

    console.log('\n8. La seconde est devenue périmée, et le dit')
    await editor.goto(`${BASE}/contributions`)
    await settle(editor)
    await editor.locator('textarea[name="comment"]').first().fill('Parcours : sur une fiche qui a bougé.')
    await editor.getByRole('button', { name: 'Accepter et appliquer' }).first().click()
    const stale = await settled(editor)
    check('elle est refusée comme périmée', stale.message.includes('a changé'), stale.message)
    const staleText = await text(editor)
    check(
      'et le champ concerné est nommé',
      contains(staleText, 'Champs concernés') && contains(staleText, 'arrêt'),
      staleText.slice(-500),
    )

    console.log('\n9. La refuser avec un mot')
    // Rechargée d'abord : le refus précédent a laissé son message, et le lire
    // comme la réponse de celui-ci ferait échouer une action qui réussit.
    await editor.goto(`${BASE}/contributions`)
    await settle(editor)
    await editor.locator('textarea[name="comment"]').first().fill('Parcours : refusée, la fiche a bougé.')
    await editor.getByRole('button', { name: 'Refuser' }).first().click()
    const refused = await decided(editor, 'refusee')
    check(
      'le refus aboutit et le dit',
      refused && contains(await text(editor), 'Refusée, avec votre mot'),
      `${editor.url()} · ${(await text(editor)).slice(0, 200)}`,
    )
    check('la file est vide', contains(await text(editor), 'La file est vide'), (await text(editor)).slice(-400))

    console.log('\n10. Le membre voit les deux décisions, et le mot du relecteur')
    await member.goto(`${BASE}/contributions`)
    await settle(member)
    body = await text(member)
    check('une acceptée', contains(body, 'Acceptée'), body.slice(0, 500))
    check('une refusée', contains(body, 'Refusée'), body.slice(0, 500))
    check('avec le mot du relecteur', contains(body, 'Mot du relecteur'), body.slice(0, 700))
    check('et plus de bouton pour retirer', !contains(body, 'Retirer'))

    console.log('\n11. L’historique de la fiche raconte la même chose')
    await editor.goto(`${BASE}/cigares/${SLUG}/historique`)
    await settle(editor)
    body = await text(editor)
    check('les deux propositions y sont', contains(body, 'Acceptée') && contains(body, 'Refusée'), body.slice(0, 500))
  } finally {
    console.log('\nRemise en état du référentiel, par le produit')
    try {
      const restore = await propose(editor, original, 'Parcours : remise en état.')
      if (restore.ok) {
        await editor.goto(`${BASE}/contributions`)
        await settle(editor)
        await editor.locator('textarea[name="comment"]').first().fill('Parcours : remise en état.')
        await editor.getByRole('button', { name: 'Accepter et appliquer' }).first().click()
        await decided(editor, 'approuvee')
      }

      await editor.goto(`${BASE}/cigares/${SLUG}/proposer`)
      await settle(editor)
      check(
        'la fiche est rendue telle qu’elle était',
        (await editor.locator('input[name="discontinued_year"]').inputValue()) === original,
        await editor.locator('input[name="discontinued_year"]').inputValue(),
      )
    } catch (cause) {
      console.log(`  remise en état incomplète : ${String(cause)}`)
    }
    await browser.close()
  }

  console.log(`\n${passed} assertions passées, ${failures.length} échec(s)`)
  for (const failure of failures) console.log(`  - ${failure}`)
  console.log(
    '\nNote : les lignes de ref.cigar_revisions décidées restent — une décision est de',
  )
  console.log("l'histoire, et aucun écran ne l'efface. À retirer en SQL si la file doit repartir vide.")
  process.exit(failures.length === 0 ? 0 : 1)
}

void main()
