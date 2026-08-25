/**
 * Le parcours du rattachement à une gamme (ADR 0009, pièce 2), contre la vraie
 * base, avec deux rôles.
 *
 *   pnpm build && pnpm start --port 3100
 *   pnpm tsx tooling/parcours/gammes.ts                     # phase 'depot'
 *   PARCOURS_PHASE=refus pnpm tsx tooling/parcours/gammes.ts
 *   PARCOURS_PHASE=fin   pnpm tsx tooling/parcours/gammes.ts
 *
 * Trois phases et non une, parce que le refus qui compte — approuver une
 * proposition dont la gamme a été dépubliée entre-temps — demande un geste que
 * seul un contexte privilégié sait faire : repasser la gamme en brouillon.
 * Aucun écran ne le fait (la pièce 3 de l'ADR n'existe pas), donc le parcours
 * s'interrompt, la session dépublie en SQL, et la phase suivante constate le
 * refus. Même logique que le lot périmé de la cave : le seul chemin qu'aucun
 * test unitaire n'atteint.
 *
 * Les fixtures (deux gammes sur la marque de SLUG : une publiée, une en
 * brouillon) sont posées et retirées par la session en contexte privilégié,
 * pour la même raison — et le compte rendu vérifie le retour à zéro en base.
 */

import { chromium, type Browser, type Page } from '@playwright/test'

const BASE = process.env.PARCOURS_BASE ?? 'http://127.0.0.1:3100'
const PASSWORD = process.env.PARCOURS_PASSWORD ?? 'cigardeur'
const MEMBER = process.env.PARCOURS_USER_ONE ?? 'test1@cigardeur.com'
const EDITOR = process.env.PARCOURS_EDITOR ?? 'jgueniche06@gmail.com'
const SLUG = process.env.PARCOURS_SLUG ?? 'undercrown-10-toro'
/** Une fiche d'une AUTRE marque, sans gamme publiée : l'état vide est un écran. */
const SLUG_EMPTY = process.env.PARCOURS_SLUG_EMPTY ?? 'cao-pilon-robusto-extra'
const LINE_NAME = 'Gamme Parcours 0019'
const DRAFT_NAME = 'Gamme Parcours Brouillon'
const PHASE = process.env.PARCOURS_PHASE ?? 'depot'

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

/** Une décision navigue — voir contributions.ts. */
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

async function approveFirst(page: Page, note: string): Promise<{ ok: boolean; message: string }> {
  await page.goto(`${BASE}/contributions`)
  await settle(page)
  await page.locator('textarea[name="comment"]').first().fill(note)
  await page.getByRole('button', { name: 'Accepter et appliquer' }).first().click()
  return settled(page)
}

async function phaseDepot(member: Page, editor: Page): Promise<void> {
  console.log('\n1. Sans gamme publiée, le champ est une phrase, pas un sélecteur vide')
  await signIn(member, MEMBER)
  await member.goto(`${BASE}/cigares/${SLUG_EMPTY}/proposer`)
  await settle(member)
  check(
    'la phrase explique où sont les gammes',
    contains(await text(member), 'Aucune gamme publiée'),
    (await text(member)).slice(0, 400),
  )
  check(
    'et aucun sélecteur ne soumet rien',
    (await member.locator('select[name="line_id"]').count()) === 0,
  )

  console.log('\n2. Le sélecteur n’offre que les gammes publiées de la marque')
  await member.goto(`${BASE}/cigares/${SLUG}/proposer`)
  await settle(member)
  const options = await member.locator('select[name="line_id"] option').allInnerTexts()
  check('la gamme publiée est offerte', options.some((o) => contains(o, LINE_NAME)), options.join(' | '))
  check('le brouillon ne l’est pas', !options.some((o) => contains(o, DRAFT_NAME)), options.join(' | '))
  check('« Aucune » reste un choix', options.some((o) => contains(o, 'Aucune')))

  console.log('\n3. Proposer le rattachement')
  await member.locator('select[name="line_id"]').selectOption({ label: LINE_NAME })
  await member.locator('textarea[name="comment"]').fill('Parcours 0019 : rattachement à la gamme.')
  await member.getByRole('button', { name: 'Proposer' }).click()
  const sent = await settled(member)
  check('la proposition part', sent.ok, sent.message)

  console.log('\n4. Le diff porte le nom de la gamme, jamais son identifiant')
  await member.goto(`${BASE}/contributions`)
  await settle(member)
  const mine = await text(member)
  check('le champ « Gamme » est dans le diff', contains(mine, 'Gamme'), mine.slice(0, 500))
  check('avec le nom de la gamme', contains(mine, LINE_NAME), mine.slice(0, 500))

  console.log('\n5. Le relecteur la voit dans la file, lisible')
  await signIn(editor, EDITOR)
  await editor.goto(`${BASE}/contributions`)
  await settle(editor)
  const queue = await text(editor)
  check('la file la montre', contains(queue, LINE_NAME), queue.slice(0, 600))
  check('avec de quoi décider', contains(queue, 'Accepter et appliquer'))
  console.log('\n→ La session dépublie maintenant la gamme, puis PARCOURS_PHASE=refus.')
}

async function phaseRefus(editor: Page): Promise<void> {
  console.log('\n6. Approuver une gamme dépubliée entre-temps est refusé avec sa raison')
  await signIn(editor, EDITOR)
  const refused = await approveFirst(editor, 'Parcours 0019 : sur une gamme dépubliée.')
  check('le refus arrive', !refused.ok, refused.ok ? 'l’approbation est passée' : '')
  check('et nomme la publication', contains(refused.message, 'pas publiée'), refused.message)

  await editor.goto(`${BASE}/contributions`)
  await settle(editor)
  check(
    'la proposition reste en attente, rien n’a été appliqué',
    contains(await text(editor), 'Accepter et appliquer'),
    (await text(editor)).slice(-400),
  )
  console.log('\n→ La session republie la gamme, puis PARCOURS_PHASE=fin.')
}

async function phaseFin(editor: Page): Promise<void> {
  console.log('\n7. Republiée, la proposition s’applique et la fiche porte la gamme')
  await signIn(editor, EDITOR)
  await approveFirst(editor, 'Parcours 0019 : accepté.')
  const landed = await decided(editor, 'approuvee')
  check('la décision est annoncée où elle atterrit', landed, editor.url())

  await editor.goto(`${BASE}/cigares/${SLUG}`)
  await settle(editor)
  check('la fiche affiche le nom de la gamme', contains(await text(editor), LINE_NAME), (await text(editor)).slice(0, 400))

  console.log('\n8. Remise en état, par le produit : proposer « Aucune », accepter')
  await editor.goto(`${BASE}/cigares/${SLUG}/proposer`)
  await settle(editor)
  check(
    'le sélecteur porte la gamme enregistrée',
    (await editor.locator('select[name="line_id"]').inputValue()) !== '',
  )
  await editor.locator('select[name="line_id"]').selectOption({ value: '' })
  await editor.locator('textarea[name="comment"]').fill('Parcours 0019 : remise en état.')
  await editor.getByRole('button', { name: 'Proposer' }).click()
  const sent = await settled(editor)
  check('le détachement se propose', sent.ok, sent.message)

  await approveFirst(editor, 'Parcours 0019 : remise en état.')
  const restored = await decided(editor, 'approuvee')
  check('et s’applique', restored, editor.url())

  await editor.goto(`${BASE}/cigares/${SLUG}`)
  await settle(editor)
  check(
    'la fiche ne porte plus la gamme',
    !contains(await text(editor), LINE_NAME),
    (await text(editor)).slice(0, 400),
  )
  console.log('\n→ La session retire les fixtures et les révisions décidées, et compte en base.')
}

async function main(): Promise<void> {
  const browser: Browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  })
  const member = await (await browser.newContext()).newPage()
  const editor = await (await browser.newContext()).newPage()

  try {
    if (PHASE === 'depot') await phaseDepot(member, editor)
    else if (PHASE === 'refus') await phaseRefus(editor)
    else if (PHASE === 'fin') await phaseFin(editor)
    else throw new Error(`PARCOURS_PHASE inconnue : ${PHASE}`)
  } catch (cause) {
    failures.push(`exception : ${String(cause)}`)
    console.log(`  FAIL exception : ${String(cause)}`)
  } finally {
    await browser.close()
  }

  console.log(`\nPhase « ${PHASE} » : ${passed} assertions passées, ${failures.length} échec(s)`)
  for (const failure of failures) console.log(`  - ${failure}`)
  process.exit(failures.length === 0 ? 0 : 1)
}

void main()
