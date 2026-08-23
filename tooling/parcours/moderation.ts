/**
 * Le parcours de la modération (P8, ADR 0013), en navigateur, contre la vraie
 * base.
 *
 *   pnpm build && pnpm start --port 3100
 *   pnpm tsx tooling/parcours/moderation.ts
 *
 * Il **écrit** : un commentaire de fiche, deux signalements, deux décisions et
 * leurs deux actes (masquer, puis rétablir sur contestation). Le commentaire
 * est retiré par son auteur en partant ; les deux dossiers et leurs traces
 * restent — `mod.reports` et `mod.moderation_actions` n'ont aucun DELETE
 * client, par construction — et le compte rendu le dit : leur retrait est un
 * geste privilégié, fait après coup et compté.
 *
 * Ce que ce parcours prouve que rien d'autre ne peut prouver : la garde des
 * portes depuis un vrai compte membre, l'acte et sa trace dans la même
 * transaction vus depuis trois yeux différents (la salle, l'auteur, la
 * modératrice), et le chemin de contestation — un nouveau signalement, qui
 * rétablit.
 */

import { chromium, type Browser, type Page } from '@playwright/test'

const BASE = process.env.PARCOURS_BASE ?? 'http://127.0.0.1:3100'
const PASSWORD = process.env.PARCOURS_PASSWORD ?? 'cigardeur'
const ACCOUNTS = {
  un: process.env.PARCOURS_USER_ONE ?? 'test1@cigardeur.com',
  deux: process.env.PARCOURS_USER_TWO ?? 'test2@cigardeur.com',
  moderator: process.env.PARCOURS_EDITOR ?? 'jgueniche06@gmail.com',
}

const STAMP = Date.now()
const COMMENT_BODY = `Commentaire de parcours moderation ${STAMP}`
const REPORT_DETAIL = `Signalement de parcours ${STAMP}`
const CONTEST_DETAIL = `Contestation de parcours ${STAMP}`
const DECISION_NOTE = `Decision de parcours ${STAMP}`
const HIDE_REASON = `Masquage de parcours ${STAMP}`
/** Une fiche publiée du seed, la même que le parcours du journal lisait. */
const CIGAR = 'undercrown-10-robusto'

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
  await page.waitForLoadState('networkidle').catch(() => undefined)
  await page.waitForTimeout(900)
}

async function seen(page: Page, needle: string, timeoutMs = 15000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const text =
      (await page
        .locator('main')
        .innerText()
        .catch(() => '')) ?? ''
    if (contains(text, needle)) return true
    if (Date.now() > deadline) return false
    await page.waitForTimeout(400)
  }
}

async function signIn(page: Page, email: string): Promise<void> {
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
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await settle(page)
}

/** Signale le contenu contenu dans `scope` avec le motif donné. */
async function report(
  page: Page,
  scopeText: string,
  detail: string,
  trigger = 'Signaler',
): Promise<void> {
  const item = page.locator(`article:has-text("${scopeText}"), li:has-text("${scopeText}")`).first()
  await item.getByRole('button', { name: trigger, exact: true }).click()
  await page.waitForTimeout(400)
  await page.locator('select[name="reason"]').selectOption('spam')
  await page.locator('textarea[name="detail"]').fill(detail)
  await page.getByRole('button', { name: 'Envoyer le signalement' }).click()
  await page.waitForTimeout(1200)
}

async function main(): Promise<void> {
  let browser: Browser | null = null
  let caseUrl = ''

  try {
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
    })
    const ctxDeux = await browser.newContext()
    const ctxUn = await browser.newContext()
    const ctxMod = await browser.newContext()
    const deux = await ctxDeux.newPage()
    const un = await ctxUn.newPage()
    const mod = await ctxMod.newPage()
    for (const page of [deux, un, mod]) {
      page.on('dialog', (dialog) => void dialog.accept())
    }

    console.log('— deux écrit le commentaire qui servira de cible')
    await signIn(deux, ACCOUNTS.deux)
    await deux.goto(`${BASE}/cigares/${CIGAR}`)
    await settle(deux)
    /* Trois formulaires de la fiche portent `cigarId` + `body` (carnet, fil,
       commentaire). Celui du commentaire est le seul sans date de dégustation
       ni sélecteur de lieu. */
    const commentForm = deux
      .locator(
        'form:has(textarea[name="body"]):not(:has(input[name="smokedOn"])):not(:has(select[name="venueId"]))',
      )
      .first()
    await commentForm.locator('textarea[name="body"]').fill(COMMENT_BODY)
    await commentForm.getByRole('button', { name: 'Publier', exact: true }).click()
    check('le commentaire est publié', await seen(deux, COMMENT_BODY))

    console.log('— un le signale depuis la fiche')
    await signIn(un, ACCOUNTS.un)
    await un.goto(`${BASE}/cigares/${CIGAR}`)
    await settle(un)
    check('un voit le commentaire', await seen(un, COMMENT_BODY))
    await report(un, COMMENT_BODY, REPORT_DETAIL)
    check('le signalement est transmis', await seen(un, 'Signalement transmis'))

    console.log('— un membre ne relève pas la file')
    await un.goto(`${BASE}/moderation`)
    await settle(un)
    check('la file se refuse à un membre', await seen(un, 'Réservé aux modérateurs'))

    console.log('— la modératrice trouve la porte depuis ses paramètres')
    await signIn(mod, ACCOUNTS.moderator)
    await mod.goto(`${BASE}/parametres`)
    await settle(mod)
    check(
      'le lien vers la file est sur /parametres',
      await seen(mod, 'Relever la file de modération'),
    )
    await mod.getByRole('link', { name: 'Relever la file de modération' }).click()
    await mod.waitForURL('**/moderation', { timeout: 15000 })
    await settle(mod)
    check('la file montre le dossier', await seen(mod, REPORT_DETAIL))
    check('le dossier est daté contre le délai', await seen(mod, 'il y a 0 h'))

    console.log('— le dossier : prendre, puis trancher en masquant')
    await mod
      .locator(`li:has-text("${REPORT_DETAIL}")`)
      .getByRole('link', { name: 'Ouvrir le dossier' })
      .click()
    await mod.waitForURL('**/moderation/**', { timeout: 15000 })
    await settle(mod)
    caseUrl = mod.url().split('?')[0] ?? ''
    check('le contenu visé est cité', await seen(mod, COMMENT_BODY))
    await mod.getByRole('button', { name: 'Prendre le dossier' }).click()
    await mod.waitForURL('**?fait=dossier-pris', { timeout: 15000 })
    check('l accusé de réception est confirmé', await seen(mod, 'Dossier pris'))
    check('la date de prise est affichée', await seen(mod, 'Pris en examen'))

    await mod.getByRole('radio', { name: /Retenu/ }).check()
    await mod.locator('textarea[name="note"]').fill(DECISION_NOTE)
    await mod.getByRole('radio', { name: 'Masquer le contenu' }).check()
    await mod.locator('textarea[name="actReason"]').fill(HIDE_REASON)
    await mod.getByRole('button', { name: 'Enregistrer la décision' }).click()
    await mod.waitForURL('**/moderation?fait=dossier-tranche', { timeout: 15000 })
    check('la décision est confirmée sur la file', await seen(mod, 'Dossier tranché'))

    console.log('— trois paires d yeux sur le masquage')
    await un.goto(`${BASE}/cigares/${CIGAR}`)
    await settle(un)
    check('la salle ne voit plus le commentaire', !(await seen(un, COMMENT_BODY, 4000)))
    await deux.goto(`${BASE}/cigares/${CIGAR}`)
    await settle(deux)
    check(
      'l auteur voit encore son commentaire — on ne conteste pas ce qu on ne voit plus',
      await seen(deux, COMMENT_BODY),
    )
    await mod.goto(`${BASE}/moderation?onglet=tranches`)
    await settle(mod)
    check('l onglet tranchés porte le dossier', await seen(mod, REPORT_DETAIL))

    console.log('— la contestation est un nouveau signalement, qui rétablit')
    /* Le trou que la première version de ce parcours a trouvé : l'auteur d'un
       commentaire masqué n'avait AUCUN chemin d'écran pour contester — le
       bouton Signaler n'existe pas sur son propre commentaire. Il a désormais
       le motif sous les yeux et un bouton dédié. */
    await deux.goto(`${BASE}/cigares/${CIGAR}`)
    await settle(deux)
    check('l auteur lit le motif du masquage', await seen(deux, HIDE_REASON))
    await report(deux, COMMENT_BODY, CONTEST_DETAIL, 'Contester ce retrait')
    check('la contestation est transmise', await seen(deux, 'Signalement transmis'))
    await mod.goto(`${BASE}/moderation`)
    await settle(mod)
    check('la contestation est dans la file', await seen(mod, CONTEST_DETAIL))
    await mod
      .locator(`li:has-text("${CONTEST_DETAIL}")`)
      .getByRole('link', { name: 'Ouvrir le dossier' })
      .click()
    await mod.waitForURL('**/moderation/**', { timeout: 15000 })
    await settle(mod)
    check('le dossier dit que le contenu est masqué', await seen(mod, 'Actuellement masqué'))
    await mod.getByRole('radio', { name: /Retenu/ }).check()
    await mod.locator('textarea[name="note"]').fill(`Contestation fondee ${STAMP}`)
    await mod.getByRole('radio', { name: 'Rétablir le contenu' }).check()
    await mod.getByRole('button', { name: 'Enregistrer la décision' }).click()
    await mod.waitForURL('**/moderation?fait=dossier-tranche', { timeout: 15000 })
    await un.goto(`${BASE}/cigares/${CIGAR}`)
    await settle(un)
    check('le commentaire est rétabli pour la salle', await seen(un, COMMENT_BODY))

    console.log('— un dossier tranché ne se retranche pas (l écran le dit)')
    if (caseUrl) {
      await mod.goto(caseUrl)
      await settle(mod)
      check('le premier dossier montre sa motivation', await seen(mod, DECISION_NOTE))
      const decideStill = await mod
        .getByRole('button', { name: 'Enregistrer la décision' })
        .count()
      check('aucun formulaire de décision sur un dossier tranché', decideStill === 0)
    }

    console.log('— nettoyage : l auteur retire son commentaire')
    await deux.goto(`${BASE}/cigares/${CIGAR}`)
    await settle(deux)
    await deux
      .locator(`article:has-text("${COMMENT_BODY}"), li:has-text("${COMMENT_BODY}")`)
      .first()
      .getByRole('button', { name: 'Supprimer', exact: true })
      .click()
    await settle(deux)
    /* L'absence se lit sur une navigation fraîche : après une Server Action,
       le rafraîchissement RSC de la page courante peut arriver après notre
       fenêtre — la base avait déjà supprimé quand l'assertion lisait encore
       l'ancien rendu. Faux négatif mesuré, pas supposé. */
    await deux.goto(`${BASE}/cigares/${CIGAR}`)
    await settle(deux)
    check('le commentaire est retiré', !(await seen(deux, COMMENT_BODY, 4000)))
  } finally {
    if (browser) await browser.close()
  }

  console.log(`\n${passed} assertions passees, ${failures.length} echecs`)
  if (failures.length > 0) {
    for (const failure of failures) console.log(`  - ${failure}`)
    process.exitCode = 1
  } else {
    console.log(
      'Restes voulus : deux dossiers tranchés et leurs deux actes dans mod.* — ' +
        'retrait privilégié à faire en partant, et à compter.',
    )
  }
}

void main()
