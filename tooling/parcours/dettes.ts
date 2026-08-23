/**
 * Le parcours des dettes signalées, en navigateur, contre la vraie base.
 *
 *   pnpm build && pnpm start --port 3100
 *   pnpm tsx tooling/parcours/dettes.ts
 *
 * Deux écrans, et le second **écrit** : promouvoir quelqu'un change son rôle
 * pour de bon. Le parcours le repose à `member` en partant, et vérifie que le
 * geste a laissé sa trace dans `audit_log` — qui, lui, ne s'efface jamais.
 *
 * Il tourne avec `jeremy` (admin) et `test_deux` (member), parce que c'est la
 * seule paire qui exerce la vraie asymétrie : un membre ne doit voir aucun
 * panneau de rôle, et l'API doit le refuser même s'il l'appelle à la main.
 */

import { chromium, type Browser, type Page } from '@playwright/test'

const BASE = process.env.PARCOURS_BASE ?? 'http://127.0.0.1:3100'
const PASSWORD = process.env.PARCOURS_PASSWORD ?? 'cigardeur'
const ADMIN = process.env.PARCOURS_ADMIN ?? 'jgueniche06@gmail.com'
const MEMBER = process.env.PARCOURS_USER_TWO ?? 'test2@cigardeur.com'
const MEMBER_HANDLE = process.env.PARCOURS_HANDLE_TWO ?? 'test_deux'

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
    const text = (await page.locator('main').innerText().catch(() => '')) ?? ''
    if (contains(text, needle)) return true
    if (Date.now() > deadline) return false
    await page.waitForTimeout(400)
  }
}

async function status(page: Page, needle: string, timeoutMs = 15000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const texts = await page.locator('[role="status"]').allInnerTexts().catch(() => [])
    if (texts.some((text) => contains(text, needle))) return true
    if (Date.now() > deadline) return false
    await page.waitForTimeout(400)
  }
}

async function body(page: Page): Promise<string> {
  return ((await page.locator('main').innerText().catch(() => '')) ?? '').slice(0, 320)
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

async function main(): Promise<void> {
  const browser: Browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  })

  const admin = await (await browser.newContext()).newPage()
  const member = await (await browser.newContext()).newPage()
  admin.on('dialog', (dialog) => void dialog.accept())
  member.on('dialog', (dialog) => void dialog.accept())

  try {
    /* ------------------------------ 1. la politique de confidentialité */
    console.log('\n1. La politique de confidentialité décrit ce que la base enregistre')
    await member.goto(`${BASE}/confidentialite`)
    await settle(member)

    const policy = await member.locator('main').innerText()
    check('elle répond sans franchir le portail', member.url().includes('/confidentialite'))
    check('elle décrit le carnet', contains(policy, 'Le carnet'), policy.slice(0, 120))
    check('elle décrit la cave', contains(policy, 'La cave'))
    check('elle décrit le social', contains(policy, 'Le social'))
    check(
      "elle dit l'article 9 avant tout le reste",
      policy.indexOf('article 9') > 0 && policy.indexOf('article 9') < policy.indexOf('Le carnet'),
      String(policy.indexOf('article 9')),
    )
    check(
      "elle dit qu'un retrait ne défait pas une lecture passée",
      contains(policy, 'ne défait pas une lecture passée'),
    )
    check(
      "elle dit que l'abonnement est libre, donc que l'audience peut grandir",
      contains(policy, "l'abonnement est libre"),
    )
    check(
      'elle dit que la cave montrée ne montre ni le prix ni le grand livre',
      contains(policy, 'ni le grand livre'),
    )
    check(
      'elle compte ses sources, et le nombre vient du code',
      /\d+ sources à ce jour/.test(policy),
      (/\d+ sources à ce jour/.exec(policy) ?? ['(aucun)'])[0],
    )
    check(
      "elle dit ce qui manque encore, plutôt que de l'omettre",
      contains(policy, "n'est pas encore publié"),
    )
    check('elle reste marquée comme non relue par un juriste', contains(policy, 'conseil juridique'))

    /* ------------------------------ 2. un membre ne voit aucun panneau de rôle */
    console.log('\n2. Un membre ne voit aucun panneau de rôle, et l’API le refuse')
    await signIn(member, MEMBER)
    await member.goto(`${BASE}/membres/jeremy`)
    await settle(member)
    check(
      'le profil d’un admin ne montre pas de panneau de rôle à un membre',
      !contains(await member.locator('main').innerText(), 'Rôle actuel'),
      await body(member),
    )

    /* Cacher un contrôle n'est pas une barrière : on appelle la route à la main. */
    const refused = await member.evaluate(async () => {
      const response = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: '00000000-0000-4000-8000-000000000001',
          role: 'editor',
        }),
      })
      return response.status
    })
    check(
      'et la route refuse un membre qui l’appelle directement',
      refused === 403,
      `HTTP ${refused}`,
    )

    /* ------------------------------ 3. un admin promeut, et la trace suit */
    console.log('\n3. Un admin promeut depuis le profil, et le journal le retient')
    await signIn(admin, ADMIN)
    await admin.goto(`${BASE}/membres/${MEMBER_HANDLE}`)
    await settle(admin)

    const panel = await admin.locator('main').innerText()
    check('l’admin voit le panneau de rôle', contains(panel, 'Rôle actuel'), panel.slice(0, 300))
    check('il montre la réputation', contains(panel, 'Réputation'))
    check('et le nombre de propositions acceptées', contains(panel, 'Propositions acceptées'))
    check(
      'il dit que rien ne calcule un seuil à sa place',
      contains(panel, 'rien ici ne calcule un seuil'),
      panel.slice(0, 500),
    )
    check('il annonce la trace', contains(panel, "journal d'audit"))

    await admin.locator('select#role').selectOption('editor')
    await admin.getByRole('button', { name: 'Appliquer' }).click()
    check('la promotion est confirmée', await status(admin, 'Rôle enregistré'), await body(admin))

    await admin.reload()
    await settle(admin)
    check(
      'et le rôle affiché a changé',
      await seen(admin, 'Relecteur'),
      await body(admin),
    )

    /* ------------------- 4. le relecteur ouvre enfin la file de contribution */
    console.log('\n4. La file de contribution s’ouvre à quelqu’un d’autre que jeremy')
    await member.goto(`${BASE}/contributions`)
    await settle(member)
    check(
      'le nouveau relecteur ne voit plus « la file est réservée »',
      !contains(await member.locator('main').innerText(), 'réservée aux relecteurs'),
      await body(member),
    )

    /* ------------------------------ 5. le rôle d’un admin ne se touche pas */
    console.log('\n5. Le rôle d’un administrateur ne se change pas depuis un écran')
    await admin.goto(`${BASE}/membres/jeremy`)
    await settle(admin)
    check(
      'son propre profil n’offre pas le panneau',
      !contains(await admin.locator('main').innerText(), 'Appliquer'),
      await body(admin),
    )
  } catch (error) {
    failures.push(`exception : ${error instanceof Error ? error.message.slice(0, 300) : String(error)}`)
    console.log(`\n  EXCEPTION ${error instanceof Error ? error.message.slice(0, 500) : String(error)}`)
  } finally {
    /* ------------------------------------------------------ nettoyage */
    console.log('\n6. Nettoyage — le rôle revient à member')
    await admin.goto(`${BASE}/membres/${MEMBER_HANDLE}`).catch(() => undefined)
    await settle(admin)
    const select = admin.locator('select#role')
    if (await select.count()) {
      await select.selectOption('member').catch(() => undefined)
      await admin.getByRole('button', { name: 'Appliquer' }).click().catch(() => undefined)
      await settle(admin)
      await admin.reload().catch(() => undefined)
      await settle(admin)
      /* Le libellé et sa valeur sont un `<dl>`, donc `innerText` les sépare par
         un saut de ligne et non par « : ». On lit la valeur là où elle est. */
      const back = (await admin.locator('dd').allInnerTexts().catch(() => [])) ?? []
      check(
        'le rôle est bien revenu à Membre',
        back.some((value) => contains(value, 'Membre')),
        back.join(' | ').slice(0, 200),
      )
    }

    console.log(`\n${passed} assertions passées, ${failures.length} échec(s).`)
    for (const failure of failures) console.log(`  - ${failure}`)

    await browser.close()
    process.exit(failures.length === 0 ? 0 : 1)
  }
}

void main()
