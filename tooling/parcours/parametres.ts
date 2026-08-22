/**
 * Le parcours de `/parametres`, en navigateur, contre la vraie base.
 *
 *   pnpm build && pnpm start --port 3100
 *   pnpm tsx tooling/parcours/parametres.ts
 *
 * Deux précautions qui n'existent pas dans les autres parcours :
 *
 *   1. **Il rétablit ce qu'il change.** Le pseudo, l'échelle et la
 *      confidentialité de `test_un` sont relus au début et réécrits à la fin.
 *      Un parcours qui laisse le compte de QA en « sur 20 » fait perdre un
 *      quart d'heure à la personne suivante.
 *   2. **Il ne clique jamais « Supprimer mon compte ».** Le bouton est vérifié
 *      présent et confirmé par un dialogue, et c'est tout : l'exercer
 *      détruirait le compte de recette, et l'endpoint est déjà couvert par
 *      `tests/unit/gdpr.test.ts` et par un appel HTTP réel de la session
 *      précédente.
 */

import { chromium, type Browser, type Page } from '@playwright/test'

const BASE = process.env.PARCOURS_BASE ?? 'http://127.0.0.1:3100'
const PASSWORD = process.env.PARCOURS_PASSWORD ?? 'cigardeur'
const ACCOUNT = process.env.PARCOURS_USER_ONE ?? 'test1@cigardeur.com'
const OTHER_HANDLE = process.env.PARCOURS_OTHER_HANDLE ?? 'test_deux'

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
  await page.waitForTimeout(900)
}

/**
 * Attend qu'une écriture ait répondu, et dit laquelle des deux réponses.
 *
 * Attendre est indispensable, et pas par prudence : **React 19 réinitialise un
 * formulaire quand son action revient**, en restaurant à chaque champ la valeur
 * qu'il avait au montage. Remplir un champ pendant ce laps de temps, c'est
 * écrire dans un formulaire qui va être remis à zéro — et c'est l'ancienne
 * valeur que le submit suivant poste. Deux assertions ont accusé le produit de
 * ne pas enregistrer un profil qu'il enregistrait très bien.
 *
 * Chaque étape recharge donc la page avant d'écrire, ce qui garantit qu'aucun
 * état d'action précédent ne traîne, puis attend ici la réponse de la sienne.
 */
async function settled(page: Page, timeoutMs = 15000): Promise<{ ok: boolean; message: string }> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const alerts = (await page.locator('[role="alert"]').allInnerTexts()).filter(
      (text) => text.trim() !== '',
    )
    if (alerts.length > 0) return { ok: false, message: alerts[0] ?? '' }
    if ((await page.locator('[role="status"]').count()) > 0) return { ok: true, message: '' }
    await page.waitForTimeout(300)
  }
  return { ok: false, message: '(aucune réponse en 15 s)' }
}

/** Attend un texte plutôt que de le lire une fois — voir `cave.ts`. */
async function seen(page: Page, needle: string, timeoutMs = 15000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const text = (await page.locator('main').innerText().catch(() => '')) ?? ''
    if (contains(text, needle)) return true
    await page.waitForTimeout(400)
  }
  return false
}

async function body(page: Page): Promise<string> {
  return ((await page.locator('main').innerText().catch(() => '')) ?? '').slice(0, 300)
}

async function signIn(page: Page): Promise<void> {
  await page.goto(`${BASE}/majorite`)
  await settle(page)
  await page.locator('input[name="birthDate"]').fill('1985-04-02')
  await page.getByRole('button', { name: /entrer|valider|confirmer/i }).first().click()
  await settle(page)

  await page.goto(`${BASE}/connexion`)
  await settle(page)
  await page.locator('input[name="email"]').fill(ACCOUNT)
  await page.locator('input[name="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await settle(page)
}

async function main(): Promise<void> {
  const browser: Browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  })
  const context = await browser.newContext()
  const page = await context.newPage()

  let originalHandle = ''
  let originalScale = '100'
  let originalShowHumidor = false

  try {
    console.log('\n1. La page répond, et dit qui on est')
    await signIn(page)
    await page.goto(`${BASE}/parametres`)
    await settle(page)

    check('/parametres rend', page.url().endsWith('/parametres'), page.url())
    check('elle nomme le compte', await seen(page, 'Mon compte'), await body(page))
    check('elle dit depuis quand', await seen(page, 'Membre depuis'), await body(page))

    originalHandle = (await page.locator('input[name="handle"]').inputValue()) || ''
    originalScale = (await page.locator('select[name="scoreScale"]').inputValue()) || '100'
    originalShowHumidor = await page.locator('input[name="showHumidor"]').isChecked()
    check('les valeurs actuelles sont pré-remplies', originalHandle.length > 0, originalHandle)

    console.log('\n2. Le rôle et la réputation ne sont pas modifiables')
    const html = await page.locator('main').innerHTML()
    check(
      "aucun champ n'écrit le rôle ni la réputation",
      !contains(html, 'name="role"') && !contains(html, 'name="reputation"'),
    )
    check('et la page le dit', await seen(page, 'hors de tout droit'), await body(page))

    console.log('\n3. Un pseudo déjà pris est refusé, et le dit')
    await page.locator('input[name="handle"]').fill(OTHER_HANDLE)
    await page.getByRole('button', { name: 'Enregistrer' }).first().click()
    const taken = await settled(page)
    check('le refus est une phrase', taken.message.includes('déjà pris'), taken.message)

    console.log('\n4. Un pseudo mal formé est refusé avant la base')
    await page.goto(`${BASE}/parametres`)
    await settle(page)
    await page.locator('input[name="handle"]').fill('Pseudo-Avec-Tirets')
    await page.getByRole('button', { name: 'Enregistrer' }).first().click()
    const malformed = await settled(page)
    check('le format est expliqué', malformed.message.includes('tirets bas'), malformed.message)

    console.log('\n5. Le profil s’enregistre')
    await page.goto(`${BASE}/parametres`)
    await settle(page)
    const wanted = `${originalHandle.slice(0, 20)}_qa`
    await page.locator('input[name="handle"]').fill(wanted)
    await page.locator('input[name="city"]').fill('Bordeaux')
    await page.getByRole('button', { name: 'Enregistrer' }).first().click()
    const savedProfile = await settled(page)
    check('la confirmation apparaît', savedProfile.ok, savedProfile.message)

    await page.reload()
    await settle(page)
    check(
      'et elle survit au rechargement',
      (await page.locator('input[name="handle"]').inputValue()) === wanted,
      await page.locator('input[name="handle"]').inputValue(),
    )
    check(
      'la ville aussi',
      (await page.locator('input[name="city"]').inputValue()) === 'Bordeaux',
    )

    console.log('\n6. L’échelle des notes déménage bien ici')
    await page.locator('select[name="scoreScale"]').selectOption('20')
    await page.getByRole('button', { name: 'Enregistrer' }).nth(1).click()
    const savedScale = await settled(page)
    check('la préférence est enregistrée', savedScale.ok, savedScale.message)

    await page.goto(`${BASE}/carnet`)
    await settle(page)
    check('le carnet affiche l’échelle en vigueur', await seen(page, 'Sur 20'), await body(page))
    check(
      'et renvoie ici pour la changer',
      await page.getByRole('link', { name: 'Changer' }).first().isVisible(),
    )

    console.log('\n7. La confidentialité s’enregistre, et dit ce qu’elle ne fait pas encore')
    await page.goto(`${BASE}/parametres`)
    await settle(page)
    const humidorBox = page.locator('input[name="showHumidor"]')
    await humidorBox.setChecked(!originalShowHumidor)
    await page.getByRole('button', { name: 'Enregistrer' }).nth(2).click()
    const savedPrivacy = await settled(page)
    check('la confirmation apparaît', savedPrivacy.ok, savedPrivacy.message)

    await page.reload()
    await settle(page)
    check(
      'le réglage a persisté',
      (await page.locator('input[name="showHumidor"]').isChecked()) === !originalShowHumidor,
    )
    check(
      'la page dit que ces réglages attendent P3',
      await seen(page, 'prendront effet avec le social'),
      await body(page),
    )

    console.log('\n8. Le registre de consentements est vide, et explique pourquoi')
    check('le registre est annoncé vide', await seen(page, 'Le registre est vide'), await body(page))
    check(
      "et dit qu'une case pour rien fabriquerait un enregistrement",
      await seen(page, 'fabriquerait un enregistrement'),
      await body(page),
    )
    check('la base légale de chaque traitement est écrite', await seen(page, 'Obligation légale'))
    check('y compris le contrat', await seen(page, 'Contrat'))

    console.log('\n9. Le RGPD est joignable depuis un écran')
    //
    // Le corps de l'export ne peut pas être produit ici : il se lit avec la
    // clé de service, et `api.supabase.com` est refusé par la politique de
    // sortie de ce conteneur. Ce qui se vérifie en local est donc que le geste
    // **part** — un téléchargement nommé — et l'inventaire des sources est
    // couvert par `tests/compliance/gdpr-inventory.test.ts`, qui relit le
    // schéma. Le contenu se recette une fois déployé.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Télécharger toutes mes données/i }).click(),
    ])
    check(
      'l’export part comme un fichier nommé',
      download.suggestedFilename().endsWith('.json'),
      download.suggestedFilename(),
    )

    const failure = await download.failure()
    if (failure) {
      console.log(`  note  corps non lisible en local (${failure}) — clé de service hors de portée`)
    } else {
      const bundle = JSON.parse(
        (await import('node:fs')).readFileSync((await download.path()) ?? '', 'utf8'),
      ) as Record<string, unknown>
      const data = (bundle.data ?? bundle) as Record<string, unknown>
      check(
        "il contient la cave, qui n'existait pas ce matin",
        'humidors' in data && 'humidorItems' in data,
        Object.keys(data).slice(0, 20).join(', '),
      )
    }

    check(
      'la suppression est offerte, derrière une confirmation',
      await page.getByRole('button', { name: 'Supprimer mon compte' }).isVisible(),
    )

    console.log('\n10. Déconnecté, la page renvoie vers la connexion')
    const anon = await browser.newContext()
    const anonPage = await anon.newPage()
    await anonPage.goto(`${BASE}/parametres`)
    await settle(anonPage)
    check(
      'redirection vers /connexion ou /majorite',
      anonPage.url().includes('/connexion') || anonPage.url().includes('/majorite'),
      anonPage.url(),
    )
    await anon.close()
  } finally {
    console.log('\nRemise en état du compte de QA')
    try {
      await page.goto(`${BASE}/parametres`)
      await settle(page)
      if (originalHandle) {
        await page.locator('input[name="handle"]').fill(originalHandle)
        await page.locator('input[name="city"]').fill('')
        await page.getByRole('button', { name: 'Enregistrer' }).first().click()
        await settled(page)
      }
      await page.goto(`${BASE}/parametres`)
      await settle(page)
      await page.locator('select[name="scoreScale"]').selectOption(originalScale)
      await page.getByRole('button', { name: 'Enregistrer' }).nth(1).click()
      await settled(page)

      await page.goto(`${BASE}/parametres`)
      await settle(page)
      await page.locator('input[name="showHumidor"]').setChecked(originalShowHumidor)
      await page.getByRole('button', { name: 'Enregistrer' }).nth(2).click()
      await settled(page)

      await page.reload()
      await settle(page)
      check(
        'le compte de QA est rendu tel qu’il était',
        (await page.locator('input[name="handle"]').inputValue()) === originalHandle &&
          (await page.locator('select[name="scoreScale"]').inputValue()) === originalScale &&
          (await page.locator('input[name="showHumidor"]').isChecked()) === originalShowHumidor,
      )
    } catch (cause) {
      console.log(`  remise en état incomplète : ${String(cause)}`)
    }
    await browser.close()
  }

  console.log(`\n${passed} assertions passées, ${failures.length} échec(s)`)
  for (const failure of failures) console.log(`  - ${failure}`)
  process.exit(failures.length === 0 ? 0 : 1)
}

void main()
