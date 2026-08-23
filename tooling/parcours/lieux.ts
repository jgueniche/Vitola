/**
 * Le parcours des lieux (P5, ADR 0011), en navigateur, contre la vraie base.
 *
 *   pnpm build && pnpm start --port 3100
 *   pnpm tsx tooling/parcours/lieux.ts
 *
 * Il **écrit** : deux propositions de lieu, deux avis, un signalement, un
 * événement et une publication de fil sont créés pour de bon. Tout ce qu'un
 * navigateur sait retirer est retiré en partant ; deux restes sont dits plutôt
 * que cachés, parce qu'aucun écran ne sait les effacer :
 *
 *   - le **lieu publié** par le parcours — publier est irréversible depuis
 *     l'écran (fermer n'est pas effacer), et c'est voulu : une fiche publique
 *     ne disparaît pas sous les pieds de qui la lit. Il se retire en contexte
 *     privilégié, et le compte rendu le rappelle.
 *   - le **signalement** — `mod.reports` n'a aucun DELETE client, par
 *     construction. Même retrait privilégié.
 *
 * La géolocalisation est jouée pour de bon : le contexte Playwright porte une
 * position (le centre de Paris) et la permission, donc « Me localiser » suit
 * exactement le chemin d'un membre — l'API du navigateur, jamais un tiers.
 *
 * Les pièges du dépôt respectés ici comme dans `groupes.ts` : on attend un
 * rendu (`seen`) plutôt que de lire une fois, on attend une **adresse**
 * (`waitForURL`) plutôt qu'un délai après une action qui navigue, le dialogue
 * de confirmation est un `page.on('dialog')` persistant, et l'on **compte les
 * lignes en base** après le nettoyage — c'est une assertion, pas de la
 * paranoïa.
 */

import { chromium, type Browser, type Page } from '@playwright/test'

const BASE = process.env.PARCOURS_BASE ?? 'http://127.0.0.1:3100'
const PASSWORD = process.env.PARCOURS_PASSWORD ?? 'cigardeur'
const ACCOUNTS = {
  un: process.env.PARCOURS_USER_ONE ?? 'test1@cigardeur.com',
  deux: process.env.PARCOURS_USER_TWO ?? 'test2@cigardeur.com',
  editor: process.env.PARCOURS_EDITOR ?? 'jgueniche06@gmail.com',
}

const STAMP = Date.now()
const VENUE_NAME = `Salon de parcours ${STAMP}`
const VENUE_TWO = `Cave de parcours ${STAMP}`
const EVENT_TITLE = `Soiree au salon ${STAMP}`
const SESSION_BODY = `Fume ici, parcours ${STAMP}`
/** La fiche seedée que le parcours lit — première civette de Paris au registre. */
const SEEDED_SLUG = 'a-la-civette-paris'

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

async function body(page: Page): Promise<string> {
  return (
    (await page
      .locator('main')
      .innerText()
      .catch(() => '')) ?? ''
  ).slice(0, 400)
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

async function main(): Promise<void> {
  let browser: Browser | null = null
  let venueUrl = ''
  let venueTwoUrl = ''
  let eventUrl = ''

  try {
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
    })
    /* `un` porte une géolocalisation réelle : le centre de Paris, là où le
       seed est dense. C'est le chemin exact de « Me localiser ». */
    const ctxUn = await browser.newContext({
      geolocation: { latitude: 48.8566, longitude: 2.3522 },
      permissions: ['geolocation'],
    })
    const ctxDeux = await browser.newContext()
    const ctxEditor = await browser.newContext()
    const un = await ctxUn.newPage()
    const deux = await ctxDeux.newPage()
    const editor = await ctxEditor.newPage()

    /* Les confirmations destructives, en écouteur persistant : `page.once`
       rate le dialogue suivant, et un nettoyage qui échoue en silence est pire
       que pas de nettoyage. */
    for (const page of [un, deux, editor]) page.on('dialog', (d) => void d.accept())

    await signIn(un, ACCOUNTS.un)
    await signIn(deux, ACCOUNTS.deux)
    await signIn(editor, ACCOUNTS.editor)

    /* ---------------- 1 · La liste, le seed, la jauge ---------------------- */
    console.log('\n— La liste et le seed')
    await un.goto(`${BASE}/lieux`)
    await settle(un)
    check('la liste porte le plafond des 100 premiers lieux', await seen(un, '100 lieux'))
    check(
      'la provenance du seed est dite sur la liste (registre, millésime)',
      await seen(un, 'registre officiel'),
    )

    await un.goto(`${BASE}/lieux?q=civette&type=civette`)
    await settle(un)
    check('la recherche texte trouve les civettes du seed', await seen(un, 'A LA CIVETTE'))

    /* ---------------- 2 · La recherche par distance ------------------------ */
    console.log('\n— Autour de moi')
    await un.goto(`${BASE}/lieux`)
    await settle(un)
    await un.getByRole('button', { name: 'Me localiser' }).click()
    await un.waitForURL(/lat=48\.85/, { timeout: 15000 }).catch(() => undefined)
    await settle(un)
    check('« Me localiser » met la position dans l’adresse', un.url().includes('lat=48.85'))
    check('la page annonce le rayon', await seen(un, 'rayon de 25 km'))
    check('les distances se lisent sur les lignes', await seen(un, ' km'), await body(un))
    check(
      'les 25 civettes parisiennes du seed sont là',
      await seen(un, '25 lieux'),
      await body(un),
    )

    /* ---------------- 3 · La fiche seedée ---------------------------------- */
    console.log('\n— La fiche d’un lieu du registre')
    await un.goto(`${BASE}/lieux/${SEEDED_SLUG}`)
    await settle(un)
    check('la fiche dit sa source et son millésime', await seen(un, 'millésime 2018'))
    check('ce qu’on ne sait pas est dit non renseigné', await seen(un, 'non renseigné'))
    check('les horaires absents sont absents, pas devinés', await seen(un, 'Horaires non renseignés'))
    check(
      'la revendication explique pourquoi elle n’ouvre pas encore',
      await seen(un, 'revendication'),
    )
    check('l’avis vide invite', await seen(un, 'Aucun avis'))

    /* ---------------- 4 · Deux avis, la moyenne, le garde-fou --------------- */
    console.log('\n— Les avis')
    await un.locator('#avis-welcome').selectOption('5')
    await un.locator('#avis-comfort').selectOption('4')
    await un.locator('#avis-advice').selectOption('4')
    await un.locator('#avis-body').fill('Bon conseil, fauteuils fatigués.')
    await un.getByRole('button', { name: "Publier l'avis" }).click()
    await un.waitForURL(/fait=notee/, { timeout: 15000 }).catch(() => undefined)
    await settle(un)
    check('l’avis est enregistré, en role=status', await seen(un, 'Avis enregistré'))
    check('la note engendrée est la moyenne des trois critères', await seen(un, '4,3/5'))
    check('le garde-fou §2 est écrit sous le formulaire', await seen(un, 'jamais sur les produits'))

    await deux.goto(`${BASE}/lieux/${SEEDED_SLUG}`)
    await settle(deux)
    check('l’avis de test_un se lit chez test_deux', await seen(deux, 'fauteuils fatigués'))
    await deux.locator('#avis-welcome').selectOption('3')
    await deux.locator('#avis-comfort').selectOption('3')
    await deux.locator('#avis-advice').selectOption('3')
    await deux.getByRole('button', { name: "Publier l'avis" }).click()
    await deux.waitForURL(/fait=notee/, { timeout: 15000 }).catch(() => undefined)
    await settle(deux)
    check('la moyenne de la fiche suit les deux avis', await seen(deux, '3,7/5'), await body(deux))
    check('deux avis comptés', await seen(deux, '2 avis'))

    /* ---------------- 5 · Le signalement d’un avis -------------------------- */
    console.log('\n— Le signalement')
    await deux.getByRole('button', { name: 'Signaler cet avis' }).first().click()
    await settle(deux)
    await deux.locator('select[name="reason"]').selectOption('tobacco_promotion')
    await deux.getByRole('button', { name: 'Envoyer le signalement' }).click()
    check('le signalement d’un avis répond transmis — jamais 404', await seen(deux, 'Signalement transmis'))

    /* ---------------- 6 · Proposer, être seul à voir, publier --------------- */
    console.log('\n— La proposition, et qui la voit')
    await deux.goto(`${BASE}/lieux/proposer`)
    await settle(deux)
    await deux.locator('#lieu-type').selectOption('lounge')
    await deux.locator('#lieu-name').fill(VENUE_NAME)
    await deux.locator('#lieu-address').fill('1 place du Parcours')
    await deux.locator('#lieu-city').fill('Parcoursville')
    await deux.locator('#lieu-postal').fill('75099')
    await deux.locator('#lieu-lat').fill('48.8570')
    await deux.locator('#lieu-lng').fill('2.3530')
    await deux.getByRole('button', { name: 'Envoyer la proposition' }).click()
    await deux.waitForURL(/fait=proposee/, { timeout: 15000 }).catch(() => undefined)
    await settle(deux)
    venueUrl = deux.url().split('?')[0] ?? ''
    check('la proposition navigue vers sa fiche', venueUrl.includes('/lieux/salon-de-parcours'))
    check('la fiche dit l’attente de relecture', await seen(deux, 'attente de relecture'))

    // Un membre qui n'est ni l'auteur ni relecteur reçoit un 404 — jamais un refus.
    const probe = await un.goto(venueUrl).catch(() => null)
    check('une proposition d’autrui répond 404 à un membre', probe?.status() === 404)

    // La liste de l'auteur la montre sous « Vos propositions ».
    await deux.goto(`${BASE}/lieux`)
    await settle(deux)
    check('l’auteur retrouve sa proposition en attente', await seen(deux, VENUE_NAME))

    // L'éditeur la voit dans la file, la publie.
    await editor.goto(`${BASE}/lieux`)
    await settle(editor)
    check('la file des relecteurs porte la proposition', await seen(editor, VENUE_NAME))
    await editor.goto(venueUrl)
    await settle(editor)
    await editor.getByRole('button', { name: 'Publier ce lieu' }).click()
    await editor.waitForURL(/fait=publiee/, { timeout: 15000 }).catch(() => undefined)
    await settle(editor)
    check('publier confirme, en role=status', await seen(editor, 'Lieu publié'))

    await un.goto(venueUrl)
    await settle(un)
    check('publié, le lieu se lit de tout membre', await seen(un, VENUE_NAME))
    check(
      'sans géo… non : la position saisie à la proposition est là',
      !(await seen(un, 'pas géolocalisé', 2000)),
    )

    /* ---------------- 7 · L’événement au lieu ------------------------------- */
    console.log('\n— Un événement au lieu')
    await un.goto(`${BASE}/evenements`)
    await settle(un)
    await un.locator('#agenda-title').fill(EVENT_TITLE)
    await un.locator('#agenda-venue').selectOption({ label: `${VENUE_NAME} — Parcoursville` })
    const day = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(day)
    await un.locator('#agenda-starts').fill(`${iso}T20:00`)
    await un.getByRole('button', { name: 'Annoncer', exact: true }).click()
    await settle(un)
    check('l’événement est annoncé', await seen(un, 'Événement annoncé'))

    await un.goto(`${BASE}/evenements`)
    await settle(un)
    const eventLink = un.getByRole('link', { name: EVENT_TITLE }).first()
    const eventHref = (await eventLink.getAttribute('href').catch(() => null)) ?? ''
    eventUrl = eventHref.startsWith('http') ? eventHref : `${BASE}${eventHref}`
    await un.goto(eventUrl)
    await settle(un)
    check('la page de l’événement nomme le lieu du référentiel', await seen(un, VENUE_NAME))
    const venueLink = un.getByRole('link', { name: VENUE_NAME }).first()
    check('et le lieu est un lien vers sa fiche', (await venueLink.count()) > 0)

    /* ---------------- 8 · « Je fume ce cigare », avec le où ----------------- */
    console.log('\n— Une session au lieu, sur le fil')
    await un.goto(`${BASE}/cigares/undercrown-10-robusto`)
    await settle(un)
    await un.locator('#session-body').fill(SESSION_BODY)
    await un.locator('#session-venue').selectOption({ label: `${VENUE_NAME} — Parcoursville` })
    await un.locator('form:has(#session-venue) input[name="visibility"][value="public"]').check()
    await un.getByRole('button', { name: 'Publier au fil' }).click()
    await settle(un)

    await un.goto(`${BASE}/fil?onglet=decouverte`)
    await settle(un)
    check('la publication porte le lieu', await seen(un, VENUE_NAME), await body(un))

    /* ---------------- 9 · Retirer une proposition --------------------------- */
    console.log('\n— Retirer une proposition en attente')
    await deux.goto(`${BASE}/lieux/proposer`)
    await settle(deux)
    await deux.locator('#lieu-type').selectOption('cave')
    await deux.locator('#lieu-name').fill(VENUE_TWO)
    await deux.locator('#lieu-city').fill('Parcoursville')
    await deux.getByRole('button', { name: 'Envoyer la proposition' }).click()
    await deux.waitForURL(/fait=proposee/, { timeout: 15000 }).catch(() => undefined)
    await settle(deux)
    venueTwoUrl = deux.url().split('?')[0] ?? ''
    await deux.getByRole('button', { name: 'Retirer ma proposition' }).click()
    await deux.waitForURL(/fait=retiree/, { timeout: 15000 }).catch(() => undefined)
    await settle(deux)
    check('retirer navigue vers la liste et confirme', await seen(deux, 'Proposition retirée'))
    const probeTwo = await deux.goto(venueTwoUrl).catch(() => null)
    check('la proposition retirée n’existe plus', probeTwo?.status() === 404)
    venueTwoUrl = ''

    /* ---------------- 10 · Fermer, et ce que ferme veut dire ---------------- */
    console.log('\n— Fermer un lieu')
    await editor.goto(venueUrl)
    await settle(editor)
    await editor.getByRole('button', { name: 'Marquer fermé' }).click()
    await editor.waitForURL(/fait=fermee/, { timeout: 15000 }).catch(() => undefined)
    await settle(editor)
    check('fermer confirme', await seen(editor, 'Fiche marquée fermée'))
    check('la fiche fermée reste lisible et le dit', await seen(editor, 'signalé fermé'))

    await un.goto(`${BASE}/lieux?q=${encodeURIComponent(VENUE_NAME)}`)
    await settle(un)
    check('un lieu fermé sort de la liste', !(await seen(un, VENUE_NAME, 3000)))
  } catch (error) {
    /* Une exception est un échec écrit, jamais un compte rendu rassurant. */
    failures.push(`exception: ${String(error)}`)
    console.log(`  FAIL exception: ${String(error)}`)
  } finally {
    if (browser) {
      const pages = browser.contexts().flatMap((ctx) => ctx.pages())
      const [un, deux] = [pages[0], pages[1]]

      console.log('\n— Nettoyage')
      /* Les deux avis, par leurs auteurs. */
      for (const page of [un, deux]) {
        if (!page) continue
        await page.goto(`${BASE}/lieux/${SEEDED_SLUG}`).catch(() => undefined)
        await settle(page)
        const remove = page.getByRole('button', { name: 'Retirer mon avis' })
        if (await remove.count()) {
          await remove
            .first()
            .click()
            .catch(() => undefined)
          await page.waitForURL(/fait=avis-retire/, { timeout: 15000 }).catch(() => undefined)
        }
      }

      /* La publication de fil, par son auteur — depuis sa page, où vit
         Supprimer. Le lien vers la page est le SEUL href en /fil/ de la carte :
         « le dernier lien » de la première version tombait sur la fiche cigare,
         et le post survivait à chaque exécution. Compté en base, pas supposé. */
      if (un) {
        for (let round = 0; round < 5; round += 1) {
          await un.goto(`${BASE}/fil?onglet=decouverte`).catch(() => undefined)
          await settle(un)
          /* `seen`, jamais `body` : body() tronque à 400 caractères pour les
             diagnostics, et la publication vit plus bas dans la page. La
             première version cassait ici, en silence — compté en base. */
          if (!(await seen(un, SESSION_BODY, 4000))) break
          const link = un
            .locator(`article:has-text("${SESSION_BODY}") a[href^="/fil/"]`)
            .first()
          const href = (await link.getAttribute('href').catch(() => null)) ?? ''
          if (!href.startsWith('/fil/')) break
          await un.goto(`${BASE}${href}`).catch(() => undefined)
          await settle(un)
          const del = un.getByRole('button', { name: 'Supprimer', exact: true }).first()
          if (await del.count()) {
            await del.click().catch(() => undefined)
            await settle(un)
          }
        }
      }

      /* L'événement, par son hôte. */
      if (un && eventUrl) {
        await un.goto(eventUrl).catch(() => undefined)
        await settle(un)
        const cancel = un.getByRole('button', { name: "Annuler l'événement" })
        if (await cancel.count()) {
          await cancel
            .first()
            .click()
            .catch(() => undefined)
          await settle(un)
        }
      }

      /* Les notifications déclenchées en route, s'il y en a. */
      for (const page of [un, deux]) {
        if (!page) continue
        for (let round = 0; round < 3; round += 1) {
          await page.goto(`${BASE}/notifications`).catch(() => undefined)
          await settle(page)
          const markAll = page.getByRole('button', { name: 'Tout marquer comme lu' })
          const clear = page.getByRole('button', { name: /Effacer les notifications lues/ })
          if ((await markAll.count()) + (await clear.count()) === 0) break
          if (await markAll.count()) {
            await markAll
              .first()
              .click()
              .catch(() => undefined)
            await settle(page)
          }
          if (await clear.count()) {
            await clear
              .first()
              .click()
              .catch(() => undefined)
            await settle(page)
          }
        }
      }

      console.log(
        '\n  reste — deux lignes qu aucun écran ne sait retirer, à effacer en contexte privilégié :' +
          `\n    · le lieu publié puis fermé du parcours (${venueUrl || 'aucun'})` +
          '\n    · le signalement de l avis (mod.reports, aucun DELETE client)',
      )

      console.log(`\n${passed} assertions passées, ${failures.length} échec(s).`)
      for (const failure of failures) console.log(`  - ${failure}`)

      await browser.close()
      process.exit(failures.length === 0 ? 0 : 1)
    }
  }
}

void main()
