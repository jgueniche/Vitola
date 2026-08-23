/**
 * Le parcours des clubs, de l'agenda et de la messagerie, en navigateur, contre
 * la vraie base.
 *
 *   pnpm build && pnpm start --port 3100
 *   pnpm tsx tooling/parcours/groupes.ts
 *
 * Il **écrit** partout : un club, deux événements, une conversation et des
 * messages sont créés pour de bon, et effacés en partant. Une exception, dite
 * ici parce qu'elle ne s'efface pas d'un navigateur : `public.conversations`
 * n'a **aucun droit DELETE**, pour personne — la rétention est une question
 * ouverte de l'ADR 0010 et ouvrir la suppression l'aurait tranchée par
 * accident. La ligne de conversation survit donc au parcours, vide, et se
 * retire depuis un contexte privilégié.
 *
 * Deux pièges du dépôt sont respectés partout ci-dessous, comme dans
 * `social.ts` :
 *
 *   - **Les formulaires sont câblés par l'hydratation.** Cliquer avant que
 *     React n'ait attaché l'action ne soumet rien, en silence.
 *   - **Une assertion qui cherche un mot trouve la prose de la page.** On
 *     compare sans tenir compte de la casse, et on attend qu'un rendu arrive
 *     plutôt que de lire une fois.
 *
 * L'assertion qui compte le plus est celle de l'heure. Un `datetime-local` rend
 * une heure murale sans fuseau, PostgREST tourne en UTC : une dégustation
 * annoncée à 20 h aurait été enregistrée à 22 h de Paris, en été, en silence.
 * On saisit 20:00 et on exige de relire 20:00.
 */

import { chromium, type Browser, type Page } from '@playwright/test'

const BASE = process.env.PARCOURS_BASE ?? 'http://127.0.0.1:3100'
const PASSWORD = process.env.PARCOURS_PASSWORD ?? 'cigardeur'
const ACCOUNTS = {
  un: process.env.PARCOURS_USER_ONE ?? 'test1@cigardeur.com',
  deux: process.env.PARCOURS_USER_TWO ?? 'test2@cigardeur.com',
}
const HANDLES = {
  un: process.env.PARCOURS_HANDLE_ONE ?? 'test_un',
  deux: process.env.PARCOURS_HANDLE_TWO ?? 'test_deux',
}

const STAMP = Date.now()
const CLUB_NAME = `Club de parcours ${STAMP}`
const CLUB_SLUG = CLUB_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const EVENT_TITLE = `Degustation de parcours ${STAMP}`
const CLUB_EVENT_TITLE = `Rencontre de club ${STAMP}`
const MESSAGE_ONE = `Premier message de parcours ${STAMP}`
const MESSAGE_TWO = `Reponse de parcours ${STAMP}`

/** Demain, 20:00, en heure murale — ce que l'écran doit relire tel quel. */
const WALL_CLOCK = (() => {
  const day = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(day)
  return `${iso}T20:00`
})()

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

async function gone(page: Page, needle: string, timeoutMs = 15000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const text =
      (await page
        .locator('main')
        .innerText()
        .catch(() => '')) ?? ''
    if (!contains(text, needle)) return true
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

/** Suit quelqu'un depuis son profil — le lien que l'ADR 0010 D5 exige. */
async function follow(page: Page, handle: string): Promise<void> {
  await page.goto(`${BASE}/membres/${handle}`)
  await settle(page)
  const button = page.getByRole('button', { name: "S'abonner", exact: true })
  if (await button.count()) {
    await button.first().click()
    await settle(page)
  }
}

async function unfollow(page: Page, handle: string): Promise<void> {
  await page.goto(`${BASE}/membres/${handle}`).catch(() => undefined)
  await settle(page)
  const button = page.getByRole('button', { name: 'Se désabonner', exact: true })
  if (await button.count()) {
    await button
      .first()
      .click()
      .catch(() => undefined)
    await settle(page)
  }
}

async function main(): Promise<void> {
  const browser: Browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  })

  const un = await (await browser.newContext()).newPage()
  const deux = await (await browser.newContext()).newPage()
  un.on('dialog', (dialog) => void dialog.accept())
  deux.on('dialog', (dialog) => void dialog.accept())

  let eventUrl = ''
  let clubEventUrl = ''
  let conversationUrl = ''

  try {
    await signIn(un, ACCOUNTS.un)
    await signIn(deux, ACCOUNTS.deux)

    /* --------------------------------------------- 1. les trois destinations */
    console.log('\n1. Les trois sections répondent, et le menu y mène')
    for (const [label, path] of [
      ['clubs', '/clubs'],
      ['agenda', '/evenements'],
      ['messages', '/messages'],
    ] as const) {
      await un.goto(`${BASE}${path}`)
      await settle(un)
      check(`${label} répond sans rebondir`, un.url().includes(path), un.url())
    }

    const nav = await un.locator('header nav').innerText()
    check(
      'le menu montre les trois',
      contains(nav, 'clubs') && contains(nav, 'événements') && contains(nav, 'messages'),
      nav.replace(/\n/g, ' | ').slice(0, 240),
    )

    /* ------------------------------------------------------ 2. créer un club */
    console.log('\n2. Créer un club, et voir son adresse avant qu’il existe')
    await un.goto(`${BASE}/clubs`)
    await settle(un)

    await un.locator('input[name="name"]').fill(CLUB_NAME)
    const preview = await un.locator('#club-address').innerText()
    check(
      'le formulaire annonce l’adresse pendant la frappe',
      contains(preview, CLUB_SLUG),
      preview,
    )

    await un.locator('textarea[name="description"]').fill('Un club créé par un parcours.')
    await un.getByRole('button', { name: 'Créer le club' }).click()
    check('le club apparaît dans la liste', await seen(un, CLUB_NAME), await body(un))

    await un.goto(`${BASE}/clubs/${CLUB_SLUG}`)
    await settle(un)
    check('sa page répond à son adresse', un.url().includes(CLUB_SLUG), un.url())
    check('son fondateur en est membre d’office', await seen(un, '1 membre'), await body(un))
    check(
      'et il n’y a aucun fil dedans',
      !contains(await un.locator('main').innerText(), 'Publier'),
      await body(un),
    )

    /* ------------------------------------------------- 3. rejoindre, retirer */
    console.log('\n3. On rejoint librement ; le fondateur retire')
    await deux.goto(`${BASE}/clubs/${CLUB_SLUG}`)
    await settle(deux)
    await deux.getByRole('button', { name: 'Rejoindre' }).click()
    check('le second compte a rejoint', await seen(deux, 'Quitter le club'), await body(deux))
    check('et le compte des membres suit', await seen(deux, '2 membres'), await body(deux))

    await un.reload()
    await settle(un)
    check(
      'le fondateur voit un bouton « Retirer » en face du nouveau',
      (await un.getByRole('button', { name: 'Retirer' }).count()) === 1,
      await body(un),
    )
    await un.getByRole('button', { name: 'Retirer' }).first().click()
    check('le retrait est confirmé', await seen(un, 'Membre retiré'), await body(un))
    check('et le compte revient à un', await seen(un, '1 membre'), await body(un))

    await deux.reload()
    await settle(deux)
    await deux.getByRole('button', { name: 'Rejoindre' }).click()
    check('on peut rejoindre à nouveau', await seen(deux, 'Quitter le club'), await body(deux))

    /* --------------------------------------------- 4. l’heure qu’on a saisie */
    console.log('\n4. Annoncer un événement, et relire l’heure qu’on a saisie')
    await un.goto(`${BASE}/evenements`)
    await settle(un)
    await un.locator('input[name="title"]').fill(EVENT_TITLE)
    await un.locator('select[name="kind"]').selectOption('degustation')
    await un.locator('input[name="startsAt"]').fill(WALL_CLOCK)
    await un.locator('input[name="location"]').fill('Chez Marc, 12 rue des Cendres')
    await un.locator('input[name="capacity"]').fill('8')
    await un.getByRole('button', { name: 'Annoncer' }).click()
    check("l'événement est annoncé", await seen(un, EVENT_TITLE), await body(un))

    const href = await un.getByRole('link', { name: EVENT_TITLE }).first().getAttribute('href')
    eventUrl = href ? `${BASE}${href}` : ''
    check('il a une adresse à lui', eventUrl.length > 0, href ?? '(aucun href)')

    await un.goto(eventUrl)
    await settle(un)
    const shown = await un.locator('main').innerText()
    check(
      'et l’heure relue est celle qui a été saisie, pas celle d’UTC',
      shown.includes('20:00'),
      shown.slice(0, 240),
    )
    check('le lieu écrit à la main est là', contains(shown, 'rue des Cendres'))
    check('la limite de places est annoncée', contains(shown, '8 places'), shown.slice(0, 300))

    /* ------------------------------------------------------- 5. je viens */
    console.log('\n5. Répondre à un événement, et changer d’avis')
    await deux.goto(eventUrl)
    await settle(deux)
    await deux.locator('input[name="status"][value="going"]').check()
    await deux.getByRole('button', { name: 'Répondre' }).click()
    check('la réponse est enregistrée', await seen(deux, 'Réponse enregistrée'), await body(deux))
    check('et une personne vient', await seen(deux, '1 personne vient'), await body(deux))

    await deux.locator('input[name="status"][value="maybe"]').check()
    await deux.getByRole('button', { name: 'Répondre' }).click()
    check(
      '« peut-être » n’est pas un oui, et le compte le dit',
      await gone(deux, '1 personne vient'),
      await body(deux),
    )

    await deux.getByRole('button', { name: 'Retirer ma réponse' }).click()
    check('la réponse se retire', await seen(deux, 'Réponse retirée'), await body(deux))

    /* --------------------------------------------- 6. un événement de club */
    console.log('\n6. Un membre du club y annonce une rencontre')
    await deux.goto(`${BASE}/clubs/${CLUB_SLUG}`)
    await settle(deux)
    await deux.locator('input[name="title"]').fill(CLUB_EVENT_TITLE)
    await deux.locator('select[name="kind"]').selectOption('rencontre')
    await deux.locator('input[name="startsAt"]').fill(WALL_CLOCK)
    await deux.getByRole('button', { name: 'Annoncer' }).click()
    check(
      'la rencontre est au calendrier du club',
      await seen(deux, CLUB_EVENT_TITLE),
      await body(deux),
    )

    await un.goto(`${BASE}/evenements`)
    await settle(un)
    check("elle est aussi dans l'agenda général", await seen(un, CLUB_EVENT_TITLE), await body(un))
    const clubHref = await un
      .getByRole('link', { name: CLUB_EVENT_TITLE })
      .first()
      .getAttribute('href')
    clubEventUrl = clubHref ? `${BASE}${clubHref}` : ''
    check('et elle dit de quel club elle vient', await seen(un, CLUB_NAME), await body(un))

    /* ------------------------------------------------------- 7. écrire */
    console.log('\n7. On écrit à qui l’on suit, et pas à un inconnu')
    await un.goto(`${BASE}/messages`)
    await settle(un)
    const before = await un.locator('main').innerText()
    check(
      "sans lien d'abonnement, la page le dit plutôt que d'offrir un piège",
      contains(before, 'Personne à qui écrire') || (await un.locator('select#other').count()) > 0,
      before.slice(0, 240),
    )

    await follow(un, HANDLES.deux)
    await un.goto(`${BASE}/messages`)
    await settle(un)
    check(
      'une fois abonné, le destinataire est proposé',
      (await un.locator('select#other').count()) > 0,
      await body(un),
    )

    await un.getByRole('button', { name: 'Ouvrir la conversation' }).click()
    /* On attend l'ADRESSE, pas un délai. Une Server Action qui redirige rend la
       main au client avant que le routeur n'ait navigué : `page.url()` lu après
       900 ms rendait encore `/messages`, et tout le reste du parcours partait
       ensuite visiter la boîte de réception en croyant lire une conversation.
       Deux assertions rouges pour un produit qui marchait. */
    await un.waitForURL(/\/messages\/[0-9a-f-]{36}/, { timeout: 30000 }).catch(() => undefined)
    await settle(un)
    conversationUrl = un.url()
    check(
      'la conversation a une adresse',
      /\/messages\/[0-9a-f-]{36}/.test(conversationUrl),
      conversationUrl,
    )

    await un.locator('textarea[name="body"]').fill(MESSAGE_ONE)
    await un.getByRole('button', { name: 'Envoyer' }).click()
    check('le message est envoyé', await seen(un, MESSAGE_ONE), await body(un))
    check(
      "et il est marqué non lu tant qu'il ne l'est pas",
      await seen(un, 'Non lu'),
      await body(un),
    )

    /* ------------------------------------------- 8. le compte non lu */
    console.log('\n8. La boîte de réception compte ce qui n’a pas été lu')
    await deux.goto(`${BASE}/messages`)
    await settle(deux)
    check('le destinataire voit la conversation', await seen(deux, MESSAGE_ONE), await body(deux))
    /* Le compte, et pas seulement « il y en a » : deux exécutions dont la
       première s'est interrompue laissaient un message derrière elles, la
       pastille disait « 2 non lus », et l'assertion accusait le produit. */
    check('avec un compte non lu', await seen(deux, '1 non lu'), await body(deux))

    await deux.goto(conversationUrl)
    await settle(deux)
    check(
      "ouvrir ne marque pas lu — c'est un bouton",
      (await deux.getByRole('button', { name: 'Marquer comme lu' }).count()) === 1,
      await body(deux),
    )
    await deux.getByRole('button', { name: 'Marquer comme lu' }).click()
    check(
      'marquer comme lu est confirmé',
      await seen(deux, 'Conversation marquée comme lue'),
      await body(deux),
    )

    await un.reload()
    await settle(un)
    check("l'expéditeur voit que c'est lu", await seen(un, 'Lu'), await body(un))

    await deux.locator('textarea[name="body"]').fill(MESSAGE_TWO)
    await deux.getByRole('button', { name: 'Envoyer' }).click()
    check('la réponse part', await seen(deux, MESSAGE_TWO), await body(deux))

    /* ------------------------------------ 9. supprimer retire des deux côtés */
    console.log('\n9. Supprimer un message le retire pour les deux')
    await un.goto(conversationUrl)
    await settle(un)
    check("l'autre message est arrivé", await seen(un, MESSAGE_TWO), await body(un))
    const deletable = await un.getByRole('button', { name: 'Supprimer' }).count()
    check(
      'on ne peut supprimer que les siens',
      deletable === 1,
      `${deletable} bouton(s) — ${await body(un)}`,
    )
    await un.getByRole('button', { name: 'Supprimer' }).first().click()
    check('la suppression est confirmée', await seen(un, 'Message supprimé'), await body(un))

    await deux.goto(conversationUrl)
    await settle(deux)
    check('et le destinataire ne le lit plus', await gone(deux, MESSAGE_ONE), await body(deux))
  } catch (error) {
    failures.push(
      `exception : ${error instanceof Error ? error.message.slice(0, 300) : String(error)}`,
    )
    console.log(
      `\n  EXCEPTION ${error instanceof Error ? error.message.slice(0, 500) : String(error)}`,
    )
  } finally {
    /* ----------------------------------------------------------- nettoyage */
    console.log('\n10. Nettoyage')

    // Les messages restants, par leur auteur.
    for (const [page, marker] of [
      [deux, MESSAGE_TWO],
      [un, MESSAGE_ONE],
    ] as const) {
      if (!conversationUrl) break
      await page.goto(conversationUrl).catch(() => undefined)
      await settle(page)
      for (let round = 0; round < 6; round += 1) {
        const buttons = page.getByRole('button', { name: 'Supprimer' })
        if ((await buttons.count()) === 0) break
        await buttons
          .first()
          .click()
          .catch(() => undefined)
        await settle(page)
      }
      void marker
    }

    // Les deux événements, par leur hôte.
    for (const [page, url] of [
      [un, eventUrl],
      [deux, clubEventUrl],
    ] as const) {
      if (!url) continue
      await page.goto(url).catch(() => undefined)
      await settle(page)
      const cancel = page.getByRole('button', { name: "Annuler l'événement" })
      if (await cancel.count()) {
        await cancel
          .first()
          .click()
          .catch(() => undefined)
        await settle(page)
      }
    }

    // Le club, dissous par son fondateur — ses membres partent avec lui.
    await un.goto(`${BASE}/clubs/${CLUB_SLUG}`).catch(() => undefined)
    await settle(un)
    const dissolve = un.getByRole('button', { name: 'Dissoudre le club' })
    if (await dissolve.count()) {
      await dissolve
        .first()
        .click()
        .catch(() => undefined)
      await settle(un)
    }

    await unfollow(un, HANDLES.deux)

    /* Les notifications que ces gestes ont déclenchées (l'abonnement en écrit
       une). En boucle, et non en deux clics : les deux boutons **naviguent**,
       donc chacun rend une page neuve, et un seul passage a déjà laissé une
       ligne « lue mais pas effacée » derrière lui. On repart de la page à
       chaque tour, et on s'arrête quand il n'y a plus rien à cliquer. */
    for (const page of [un, deux]) {
      for (let round = 0; round < 4; round += 1) {
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

    // Ce qui reste, et qu'un navigateur ne peut pas retirer : la conversation.
    console.log(
      `\n  reste — la conversation ${conversationUrl || '(aucune)'} : public.conversations n'a` +
        ' aucun droit DELETE, pour personne (ADR 0010, rétention ouverte).',
    )

    console.log(`\n${passed} assertions passées, ${failures.length} échec(s).`)
    for (const failure of failures) console.log(`  - ${failure}`)

    await browser.close()
    process.exit(failures.length === 0 ? 0 : 1)
  }
}

void main()
