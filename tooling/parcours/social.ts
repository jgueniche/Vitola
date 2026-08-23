/**
 * Le parcours du social, en navigateur, contre la vraie base.
 *
 * Ce fichier n'est pas un test e2e et ne doit pas le devenir : la CI n'a pas de
 * base de données, et `/cigares` y lève une exception. Il vit dans `tooling/`
 * pour la même raison que les autres parcours — `test-results/` est gitignoré,
 * donc Node n'y résoudrait pas `@playwright/test`.
 *
 *   pnpm build && pnpm start --port 3100
 *   pnpm tsx tooling/parcours/social.ts
 *
 * Il **nettoie derrière lui** : publications, commentaires, braises,
 * abonnements, blocages et entrées de carnet créés ici sont effacés à la fin.
 * Les notifications qu'ils ont déclenchées aussi, ce qui n'est pas cosmétique :
 * elles s'écrivent par trigger, donc un parcours qui les laisse derrière lui
 * remplit la boîte d'un compte de QA avec ses propres traces.
 * `audit_log`, lui, ne s'efface jamais.
 *
 * Deux pièges du dépôt sont respectés partout ci-dessous :
 *
 *   - **Les formulaires sont câblés par l'hydratation.** Cliquer avant que React
 *     n'ait attaché l'action ne soumet rien, en silence. `networkidle` ne suffit
 *     pas ; il y faut une attente.
 *   - **Une assertion qui cherche un mot trouve la prose de la page.** On attend
 *     un `role="status"` quand il y en a un, et on compare sans tenir compte de
 *     la casse — `.eyebrow` met le texte en capitales par CSS.
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
const PUBLIC_POST = `Publication publique de parcours ${STAMP}`
const FOLLOWERS_POST = `Publication reservee de parcours ${STAMP}`
const QUESTION_POST = `Question de parcours ${STAMP}`
const REPLY = `Reponse de parcours ${STAMP}`
const ENTRY_NOTE = `Entree de parcours ${STAMP}`
const VOLUME_PREFIX = `Volume de parcours ${STAMP}`

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
  await page.waitForLoadState('networkidle').catch(() => undefined)
  await page.waitForTimeout(900)
}

/**
 * Attend qu'un texte apparaisse dans `main`, plutôt que de le lire une fois.
 *
 * Une Server Action qui appelle `revalidatePath` renvoie **avant** que le rendu
 * serveur n'arrive : une lecture immédiate voit la page d'avant, et l'assertion
 * échoue sur un produit qui marche.
 */
async function seen(page: Page, needle: string, timeoutMs = 15000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const text = (await page.locator('main').innerText().catch(() => '')) ?? ''
    if (contains(text, needle)) return true
    if (Date.now() > deadline) return false
    await page.waitForTimeout(400)
  }
}

/** L'inverse : attend qu'un texte DISPARAISSE. Un retrait est aussi un rendu. */
async function gone(page: Page, needle: string, timeoutMs = 15000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const text = (await page.locator('main').innerText().catch(() => '')) ?? ''
    if (!contains(text, needle)) return true
    if (Date.now() > deadline) return false
    await page.waitForTimeout(400)
  }
}

async function body(page: Page): Promise<string> {
  return ((await page.locator('main').innerText().catch(() => '')) ?? '').slice(0, 320)
}

/** Attend une confirmation par son RÔLE, jamais par un mot dans la prose. */
async function status(page: Page, needle: string, timeoutMs = 15000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const texts = await page.locator('[role="status"]').allInnerTexts().catch(() => [])
    if (texts.some((text) => contains(text, needle))) return true
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

/**
 * Publie depuis le composeur de `/fil`.
 *
 * `stay` évite de recharger la page entre deux publications : React 19
 * réinitialise le formulaire au retour de la Server Action, donc le composeur
 * est prêt pour la suivante. C'est ce qui rend supportable de publier les
 * vingt-et-une lignes qu'il faut pour forcer une seconde page.
 */
async function publish(
  page: Page,
  text: string,
  scope: 'followers' | 'public',
  kind = 'post',
  stay = false,
) {
  if (!stay) {
    await page.goto(`${BASE}/fil`)
    await settle(page)
  }
  await page.locator(`input[name="kind"][value="${kind}"]`).check()
  await page.locator('textarea[name="body"]').fill(text)
  await page.locator(`input[name="visibility"][value="${scope}"]`).check()
  await page.getByRole('button', { name: 'Publier', exact: true }).click()

  if (stay) {
    /* On attend que le champ se vide, et pas un délai. React 19 réinitialise le
       formulaire au RETOUR de la Server Action : un champ vide est donc le
       signal exact que l'écriture a eu lieu. Une attente fixe de 700 ms en a
       perdu six sur vingt-et-une — silencieusement, ce qui est le pire, parce
       que la page suivante en montrait « assez » pour ne pas se remarquer. */
    await page
      .waitForFunction(
        () =>
          (document.querySelector('textarea[name="body"]') as HTMLTextAreaElement | null)?.value === '',
        undefined,
        { timeout: 20000 },
      )
      .catch(() => undefined)
    return
  }
  await settle(page)
}

async function main(): Promise<void> {
  const browser: Browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  })

  const one = await browser.newContext()
  const two = await browser.newContext()
  const page = await one.newPage()
  const other = await two.newPage()

  /* Un seul gestionnaire permanent : un `page.once` que rien ne consomme reste
     armé et vient répondre au dialogue suivant, ce qui a déjà laissé une cave
     derrière un nettoyage une fois sur trois. */
  page.on('dialog', (dialog) => void dialog.accept())
  other.on('dialog', (dialog) => void dialog.accept())

  let publicPostUrl = ''
  let entryUrl = ''

  try {
    /* --------------------------------------------- 1. le fil, état vide */
    console.log('\n1. Le fil répond, et un fil vide est un écran')
    await signIn(page, ACCOUNTS.un)
    await signIn(other, ACCOUNTS.deux)

    await page.goto(`${BASE}/fil`)
    await settle(page)
    check('/fil répond à un membre connecté', page.url().includes('/fil'), page.url())

    const feedText = await page.locator('main').innerText()
    check('le fil se nomme', contains(feedText, 'Le fil'), feedText.slice(0, 80))
    check('les deux onglets sont là', contains(feedText, 'Découverte'), feedText.slice(0, 200))
    check('le composeur est monté', await page.locator('textarea[name="body"]').isVisible())
    check(
      'il dit qu’une publication ne peut pas être privée',
      contains(feedText, "publier, c'est s'adresser") || contains(feedText, 'ne peut pas être privée'),
      feedText.slice(0, 400),
    )

    /* --------------------------------------------------- 2. publier */
    console.log('\n2. Publier, et ce que la publication montre')
    await publish(page, PUBLIC_POST, 'public')
    check('la confirmation porte un rôle', await status(page, 'Publié'), await body(page))
    check('la publication apparaît dans le fil', await seen(page, PUBLIC_POST), await body(page))
    check(
      'elle porte son badge de portée, chez son auteur',
      contains(await page.locator('main').innerText(), 'Tout le monde'),
    )

    await publish(page, FOLLOWERS_POST, 'followers')
    check('la publication réservée apparaît aussi', await seen(page, FOLLOWERS_POST))

    await publish(page, QUESTION_POST, 'public', 'question')
    check('une question se publie', await seen(page, QUESTION_POST))

    /* La publication réservée doit être lisible À SON ADRESSE par son auteur.
       Elle ne l'était pas : la page passait par la portée `discover`, qui
       filtre `visibility = 'public'` — un filtre d'onglet, pas un droit. Le
       bouton « Supprimer » était donc inatteignable, et c'est le nettoyage de
       ce parcours qui l'a révélé, pas une de ses assertions. */
    const reservedHref = await page
      .locator('article', { hasText: FOLLOWERS_POST })
      .first()
      .getByRole('link', { name: /Ouvrir la publication/ })
      .getAttribute('href')
    await page.goto(`${BASE}${reservedHref}`)
    await settle(page)
    check(
      'une publication réservée s’ouvre à son adresse, chez son auteur',
      contains(await page.locator('main').innerText(), FOLLOWERS_POST),
      await body(page),
    )

    /* -------------------------------- 3. ce que voit quelqu'un qui ne suit pas */
    console.log('\n3. Une publication réservée ne se lit pas sans abonnement')
    await other.goto(`${BASE}/fil?onglet=decouverte`)
    await settle(other)
    const discover = await other.locator('main').innerText()
    check('la découverte montre la publication publique', contains(discover, PUBLIC_POST), discover.slice(0, 300))
    check('elle ne montre PAS la réservée', !contains(discover, FOLLOWERS_POST))

    await other.goto(`${BASE}/fil`)
    await settle(other)
    const followingBefore = await other.locator('main').innerText()
    check(
      'le fil des abonnements est vide, et le dit en invitation',
      contains(followingBefore, 'Votre fil est encore vide') || !contains(followingBefore, PUBLIC_POST),
      followingBefore.slice(0, 300),
    )

    /* ------------------------------------------------- 4. s'abonner */
    console.log("\n4. S'abonner, librement, et lire ce que cela ouvre")
    await other.goto(`${BASE}/membres/${HANDLES.un}`)
    await settle(other)
    check('le profil public répond', other.url().includes(HANDLES.un), other.url())
    const profileText = await other.locator('main').innerText()
    check('il porte le pseudo', contains(profileText, HANDLES.un), profileText.slice(0, 200))
    check('il propose de s’abonner', contains(profileText, "S'abonner"), profileText.slice(0, 300))

    await other.getByRole('button', { name: "S'abonner" }).first().click()
    check('la confirmation porte un rôle', await status(other, 'Abonné'), await body(other))

    await other.goto(`${BASE}/fil`)
    await settle(other)
    check(
      'la publication réservée entre au fil de l’abonné',
      await seen(other, FOLLOWERS_POST),
      await body(other),
    )

    /* ------------------------------------- 5. la dette 1 : entrée followers */
    console.log('\n5. LA DETTE 1 — une entrée « Mes abonnés » devient lisible')
    await page.goto(`${BASE}/cigares/undercrown-10-robusto`)
    await settle(page)
    await page.locator('textarea[name="body"]').first().fill(ENTRY_NOTE)
    await page.locator('input[name="visibility"][value="followers"]').first().check()

    const scopeCopy = await page.locator('main').innerText()
    check(
      'l’avertissement « personne ne lit » a disparu',
      !contains(scopeCopy, "L'abonnement n'existe pas encore"),
      scopeCopy.slice(0, 200),
    )
    check(
      'il est remplacé par « l’abonnement est libre »',
      contains(scopeCopy, "L'abonnement est libre"),
      scopeCopy.slice(0, 400),
    )

    await page.getByRole('button', { name: /Enregistrer l'entrée|Enregistrer/ }).first().click()
    await settle(page)
    check('l’entrée est enregistrée', await seen(page, ENTRY_NOTE), await body(page))

    /* On lit le `href` et on y va, plutôt que de cliquer puis de lire l'URL.
       Un clic sur un `<Link>` navigue côté client : `page.url()` juste après
       une attente fixe rend encore l'ancienne adresse, et l'assertion échoue
       sur un produit qui marche — vérifié en sondant la même page à la main. */
    await page.goto(`${BASE}/carnet`)
    await settle(page)
    const entryHref = await page
      .getByRole('link', { name: /Ouvrir l'entrée/ })
      .first()
      .getAttribute('href')
    entryUrl = entryHref ? `${BASE}${entryHref}` : ''
    check('l’entrée a sa page', /\/carnet\/[0-9a-f-]{36}/.test(entryUrl), entryUrl)

    await other.goto(entryUrl)
    await settle(other)
    check(
      'un ABONNÉ lit l’entrée « Mes abonnés » — la branche de policy existe',
      contains(await other.locator('main').innerText(), ENTRY_NOTE),
      await body(other),
    )

    /* ------------------------------- 6. publier une entrée au fil */
    console.log('\n6. Publier une entrée de carnet au fil')
    await page.goto(entryUrl)
    await settle(page)
    check('le panneau « Publier au fil » est là', await seen(page, 'Publier au fil'), await body(page))

    await page.getByRole('button', { name: 'Publier cette entrée au fil' }).click()
    check('la confirmation porte un rôle', await status(page, 'Entrée publiée au fil'), await body(page))

    await other.goto(`${BASE}/fil`)
    await settle(other)
    check(
      'l’abonné voit la publication qui pointe l’entrée',
      await seen(other, "Voir l'entrée de carnet"),
      await body(other),
    )

    /* --------------------- 7. la cascade de portée : refermer l'entrée */
    console.log('\n7. Refermer l’entrée retire sa publication du fil')
    await page.goto(entryUrl)
    await settle(page)
    await page.locator('input[name="visibility"][value="private"]').first().check()
    await page.getByRole('button', { name: /Enregistrer/ }).first().click()
    await settle(page)

    await other.goto(`${BASE}/fil`)
    await settle(other)
    check(
      'la publication a disparu du fil de l’abonné',
      await gone(other, "Voir l'entrée de carnet"),
      await body(other),
    )
    check(
      'et l’entrée elle-même n’est plus lisible',
      !contains(await other.locator('main').innerText(), ENTRY_NOTE),
    )

    /* ----------------------------------------- 8. braise et commentaire */
    console.log('\n8. La braise, et la conversation')
    await other.goto(`${BASE}/fil?onglet=decouverte`)
    await settle(other)
    const postHref = await other
      .locator('article', { hasText: PUBLIC_POST })
      .first()
      .getByRole('link', { name: /Ouvrir la publication/ })
      .getAttribute('href')
    publicPostUrl = postHref ? `${BASE}${postHref}` : ''
    check('une publication a sa page', /\/fil\/[0-9a-f-]{36}/.test(publicPostUrl), publicPostUrl)
    await other.goto(publicPostUrl)
    await settle(other)

    await other.getByRole('button', { name: 'Braise', exact: true }).first().click()
    await settle(other)
    check('la braise est comptée', await seen(other, '1 braise'), await body(other))
    check(
      'le bouton dit maintenant comment la retirer',
      contains(await other.locator('main').innerText(), 'Retirer ma braise'),
    )

    await other.locator('textarea[name="body"]').fill(REPLY)
    await other.getByRole('button', { name: 'Répondre' }).click()
    check('la réponse est confirmée', await status(other, 'Réponse publiée'), await body(other))
    check('la réponse apparaît', await seen(other, REPLY))

    /* ------------------------------------------- 9. les notifications */
    console.log('\n9. Les notifications naissent du geste')
    await page.goto(`${BASE}/notifications`)
    await settle(page)
    const notifs = await page.locator('main').innerText()
    check("l'abonnement a notifié", contains(notifs, "s'est abonné"), notifs.slice(0, 400))
    check('la braise a notifié', contains(notifs, 'a braisé'), notifs.slice(0, 400))
    check('le commentaire a notifié', contains(notifs, 'a commenté'), notifs.slice(0, 400))

    await page.getByRole('button', { name: 'Tout marquer comme lu' }).click()
    await settle(page)
    check(
      'la confirmation arrive sur la page d’arrivée, avec un rôle',
      await status(page, 'marquées comme lues'),
      await body(page),
    )

    /* ------------------------------------------ 10. la dette 2 : la cave */
    console.log('\n10. LA DETTE 2 — montrer sa cave, sans montrer son grand livre')
    await other.goto(`${BASE}/membres/${HANDLES.un}`)
    await settle(other)
    check(
      'par défaut, la cave est dite masquée',
      await seen(other, 'ne montre pas sa cave'),
      await body(other),
    )

    await page.goto(`${BASE}/parametres`)
    await settle(page)
    await page.locator('input[name="showHumidor"]').check()
    await page
      .locator('form', { has: page.locator('input[name="showHumidor"]') })
      .getByRole('button', { name: 'Enregistrer' })
      .click()
    check('le réglage est enregistré', await status(page, 'Enregistré'), await body(page))

    await other.goto(`${BASE}/membres/${HANDLES.un}`)
    await settle(other)
    const shown = await other.locator('main').innerText()
    check('la cave apparaît chez le tiers', !contains(shown, 'ne montre pas sa cave'), shown.slice(0, 400))
    check(
      'et la page dit que le prix ne traverse pas',
      contains(shown, 'Jamais ce qu’elle a coûté') || contains(shown, "Jamais ce qu'elle a coûté") ||
        contains(shown, 'Sa cave est vide'),
      shown.slice(0, 500),
    )

    /* ---------------------------------- 11. la dette 3 : les deux clés */
    console.log('\n11. LA DETTE 3 — show_reviews et show_country sont honorés')
    await page.goto(`${BASE}/parametres`)
    await settle(page)
    await page.locator('input[name="showReviews"]').uncheck()
    await page
      .locator('form', { has: page.locator('input[name="showReviews"]') })
      .getByRole('button', { name: 'Enregistrer' })
      .click()
    check('le réglage est enregistré', await status(page, 'Enregistré'), await body(page))

    await other.goto(`${BASE}/membres/${HANDLES.un}`)
    await settle(other)
    check(
      'le profil dit que les entrées ne sont pas montrées',
      await seen(other, 'ne montre pas ses entrées'),
      await body(other),
    )

    /* --------------------------------------------- 12. le keyset */
    console.log('\n12. LE CRITÈRE DE SORTIE — la pagination keyset, dans un navigateur')

    /* Vingt-et-une publications, parce que la page en rend vingt : c'est la plus
       petite quantité qui prouve qu'une seconde page existe. Les mesurer en SQL
       ne suffisait pas — le critère du §9 porte sur un fil, et un fil se
       parcourt. Elles sont effacées au nettoyage. */
    await page.goto(`${BASE}/fil`)
    await settle(page)
    for (let index = 0; index < 21; index += 1) {
      await publish(page, `${VOLUME_PREFIX} ${index}`, 'public', 'post', true)
    }
    await page.reload()
    await settle(page)

    /* On COMPTE ce qui a été écrit plutôt que de le supposer. La première
       version faisait confiance à la boucle et six publications manquaient : la
       page en montrait quinze, ce qui ressemble à une page pleine. Un plafond
       silencieux se lit comme une couverture complète. */
    const volumeWritten = await page
      .locator('article')
      .filter({ hasText: VOLUME_PREFIX })
      .count()
    check(
      'les vingt-et-une publications de volume sont écrites',
      volumeWritten >= 20,
      `${volumeWritten} sur la première page`,
    )

    await other.goto(`${BASE}/fil?onglet=decouverte`)
    await settle(other)
    const firstPage = await other.locator('main').innerText()
    check(
      'la première page en montre vingt et propose la suite',
      contains(firstPage, 'Publications plus anciennes'),
      firstPage.slice(0, 200),
    )
    check(
      'le fil dit comment il pagine, plutôt que de dérouler à l’infini',
      contains(firstPage, 'page par page'),
      firstPage.slice(0, 400),
    )

    const firstIds = await other
      .locator('article a[href^="/fil/"]')
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLAnchorElement).getAttribute('href')))
    check('la première page rend vingt publications', firstIds.length === 20, String(firstIds.length))

    const olderHref = await other
      .getByRole('link', { name: 'Publications plus anciennes' })
      .getAttribute('href')
    check('le curseur voyage dans l’URL', (olderHref ?? '').includes('avant='), olderHref ?? '')
    check(
      'et l’onglet le suit, donc la page suivante parle du même fil',
      (olderHref ?? '').includes('onglet=decouverte'),
      olderHref ?? '',
    )
    check(
      'le curseur est une date ET un identifiant, jamais un numéro de page',
      /avant=[^&]*~[0-9a-f]{8}-/.test(decodeURIComponent(olderHref ?? '')),
      decodeURIComponent(olderHref ?? ''),
    )

    await other.goto(`${BASE}${olderHref}`)
    await settle(other)
    const secondIds = await other
      .locator('article a[href^="/fil/"]')
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLAnchorElement).getAttribute('href')))
    check('la seconde page rend des publications', secondIds.length > 0, String(secondIds.length))
    check(
      'et AUCUNE des vingt déjà lues — un keyset ne répète pas',
      secondIds.every((href) => !firstIds.includes(href)),
      `${firstIds.length} + ${secondIds.length}`,
    )
    check(
      'la seconde page offre le retour au début',
      contains(await other.locator('main').innerText(), 'Revenir au début du fil'),
      await body(other),
    )

    /* ------------------------------------------------ 13. le blocage */
    console.log('\n13. Bloquer, et ce que le blocage referme')
    await other.goto(`${BASE}/membres/${HANDLES.un}`)
    await settle(other)
    await other.getByRole('button', { name: 'Bloquer', exact: true }).click()
    check('le blocage est confirmé', await status(other, 'Personne bloquée'), await body(other))

    /* Le bug que ce parcours a trouvé, et l'assertion qui empêche son retour :
       la policy cachait le profil dans les deux sens, donc le seul écran qui
       porte « Débloquer » disparaissait au moment du blocage. Un blocage était
       définitif, et rien ne le disait. Corrigé par la 0012. */
    await other.goto(`${BASE}/membres/${HANDLES.un}`)
    await settle(other)
    const blockedProfile = await other.locator('main').innerText()
    check(
      'le profil reste lisible de qui a posé le blocage',
      contains(blockedProfile, HANDLES.un),
      blockedProfile.slice(0, 200),
    )
    check(
      'et il porte « Débloquer », donc la décision se défait',
      contains(blockedProfile, 'Débloquer'),
      blockedProfile.slice(0, 300),
    )
    check(
      'le bandeau dit ce que le blocage a fait',
      contains(blockedProfile, 'Vous avez bloqué cette personne'),
      blockedProfile.slice(0, 300),
    )
    check(
      'mais le contenu, lui, a disparu de ce profil',
      !contains(blockedProfile, PUBLIC_POST),
      blockedProfile.slice(0, 400),
    )

    await other.goto(`${BASE}/parametres`)
    await settle(other)
    check(
      'et les paramètres listent la personne bloquée, sans avoir à retenir son pseudo',
      await seen(other, 'Personnes bloquées'),
      await body(other),
    )
    const settingsText = await other.locator('main').innerText()
    check(
      'la liste la nomme',
      contains(settingsText, HANDLES.un),
      settingsText.slice(-500),
    )

    await other.goto(`${BASE}/fil?onglet=decouverte`)
    await settle(other)
    check(
      'ses publications ont disparu du fil',
      await gone(other, PUBLIC_POST),
      await body(other),
    )

    await other.goto(publicPostUrl)
    await settle(other)
    check(
      'et sa publication par son adresse directe aussi',
      !contains(await other.locator('body').innerText(), PUBLIC_POST),
      (await other.locator('body').innerText()).slice(0, 200),
    )

    /* ------------------------------------------- 13bis. débloquer */
    console.log('\n13bis. Débloquer, depuis les paramètres')
    await other.goto(`${BASE}/parametres`)
    await settle(other)
    await other.getByRole('button', { name: 'Débloquer' }).first().click()
    check('le déblocage est confirmé', await status(other, 'Blocage levé'), await body(other))

    await other.goto(`${BASE}/fil?onglet=decouverte`)
    await settle(other)
    check(
      'et le contenu revient',
      /* Sur `VOLUME_PREFIX` et non sur `PUBLIC_POST` : la première page de la
         découverte est désormais remplie par les vingt-et-une publications de
         l'étape 12, plus récentes. Chercher la plus ancienne sur la première
         page aurait échoué pour une raison qui n'est pas le blocage — la
         première version de cette assertion l'a fait. */
      await seen(other, VOLUME_PREFIX),
      await body(other),
    )

    /* ------------------------------------ 14. le blocage a coupé l'abonnement */
    console.log('\n14. Le blocage avait supprimé l’abonnement, et le déblocage ne le rend pas')
    await page.goto(`${BASE}/membres/${HANDLES.un}`)
    await settle(page)
    check(
      'le profil ne compte plus l’abonné',
      contains(await page.locator('main').innerText(), '0 abonné') ||
        !contains(await page.locator('main').innerText(), '1 abonné'),
      await body(page),
    )
  } catch (error) {
    /* Une exception n'est PAS un succès, et sans ce bloc c'en était un : le
       `finally` sortait avec 0 échec parce que rien n'avait été *coché* en
       échec. Un parcours interrompu à l'étape 8 rendait donc « 29 assertions,
       0 échec », ce qui est le pire compte-rendu possible. */
    failures.push(`exception : ${error instanceof Error ? error.message.slice(0, 300) : String(error)}`)
    console.log(`\n  EXCEPTION ${error instanceof Error ? error.message.slice(0, 500) : String(error)}`)
  } finally {
    /* ------------------------------------------------------ nettoyage */
    console.log('\n15. Nettoyage — ce qui a été écrit vit dans la vraie base')

    // Débloquer d'abord : tant que le blocage tient, `test_deux` ne voit rien
    // de `test_un` et ne peut donc rien retirer de ce qu'il a écrit chez lui.
    for (const p of [page, other]) {
      await p.goto(`${BASE}/parametres`).catch(() => undefined)
      await settle(p)
      for (let sweep = 0; sweep < 5; sweep += 1) {
        const unblock = p.getByRole('button', { name: 'Débloquer' })
        if (!(await unblock.count())) break
        await unblock.first().click()
        await settle(p)
        await p.reload().catch(() => undefined)
        await settle(p)
      }
    }

    // La réponse, chez son auteur.
    if (publicPostUrl) {
      await other.goto(publicPostUrl).catch(() => undefined)
      await settle(other)
      const remove = other.getByRole('button', { name: 'Supprimer', exact: true })
      if (await remove.count()) {
        await remove.first().click()
        await settle(other)
      }
      const unember = other.getByRole('button', { name: 'Retirer ma braise' })
      if (await unember.count()) {
        await unember.first().click()
        await settle(other)
      }
    }

    // Se désabonner.
    await other.goto(`${BASE}/membres/${HANDLES.un}`).catch(() => undefined)
    await settle(other)
    const unfollow = other.getByRole('button', { name: 'Se désabonner' })
    if (await unfollow.count()) {
      await unfollow.first().click()
      await settle(other)
    }

    // Les publications, une par une, depuis leur page.
    /* Une boucle sur « de parcours » plutôt que sur les trois noms : une
       exécution interrompue laisse les siennes derrière elle, et la suivante
       doit les ramasser aussi. Trois y ont survécu avant que le bug de la 0013
       ne soit corrigé — visibles seulement en comptant les lignes en base, ce
       qu'un compte rendu de parcours vert ne dit pas. */
    for (let sweep = 0; sweep < 40; sweep += 1) {
      await page.goto(`${BASE}/fil`).catch(() => undefined)
      await settle(page)
      const card = page.locator('article', { hasText: 'de parcours ' })
      if (!(await card.count())) break
      const href = await card
        .first()
        .getByRole('link', { name: /Ouvrir la publication/ })
        .getAttribute('href')
        .catch(() => null)
      if (!href) break
      await page.goto(`${BASE}${href}`).catch(() => undefined)
      await settle(page)
      const del = page.getByRole('button', { name: 'Supprimer', exact: true })
      if (!(await del.count())) break
      await del.first().click()
      await page.waitForURL(/\/fil(\?|$)/, { timeout: 20000 }).catch(() => undefined)
      await settle(page)
    }

    /* Toutes les entrées de parcours, pas seulement celle dont on a gardé
       l'adresse : un parcours qui s'interrompt en laisse derrière lui, et le
       nettoyage suivant doit les ramasser aussi. Le filtre porte sur le texte
       qu'elles seules contiennent, jamais sur la date — deux exécutions dans la
       même minute se ressemblent. */
    for (let sweep = 0; sweep < 10; sweep += 1) {
      await page.goto(`${BASE}/carnet`).catch(() => undefined)
      await settle(page)
      const hrefs = await page
        .getByRole('link', { name: /Ouvrir l'entrée/ })
        .evaluateAll((nodes) => nodes.map((node) => (node as HTMLAnchorElement).getAttribute('href')))
        .catch(() => [] as (string | null)[])

      let removed = false
      for (const href of hrefs) {
        if (!href) continue
        await page.goto(`${BASE}${href}`).catch(() => undefined)
        await settle(page)
        const text = (await page.locator('main').innerText().catch(() => '')) ?? ''
        if (!contains(text, 'Entree de parcours')) continue
        const del = page.getByRole('button', { name: 'Supprimer' })
        if (await del.count()) {
          await del.first().click()
          await page.waitForURL(/\/carnet(\?|$)/, { timeout: 20000 }).catch(() => undefined)
          await settle(page)
          removed = true
          break
        }
      }
      if (!removed) break
    }

    // Les réglages, remis à leur défaut.
    await page.goto(`${BASE}/parametres`).catch(() => undefined)
    await settle(page)
    const humidorBox = page.locator('input[name="showHumidor"]')
    if (await humidorBox.count()) {
      await humidorBox.uncheck().catch(() => undefined)
      await page.locator('input[name="showReviews"]').check().catch(() => undefined)
      await page
        .locator('form', { has: page.locator('input[name="showHumidor"]') })
        .getByRole('button', { name: 'Enregistrer' })
        .click()
        .catch(() => undefined)
      await settle(page)
    }

    // Les notifications des deux comptes : elles sont nées de triggers, donc
    // elles survivraient à la suppression de ce qui les a causées si la clé
    // étrangère ne cascadait pas — et pour l'abonnement, il n'y en a pas.
    for (const p of [page, other]) {
      await p.goto(`${BASE}/notifications`).catch(() => undefined)
      await settle(p)
      const markAll = p.getByRole('button', { name: 'Tout marquer comme lu' })
      if (await markAll.count()) {
        await markAll.first().click()
        await settle(p)
      }
      const clear = p.getByRole('button', { name: /Effacer les notifications lues/ })
      if (await clear.count()) {
        await clear.first().click()
        await settle(p)
      }
    }

    console.log(`\n${passed} assertions passées, ${failures.length} échec(s).`)
    for (const failure of failures) console.log(`  - ${failure}`)

    await browser.close()
    process.exit(failures.length === 0 ? 0 : 1)
  }
}

void main()
