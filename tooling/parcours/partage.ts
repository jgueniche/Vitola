/**
 * Le parcours du partage de cave (ADR 0022), en navigateur, contre la vraie base.
 *
 *   pnpm build && pnpm start --port 3100
 *   pnpm tsx tooling/parcours/partage.ts
 *
 * Deux comptes : « un » possède une cave de parcours, « deux » la reçoit. Le
 * parcours rejoue d'abord le signalement du 26 septembre 2026 — une cave
 * montrée sur le profil apparaissait dans la liste d'un autre membre, avec un
 * bouton de suppression qui ne supprimait rien —, puis la vie entière d'un
 * partage : inviter, être prévenu, accepter, lire sans rien voir du prix,
 * masquer, réafficher, quitter, et supprimer la cave.
 *
 * Il **nettoie derrière lui** : la cave de parcours est supprimée à la fin, et
 * ses partages partent avec elle (`on delete cascade`). « Montrer ma cave » est
 * remis dans l'état où il a été trouvé. Les notifications d'invitation restent
 * dans la boîte de « deux » — elles se lisent, elles ne s'effacent qu'à la main.
 *
 * Même piège que les autres parcours : **les formulaires sont câblés par
 * l'hydratation**, donc `settle()` attend au-delà de `networkidle`.
 */

import { chromium, type Browser, type Page } from '@playwright/test'

const BASE = process.env.PARCOURS_BASE ?? 'http://127.0.0.1:3100'
const PASSWORD = process.env.PARCOURS_PASSWORD ?? 'cigardeur'
const ACCOUNTS = {
  un: process.env.PARCOURS_USER_ONE ?? 'test1@cigardeur.com',
  deux: process.env.PARCOURS_USER_TWO ?? 'test2@cigardeur.com',
}
/** Le pseudo de « deux », que « un » cherche pour l'inviter. */
const HANDLE_TWO = process.env.PARCOURS_HANDLE_TWO ?? 'test_deux'
/** Une fiche publiée, que « un » range avec un prix — le prix qui ne doit pas traverser. */
const CIGAR_QUERY = process.env.PARCOURS_CIGAR_QUERY ?? 'undercrown'

const CAVE_NAME = `Cave partagée de parcours ${Date.now()}`

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

/** `.eyebrow` uppercases by CSS: compare without case, always. */
function contains(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase())
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(900)
}

/**
 * The page's own `main`. Behind `(app)/loading.tsx` the skeleton is a `main`
 * too, and for a moment both are in the document.
 */
function main(page: Page) {
  return page.locator('main:not([aria-busy="true"])').last()
}

async function text(page: Page): Promise<string> {
  return (
    (await main(page)
      .innerText()
      .catch(() => '')) ?? ''
  )
}

/** Waits for a sentence rather than reading once: a revalidation lands after. */
async function seen(page: Page, needle: string, timeoutMs = 15000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (contains(await text(page), needle)) return true
    await page.waitForTimeout(400)
  }
  return false
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

/** Ticks or unticks « Montrer ma cave », and says what it was before. */
async function showHumidor(page: Page, on: boolean): Promise<boolean> {
  await page.goto(`${BASE}/parametres`)
  await settle(page)
  const box = page.locator('input[name="showHumidor"]')
  const before = await box.isChecked()
  if (before !== on) {
    await box.setChecked(on)
    await page.locator('form', { has: box }).getByRole('button', { name: 'Enregistrer' }).click()
    await seen(page, 'Enregistré')
  }
  return before
}

/** A row of a list, found by the humidor's name, so other caves do not interfere. */
function row(page: Page, name: string) {
  return main(page).locator('li', { hasText: name })
}

async function run(): Promise<void> {
  const browser: Browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  })

  const one = await browser.newContext()
  const two = await browser.newContext()
  const owner = await one.newPage()
  const guest = await two.newPage()
  for (const page of [owner, guest]) page.on('dialog', (dialog) => void dialog.accept())

  let humidorUrl: string | null = null
  let shownBefore: boolean | null = null

  try {
    console.log('\n0. Deux comptes')
    await signIn(owner, ACCOUNTS.un)
    await signIn(guest, ACCOUNTS.deux)

    /* ---------------------------------------------- 1. une cave, montrée */
    console.log('\n1. Une cave montrée sur le profil reste à son propriétaire')
    await owner.goto(`${BASE}/cave`)
    await settle(owner)
    await owner.locator('input[name="name"]').fill(CAVE_NAME)
    await owner.getByRole('button', { name: 'Créer la cave' }).click()
    check('la cave de parcours est créée', await seen(owner, CAVE_NAME))
    const link = main(owner).getByRole('link', { name: new RegExp(CAVE_NAME) })
    const href = await link.getAttribute('href')
    humidorUrl = href ? `${BASE}${href}` : null
    check('elle a une adresse', humidorUrl !== null)

    if (!humidorUrl) throw new Error('la cave de parcours n’a pas d’adresse')

    /* Un lot avec un prix : sans lui, « aucun prix ne traverse » serait vrai
       d'une cave vide et ne prouverait rien. */
    await owner.goto(`${humidorUrl}?q=${encodeURIComponent(CIGAR_QUERY)}`)
    await settle(owner)
    await owner.getByRole('button', { name: 'Mettre en cave' }).first().click()
    await settle(owner)
    await owner.locator('input[name="qty"]').first().waitFor({ state: 'visible', timeout: 15000 })
    await owner.locator('input[name="qty"]').fill('4')
    await owner.locator('input[name="price"]').fill('17.50')
    await owner.getByRole('button', { name: 'Ranger dans la cave' }).click()
    check('un lot de quatre, à 17,50 €, est rangé', await seen(owner, 'Rangé dans votre cave'))

    shownBefore = await showHumidor(owner, true)

    await guest.goto(`${BASE}/cave`)
    await settle(guest)
    check(
      "la cave montrée n'entre pas dans « Ma cave » de l'autre membre",
      !contains(await text(guest), CAVE_NAME),
    )
    if (humidorUrl) {
      await guest.goto(humidorUrl)
      await settle(guest)
      const page404 = (await guest.locator('body').innerText()) ?? ''
      check(
        "son adresse rend « Page introuvable » à l'autre membre",
        contains(page404, 'Page introuvable') && !contains(page404, CAVE_NAME),
      )
    }

    /* ------------------------------------------------- 2. l'invitation */
    console.log('\n2. Inviter, être prévenu, accepter')
    await owner.goto(`${humidorUrl}?membre=${encodeURIComponent(HANDLE_TWO)}#partage`)
    await settle(owner)
    await row(owner, `@${HANDLE_TWO}`).getByRole('button', { name: 'Inviter' }).click()
    check("le propriétaire lit l'invitation en attente", await seen(owner, 'Invitation en attente'))

    await guest.goto(`${BASE}/notifications`)
    await settle(guest)
    check('le destinataire est prévenu', await seen(guest, 'vous propose de partager sa cave'))

    await guest.goto(`${BASE}/cave`)
    await settle(guest)
    check("l'invitation nomme la cave", contains(await text(guest), CAVE_NAME))
    check(
      "avant la réponse, la cave n'est pas parmi les caves partagées",
      (await row(guest, CAVE_NAME).getByRole('link').count()) === 0,
    )
    await row(guest, CAVE_NAME).getByRole('button', { name: 'Accepter' }).click()
    await guest.waitForURL(/fait=acceptee/, { timeout: 15000 }).catch(() => undefined)
    await settle(guest)
    check("l'acceptation se dit", await seen(guest, 'Invitation acceptée'))
    check(
      'la cave est parmi les caves partagées',
      (await row(guest, CAVE_NAME).getByRole('link').count()) === 1,
    )

    /* -------------------------------------------- 3. la lecture seule */
    console.log('\n3. Lire sans rien voir de ce que la cave a coûté')
    await row(guest, CAVE_NAME).getByRole('link').click()
    await guest.waitForURL(/\/cave\/partagee\//, { timeout: 15000 }).catch(() => undefined)
    await settle(guest)
    const shared = await text(guest)
    check(
      'la page se dit en lecture seule',
      contains(shared, 'Lecture seule'),
      shared.slice(0, 200),
    )
    check('les quatre cigares y sont', contains(shared, '4 /') || contains(shared, '4 cigares'))
    check('aucun prix ne traverse', !shared.includes('€') && !shared.includes('17,50'))
    check(
      'aucun formulaire qui écrive',
      (await guest.locator('input[type="file"], input[name="rh"], input[name="qty"]').count()) ===
        0,
    )

    /* ------------------------------------------- 4. masquer, réafficher */
    console.log('\n4. Masquer, sans que le propriétaire le sache ; réafficher')
    await guest.getByRole('button', { name: 'Masquer' }).click()
    await guest.waitForURL(/fait=masquee/, { timeout: 15000 }).catch(() => undefined)
    await settle(guest)
    check('masquer se dit', await seen(guest, 'Cave masquée'))

    await owner.goto(`${humidorUrl}#partage`)
    await settle(owner)
    const panel = await text(owner)
    check(
      'le propriétaire lit « A accepté », jamais « masquée »',
      contains(panel, 'A accepté') && !contains(panel, 'masqu'),
    )

    await main(guest).locator('details summary').click()
    await row(guest, CAVE_NAME).getByRole('button', { name: 'Afficher de nouveau' }).click()
    await guest.waitForURL(/fait=affichee/, { timeout: 15000 }).catch(() => undefined)
    await settle(guest)
    check(
      'réafficher la remet dans la liste',
      (await row(guest, CAVE_NAME).getByRole('link').count()) === 1,
    )

    /* ------------------------------------------------------ 5. quitter */
    console.log('\n5. Quitter')
    await row(guest, CAVE_NAME).getByRole('link').click()
    await settle(guest)
    await guest.getByRole('button', { name: 'Quitter ce partage' }).click()
    await guest.waitForURL(/fait=quittee/, { timeout: 15000 }).catch(() => undefined)
    await settle(guest)
    check(
      'quitter se dit, et la cave disparaît de chez le destinataire',
      (await seen(guest, 'Vous avez quitté ce partage')) && !contains(await text(guest), CAVE_NAME),
    )

    /* ------------------------------------------ 6. supprimer, pour de vrai */
    console.log('\n6. Supprimer une cave partagée')
    await owner.goto(`${humidorUrl}?membre=${encodeURIComponent(HANDLE_TWO)}#partage`)
    await settle(owner)
    await row(owner, `@${HANDLE_TWO}`).getByRole('button', { name: 'Inviter' }).click()
    await seen(owner, 'Invitation en attente')

    await owner.goto(humidorUrl)
    await settle(owner)
    await owner.getByRole('button', { name: 'Supprimer cette cave' }).click()
    await owner.waitForURL(/fait=supprimee/, { timeout: 15000 }).catch(() => undefined)
    await settle(owner)
    check('la suppression se dit', await seen(owner, 'Cave supprimée'))
    check('et la cave est partie', !contains(await text(owner), CAVE_NAME))
    humidorUrl = null

    await guest.goto(`${BASE}/cave`)
    await settle(guest)
    check("l'invitation part avec la cave", !contains(await text(guest), CAVE_NAME))
  } finally {
    /* ------------------------------------------------------ nettoyage */
    console.log('\nNettoyage')
    try {
      if (humidorUrl) {
        await owner.goto(humidorUrl)
        await settle(owner)
        const del = owner.getByRole('button', { name: 'Supprimer cette cave' })
        if (await del.isVisible()) {
          await del.click()
          await owner.waitForURL(/\/cave(\?|$)/, { timeout: 15000 }).catch(() => undefined)
          await settle(owner)
        }
        await owner.goto(`${BASE}/cave`)
        await settle(owner)
        const left = await text(owner)
        check(
          'la cave de parcours a bien été effacée',
          !contains(left, CAVE_NAME),
          left.slice(0, 200),
        )
      }
      if (shownBefore !== null) await showHumidor(owner, shownBefore)
    } catch (cause) {
      console.log(`  nettoyage incomplet : ${String(cause)}`)
    }

    await browser.close()
  }

  console.log(`\n${passed} assertions passées, ${failures.length} échec(s)`)
  for (const failure of failures) console.log(`  - ${failure}`)
  process.exit(failures.length === 0 ? 0 : 1)
}

void run()
