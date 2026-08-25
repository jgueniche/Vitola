/**
 * Le parcours de l'administration (ADR 0014), contre la vraie base, deux rôles.
 *
 *   pnpm build && pnpm start --port 3100
 *   pnpm tsx tooling/parcours/admin.ts
 *
 * Les fixtures (une marque, une fiche publiée jamais relue) sont posées et
 * retirées par la session en contexte privilégié — créer une fiche n'a pas
 * d'écran, et c'est voulu (ADR 0008). Le drapeau manipulé est
 * `show_indicative_prices`, choisi parce que rien ne le lit encore (Q19) :
 * l'aller-retour est sans effet visible ailleurs. Ses deux bascules laissent
 * deux lignes dans audit_log, et c'est exactement ce qu'on vérifie — un
 * journal ne se nettoie pas.
 */

import { chromium, type Browser, type Page } from '@playwright/test'

const BASE = process.env.PARCOURS_BASE ?? 'http://127.0.0.1:3100'
const PASSWORD = process.env.PARCOURS_PASSWORD ?? 'cigardeur'
const MEMBER = process.env.PARCOURS_USER_ONE ?? 'test1@cigardeur.com'
const ADMIN = process.env.PARCOURS_ADMIN ?? 'jgueniche06@gmail.com'
const SHEET_NAME = 'Fiche Parcours Admin'
const LINE_NAME = 'Ligne Parcours Admin'

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

/**
 * `load` + attente fixe, PAS `networkidle` : mesuré, `/admin/fiches` rend en
 * moins d'une seconde et `networkidle` ne s'établit jamais dessus — un
 * préchargement de liens garde une connexion ouverte. Un signal qui ne vient
 * jamais n'est pas un signal.
 */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('load')
  await page.waitForTimeout(1000)
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

/** Une action de fiche/gamme NAVIGUE : on attend l'adresse, jamais un délai. */
async function landed(page: Page, fait: string): Promise<boolean> {
  try {
    await page.waitForURL(new RegExp(`fait=${fait}`), { timeout: 15000 })
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

async function main(): Promise<void> {
  const browser: Browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  })
  const member = await (await browser.newContext()).newPage()
  const admin = await (await browser.newContext()).newPage()
  // Persistant : page.once() rate un dialogue sur deux (piège documenté).
  admin.on('dialog', (dialog) => void dialog.accept())

  try {
    console.log('\n1. Un membre lit pourquoi la porte est fermée — jamais une page blanche')
    await signIn(member, MEMBER)
    await member.goto(`${BASE}/admin`)
    await settle(member)
    check('le tableau de bord se refuse', contains(await text(member), 'Réservé aux administrateurs'))
    await member.goto(`${BASE}/admin/drapeaux`)
    await settle(member)
    check('les drapeaux aussi', contains(await text(member), 'Réservé aux administrateurs'))

    console.log('\n2. L’admin y entre par /parametres')
    await signIn(admin, ADMIN)
    await admin.goto(`${BASE}/parametres`)
    await settle(admin)
    check('le lien est sous l’en-tête', contains(await text(admin), 'Administrer le site'))

    await admin.goto(`${BASE}/admin`)
    await settle(admin)
    const dash = await text(admin)
    check('le tableau de bord rend ses files', contains(dash, 'files à relever'), dash.slice(0, 300))
    check('et l’état du référentiel', contains(dash, 'jamais relues'), dash.slice(0, 600))

    console.log('\n3. Les drapeaux : bascule tracée, engagement annoncé')
    await admin.goto(`${BASE}/admin/drapeaux`)
    await settle(admin)
    const flags = await text(admin)
    check('les six drapeaux parlent français', contains(flags, 'Prix indicatifs') && contains(flags, 'Seuil des commentaires'))
    check('l’engagement DSA est annoncé avant le geste', contains(flags, 'engagement publié'))

    const priceForm = admin.locator('form', { has: admin.locator('input[value="show_indicative_prices"]') })
    await priceForm.getByRole('button', { name: 'Activer' }).click()
    const on = await settled(admin)
    check('la bascule confirme et dit la trace', on.ok, on.message)
    await settle(admin)
    check(
      'l’état a vraiment changé',
      contains(await priceForm.innerText(), 'Activé'),
      await priceForm.innerText(),
    )
    await priceForm.getByRole('button', { name: 'Couper' }).click()
    const off = await settled(admin)
    check('et revient', off.ok, off.message)

    console.log('\n4. Les comptes : tout l’annuaire, y compris ce que la salle ne voit pas')
    await admin.goto(`${BASE}/admin/comptes?q=test_un`)
    await settle(admin)
    const accounts = await text(admin)
    check('la recherche trouve le compte', contains(accounts, 'test_un'), accounts.slice(0, 400))
    check('avec son rôle', contains(accounts, 'member'))
    check('et le chemin vers le profil, où vit la promotion', contains(accounts, 'Voir le profil'))

    console.log('\n5. La relecture d’une fiche, de bout en bout')
    await admin.goto(`${BASE}/admin/fiches?filtre=non-relues&q=${encodeURIComponent(SHEET_NAME)}`)
    await settle(admin)
    check('la fiche fixture est dans les non relues', contains(await text(admin), SHEET_NAME))
    check('dite jamais relue', contains(await text(admin), 'jamais relue'))

    await admin.getByRole('button', { name: 'Marquer relue' }).first().click()
    check('la relecture confirme où elle atterrit', await landed(admin, 'relue'), admin.url())
    check('et la fiche a quitté les non relues', !contains(await text(admin), SHEET_NAME))

    await admin.goto(`${BASE}/admin/fiches?filtre=publiees&q=${encodeURIComponent(SHEET_NAME)}`)
    await settle(admin)
    check('sous « publiées », elle porte sa date de relecture', contains(await text(admin), 'relue le'))

    await admin.getByRole('button', { name: 'Dépublier' }).first().click()
    check('la dépublication confirme', await landed(admin, 'depubliee'), admin.url())

    await admin.goto(`${BASE}/admin/fiches?filtre=brouillons&q=${encodeURIComponent(SHEET_NAME)}`)
    await settle(admin)
    check('elle est dans les brouillons', contains(await text(admin), SHEET_NAME))
    await admin.getByRole('button', { name: 'Republier' }).first().click()
    check('la republication confirme', await landed(admin, 'republiee'), admin.url())

    console.log('\n6. Une gamme naît en brouillon, se publie, se supprime')
    await admin.goto(`${BASE}/admin/gammes`)
    await settle(admin)

    await admin.locator('input[name="name"]').fill(LINE_NAME)
    await admin.getByRole('button', { name: 'Créer en brouillon' }).click()
    const noBrand = await settled(admin)
    check('sans marque, le refus nomme le champ', !noBrand.ok && contains(noBrand.message, 'marque'), noBrand.message)

    // Rechargée d'abord : le refus précédent a laissé son message, et le lire
    // comme la réponse de la création suivante ferait échouer une action qui
    // réussit — le piège de contributions.ts, au même endroit.
    await admin.goto(`${BASE}/admin/gammes`)
    await settle(admin)
    await admin.locator('select[name="brandId"]').selectOption({ label: 'Marque Parcours Admin' })
    await admin.locator('input[name="name"]').fill(LINE_NAME)
    await admin.getByRole('button', { name: 'Créer en brouillon' }).click()
    const created = await settled(admin)
    check('la création confirme', created.ok, created.message)
    await settle(admin)
    check('la gamme est là, en brouillon', contains(await text(admin), LINE_NAME) && contains(await text(admin), 'Brouillon'))

    const lineRow = admin.locator('li', { hasText: LINE_NAME })
    await lineRow.getByRole('button', { name: 'Publier' }).click()
    check('la publication confirme', await landed(admin, 'gamme-publiee'), admin.url())
    check('et la gamme est publiée', contains(await lineRow.innerText(), 'Publiée'))

    await lineRow.getByRole('button', { name: 'Supprimer' }).click()
    check('la suppression confirme', await landed(admin, 'gamme-supprimee'), admin.url())
    check('et la gamme est partie', !contains(await text(admin), LINE_NAME))
  } catch (cause) {
    failures.push(`exception : ${String(cause)}`)
    console.log(`  FAIL exception : ${String(cause)}`)
  } finally {
    await browser.close()
  }

  console.log(`\n${passed} assertions passées, ${failures.length} échec(s)`)
  for (const failure of failures) console.log(`  - ${failure}`)
  console.log('\n→ La session retire les fixtures (fiche, marque) et compte en base.')
  console.log('  Les bascules du drapeau restent dans audit_log : un journal ne se nettoie pas.')
  process.exit(failures.length === 0 ? 0 : 1)
}

void main()
