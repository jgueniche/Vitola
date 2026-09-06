/**
 * Le parcours de la relecture en série (/admin/fiches/relire), contre la
 * vraie base, avec deux rôles.
 *
 *   pnpm build && pnpm start --port 3100
 *   pnpm tsx tooling/parcours/relecture.ts
 *
 * Ce qu'il prouve : une proposition déposée AVEC sa source (0026) se relit
 * avec sa source cliquable, le compteur dit où l'on est, la touche A accepte,
 * la touche R mène au mot pour l'auteur et Ctrl + Entrée refuse — et chaque
 * décision est celle de /contributions, avec la même trace. Un membre lit
 * pourquoi la porte est fermée, jamais une page blanche.
 *
 * Comme contributions.ts, il écrit dans le référentiel et se nettoie PAR LE
 * PRODUIT : la valeur d'origine de `discontinued_year` est relue au début et
 * remise à la fin par une proposition acceptée depuis l'écran testé. Les
 * lignes décidées de `ref.cigar_revisions` restent — une décision est de
 * l'histoire. Le nettoyage vit dans un `finally` et l'épilogue dit ce qu'il a
 * trouvé, pas ce qu'il aurait dû trouver (leçon de marketplace.ts).
 */

import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test'

const BASE = process.env.PARCOURS_BASE ?? 'http://127.0.0.1:3100'
const PASSWORD = process.env.PARCOURS_PASSWORD ?? 'cigardeur'
const MEMBER = process.env.PARCOURS_USER_ONE ?? 'test1@cigardeur.com'
const EDITOR = process.env.PARCOURS_EDITOR ?? 'jgueniche06@gmail.com'
const SLUG = process.env.PARCOURS_SLUG ?? 'undercrown-10-toro'
const SOURCE = 'https://www.example.test/fabricant/fiche-officielle-parcours'
const REVIEW = `${BASE}/admin/fiches/relire`

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

/** `load` + attente fixe : `/admin/*` ne s'établit jamais en networkidle (admin.ts). */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('load')
  await page.waitForTimeout(1000)
}

async function text(page: Page): Promise<string> {
  return (
    (await page
      .locator('main')
      .innerText()
      .catch(() => '')) ?? ''
  )
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

/** Une décision NAVIGUE : on attend l'adresse d'arrivée, jamais un délai. */
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

/** Dépose une proposition sur `discontinued_year`, avec ou sans source. */
async function propose(
  page: Page,
  year: string,
  why: string,
  source = '',
): Promise<{ ok: boolean; message: string }> {
  await page.goto(`${BASE}/cigares/${SLUG}/proposer`)
  await settle(page)
  await page.locator('input[name="discontinued_year"]').fill(year)
  await page.locator('input[name="source"]').fill(source)
  await page.locator('textarea[name="comment"]').fill(why)
  await page.getByRole('button', { name: 'Proposer' }).click()
  return settled(page)
}

/**
 * Amène l'écran sur la fiche du parcours : la file peut contenir d'autres
 * propositions, donc on suit « Fiche suivante » jusqu'à lire le mot du
 * parcours — vingt fois au plus, ce qui est plus que la file ne devrait tenir.
 */
async function reachSheet(page: Page, marker: string, query = ''): Promise<boolean> {
  await page.goto(`${REVIEW}${query}`)
  await settle(page)
  for (let hops = 0; hops < 20; hops += 1) {
    if (contains(await text(page), marker)) return true
    const next = page.getByRole('link', { name: /fiche suivante/i })
    if ((await next.count()) === 0) return false
    await next.first().click()
    await settle(page)
  }
  return false
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
  let restored: boolean | null = null

  try {
    console.log('\n1. Le membre dépose une proposition avec sa source, et une sans')
    await signIn(member, MEMBER)
    await member.goto(`${BASE}/cigares/${SLUG}/proposer`)
    await settle(member)
    original = await member.locator('input[name="discontinued_year"]').inputValue()
    check(
      'le champ Source est offert',
      (await member.locator('input[name="source"]').count()) === 1,
    )

    const refused = await propose(
      member,
      '2030',
      'Parcours : source malformée.',
      'http:/pas-une-adresse',
    )
    check(
      'une source malformée est refusée par une phrase',
      !refused.ok && contains(refused.message, 'source'),
      refused.message,
    )

    const sourced = await propose(
      member,
      '2031',
      'Parcours : première proposition, avec source.',
      SOURCE,
    )
    check('la proposition sourcée est acceptée par le formulaire', sourced.ok, sourced.message)
    const bare = await propose(member, '2032', 'Parcours : seconde proposition, sans source.')
    check('la proposition sans source aussi', bare.ok, bare.message)

    await member.goto(`${BASE}/contributions`)
    await settle(member)
    const mine = await text(member)
    check(
      'la source se lit sous la proposition, en lien',
      contains(mine, 'Source') && contains(mine, SOURCE),
      mine.slice(0, 600),
    )

    console.log('\n2. Le membre lit pourquoi la relecture en série lui est fermée')
    await member.goto(REVIEW)
    await settle(member)
    check(
      'réservé aux relecteurs, dit et non caché',
      contains(await text(member), 'Réservé aux relecteurs'),
      (await text(member)).slice(0, 200),
    )

    console.log('\n3. Le relecteur ouvre la file « avec source »')
    await signIn(editor, EDITOR)
    const found = await reachSheet(editor, 'première proposition, avec source', '?source=avec')
    check('la fiche du parcours est atteinte sous le filtre', found, editor.url())
    let body = await text(editor)
    check('le compteur « n / N » est là', /\d+ \/ \d+/.test(body), body.slice(0, 300))
    check(
      'la source est cliquable',
      (await editor.locator(`main a[href="${SOURCE}"]`).count()) >= 1,
    )
    check(
      'la proposition sans source n’est pas sous ce filtre',
      !contains(body, 'sans source.'),
      body.slice(0, 800),
    )
    check(
      'les touches sont annoncées',
      contains(body, 'Au clavier') && contains(body, 'accepter la première proposition'),
    )
    check(
      'le bouton Accepter porte son raccourci',
      (await editor.locator('button[data-decide="approve"][aria-keyshortcuts="a"]').count()) === 1,
    )

    console.log('\n4. La touche A accepte la première proposition')
    await editor.keyboard.press('a')
    const approved = await decided(editor, 'approuvee')
    check(
      'la décision navigue et s’annonce',
      approved && contains(await text(editor), 'Appliquée'),
      `${editor.url()} · ${(await text(editor)).slice(0, 200)}`,
    )

    await editor.goto(`${BASE}/cigares/${SLUG}/proposer`)
    await settle(editor)
    check(
      'la fiche porte la valeur acceptée',
      (await editor.locator('input[name="discontinued_year"]').inputValue()) === '2031',
    )

    console.log('\n5. Sur la file complète, R mène au mot pour l’auteur, Ctrl + Entrée refuse')
    const foundBare = await reachSheet(editor, 'seconde proposition, sans source')
    check('la proposition sans source se relit sans le filtre', foundBare, editor.url())
    body = await text(editor)
    check('elle est dite sans source', contains(body, 'Sans source citée'), body.slice(0, 600))

    await editor.keyboard.press('r')
    await editor.waitForTimeout(300)
    const focused = await editor.evaluate(() => document.activeElement?.tagName ?? '')
    check('R place le curseur dans le mot pour l’auteur', focused === 'TEXTAREA', focused)
    await editor.keyboard.type('Parcours : refusée depuis la relecture en série, la fiche a bougé.')
    await editor.keyboard.press('Control+Enter')
    const rejected = await decided(editor, 'refusee')
    check(
      'le refus navigue et s’annonce',
      rejected && contains(await text(editor), 'Refusée'),
      `${editor.url()} · ${(await text(editor)).slice(0, 200)}`,
    )

    console.log('\n6. Le membre relit les deux décisions')
    await member.goto(`${BASE}/contributions`)
    await settle(member)
    body = await text(member)
    check('une acceptée', contains(body, 'Acceptée'), body.slice(0, 500))
    check(
      'une refusée, avec le mot',
      contains(body, 'Refusée') && contains(body, 'relecture en série'),
      body.slice(0, 900),
    )
  } finally {
    console.log('\nRemise en état du référentiel, par le produit')
    try {
      const restore = await propose(editor, original, 'Parcours : remise en état.', SOURCE)
      if (restore.ok) {
        const reached = await reachSheet(editor, 'remise en état', '?source=avec')
        if (reached) {
          await editor.keyboard.press('a')
          await decided(editor, 'approuvee')
        }
      }
      await editor.goto(`${BASE}/cigares/${SLUG}/proposer`)
      await settle(editor)
      const now = await editor.locator('input[name="discontinued_year"]').inputValue()
      restored = now === original
      check(
        'la fiche est rendue telle qu’elle était',
        restored,
        `lu « ${now} », attendu « ${original} »`,
      )
    } catch (cause) {
      restored = false
      console.log(`  remise en état incomplète : ${String(cause)}`)
    }
    await browser.close()
  }

  console.log(`\n${passed} assertions passées, ${failures.length} échec(s)`)
  for (const failure of failures) console.log(`  - ${failure}`)
  console.log(
    restored
      ? '\nNettoyage : la fiche est revenue à sa valeur d’origine ; les décisions restent dans ref.cigar_revisions (une décision est de l’histoire).'
      : '\nNettoyage : la fiche N’EST PAS revenue à sa valeur d’origine — à corriger à la main depuis /cigares/' +
          SLUG +
          '/proposer.',
  )
  process.exit(failures.length === 0 ? 0 : 1)
}

void main()
