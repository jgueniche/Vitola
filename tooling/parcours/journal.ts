/**
 * Le parcours du journal (P6, ADR 0012), en navigateur, contre la vraie base.
 *
 *   pnpm build && pnpm start --port 3100
 *   pnpm tsx tooling/parcours/journal.ts
 *
 * Trois contextes : un visiteur ANONYME sans cookie de portail (c'est lui qui
 * prouve la frontière), `test_un` (membre — le journal ne s'écrit pas depuis la
 * salle), `jeremy` (editor — il écrit, publie, lie, dépublie, supprime).
 *
 * Les deux assertions qui comptent le plus :
 *
 *   1. **L'injection est inerte.** Un article contenant `<script>` s'affiche
 *      avec la balise en toutes lettres — le sous-ensemble Markdown de l'ADR
 *      0012 ne connaît pas le HTML, donc il ne peut pas l'exécuter.
 *   2. **La frontière se traverse dans les deux sens.** Un article `gated` lu
 *      sans cookie renvoie au portail, et le portail RAMÈNE à l'article —
 *      l'exception que `safeSuite` a apprise pour le seul préfixe public qui
 *      en ait besoin.
 *
 * Il écrit deux articles de test et les supprime en partant. Les deux
 * brouillons d'amorçage (`vitole-cepo-module…`, `la-cape…`) sont des
 * LIVRABLES, pas des restes : ils appartiennent au porteur, qui les publiera
 * ou non. Le nettoyage les laisse.
 */

import { chromium, type Browser, type Page } from '@playwright/test'

const BASE = process.env.PARCOURS_BASE ?? 'http://127.0.0.1:3100'
const PASSWORD = process.env.PARCOURS_PASSWORD ?? 'cigardeur'
const ACCOUNTS = {
  un: process.env.PARCOURS_USER_ONE ?? 'test1@cigardeur.com',
  editor: process.env.PARCOURS_EDITOR ?? 'jgueniche06@gmail.com',
}

const STAMP = Date.now()
const PUBLIC_TITLE = `Article public de parcours ${STAMP}`
const GATED_TITLE = `Article reserve de parcours ${STAMP}`
const PUBLIC_BODY = [
  '## Un titre de section',
  '',
  'Un paragraphe avec du **gras** et un [lien](https://exemple.fr/source).',
  '',
  '- premier point',
  '- second point',
  '',
  '<script>alert(1)</script>',
].join('\n')

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
  let publicSlug = ''
  let gatedSlug = ''
  let publicEditUrl = ''
  let gatedEditUrl = ''

  try {
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
    })
    const anon = await (await browser.newContext()).newPage()
    const un = await (await browser.newContext()).newPage()
    const editor = await (await browser.newContext()).newPage()
    for (const page of [un, editor]) page.on('dialog', (d) => void d.accept())

    await signIn(un, ACCOUNTS.un)
    await signIn(editor, ACCOUNTS.editor)

    /* ---------------- 1 · Le journal vide, devant le portail ---------------- */
    console.log('\n— Le journal, sans portail')
    await anon.goto(`${BASE}/journal`)
    await settle(anon)
    check('le journal se lit sans passer le portail', await seen(anon, 'Le journal'))
    check('vide, il invite', await seen(anon, 'encore vide'))
    check('le flux RSS est annoncé', await seen(anon, 'Flux RSS'))

    const rss = await anon.goto(`${BASE}/journal/flux.xml`)
    const rssBody = (await rss?.text().catch(() => '')) ?? ''
    check('le flux répond en RSS', rss?.status() === 200 && rssBody.includes('<rss'))

    /* ---------------- 2 · Qui écrit ----------------------------------------- */
    console.log('\n— Qui écrit')
    await un.goto(`${BASE}/journal/ecrire`)
    await settle(un)
    check('un membre lit pourquoi la porte n est pas pour lui', await seen(un, 'réservé aux relecteurs') || await seen(un, 'relecteurs', 3000))

    await editor.goto(`${BASE}/journal/ecrire`)
    await settle(editor)
    check(
      'l editor retrouve les deux brouillons d amorçage',
      (await seen(editor, 'Vitole, cepo, module')) && (await seen(editor, 'La cape')),
    )

    /* ---------------- 3 · Écrire, publier, et l injection inerte ------------ */
    console.log('\n— Un article public, injection comprise')
    await editor.locator('#article-title').fill(PUBLIC_TITLE)
    await editor.locator('#article-category').selectOption('actualite')
    await editor.locator('#article-audience').selectOption('public')
    await editor.locator('#article-excerpt').fill('Un chapo de parcours.')
    await editor.locator('#article-body').fill(PUBLIC_BODY)
    await editor.getByRole('button', { name: 'Enregistrer le brouillon' }).click()
    await editor.waitForURL(/fait=enregistre/, { timeout: 15000 }).catch(() => undefined)
    await settle(editor)
    check('le brouillon s enregistre et navigue', await seen(editor, 'Brouillon enregistré'))

    await editor.getByRole('button', { name: 'Publier', exact: true }).click()
    await editor.waitForURL(/fait=publie/, { timeout: 15000 }).catch(() => undefined)
    await settle(editor)
    check('publier confirme', await seen(editor, 'Article publié'))
    publicEditUrl = editor.url().split('&fait')[0] ?? ''

    await anon.goto(`${BASE}/journal`)
    await settle(anon)
    check('l article public se lit du visiteur sans portail', await seen(anon, PUBLIC_TITLE))
    const articleLink = anon.getByRole('link', { name: PUBLIC_TITLE }).first()
    const href = (await articleLink.getAttribute('href').catch(() => null)) ?? ''
    publicSlug = href.split('/').pop() ?? ''
    await anon.goto(`${BASE}${href}`)
    await settle(anon)
    check('le corps rend les titres et le gras', await seen(anon, 'Un titre de section'))
    const anonText = await anon.locator('main').innerText()
    check(
      'l injection est INERTE : la balise s affiche en toutes lettres',
      anonText.includes('<script>alert(1)</script>'),
      anonText.slice(0, 200),
    )
    check('le temps de lecture est calculé', await seen(anon, 'min de lecture'))

    const sitemap = await anon.goto(`${BASE}/sitemap.xml`)
    const sitemapBody = (await sitemap?.text().catch(() => '')) ?? ''
    check('le sitemap liste l article public', sitemapBody.includes(`/journal/${publicSlug}`))
    const rss2 = await anon.goto(`${BASE}/journal/flux.xml`)
    const rss2Body = (await rss2?.text().catch(() => '')) ?? ''
    check('le flux RSS le porte aussi', rss2Body.includes(PUBLIC_TITLE))

    /* ---------------- 4 · L article gated, et la frontière ------------------ */
    console.log('\n— La frontière, dans les deux sens')
    await editor.goto(`${BASE}/journal/ecrire`)
    await settle(editor)
    await editor.locator('#article-title').fill(GATED_TITLE)
    await editor.locator('#article-category').selectOption('guide')
    await editor.locator('#article-audience').selectOption('gated')
    await editor.locator('#article-body').fill('Un guide qui parle de fiches précises.')
    await editor.getByRole('button', { name: 'Enregistrer le brouillon' }).click()
    await editor.waitForURL(/fait=enregistre/, { timeout: 15000 }).catch(() => undefined)
    await settle(editor)

    /* Lier une fiche pendant qu il est gated : permis. */
    await editor.locator('#link-slug').fill('undercrown-10-robusto')
    await editor.getByRole('button', { name: 'Lier', exact: true }).click()
    await editor.waitForURL(/fait=liee/, { timeout: 15000 }).catch(() => undefined)
    await settle(editor)
    check('une fiche se lie à un article gated', await seen(editor, 'Undercrown'))

    /* Le passer public avec un lien : refusé, avec la phrase. */
    await editor.locator('#article-audience').selectOption('public')
    await editor.getByRole('button', { name: 'Enregistrer le brouillon' }).click()
    await settle(editor)
    check(
      'public + fiche liée : refusé en toutes lettres (ADR 0012, D4)',
      await seen(editor, 'Retirez d’abord les fiches liées', 8000) ||
        await seen(editor, 'Retirez d\'abord', 2000),
      await body(editor),
    )

    await editor.getByRole('button', { name: 'Publier', exact: true }).click()
    await editor.waitForURL(/fait=publie/, { timeout: 15000 }).catch(() => undefined)
    await settle(editor)
    gatedEditUrl = editor.url().split('&fait')[0] ?? ''

    /* Publié, l article porte un lien vers sa page dans le panneau d état. */
    const gatedLink = editor.getByRole('link', { name: GATED_TITLE }).first()
    const gatedHref = (await gatedLink.getAttribute('href').catch(() => null)) ?? ''
    gatedSlug = gatedHref.split('/').pop() ?? ''

    /* L anonyme sans cookie est renvoyé au portail… */
    await anon.goto(`${BASE}/journal/${gatedSlug}`)
    await settle(anon)
    check(
      'un article gated sans cookie renvoie au portail',
      anon.url().includes('/majorite'),
      anon.url(),
    )

    /* …et le portail RAMÈNE à l article. */
    await anon.locator('input[name="birthDate"]').fill('1985-04-02')
    await anon
      .getByRole('button', { name: /entrer|valider|confirmer/i })
      .first()
      .click()
    await anon.waitForURL(new RegExp(`/journal/${gatedSlug}`), { timeout: 15000 }).catch(() => undefined)
    await settle(anon)
    check(
      'le portail ramène à l article (safeSuite, préfixe journal)',
      anon.url().includes(`/journal/${gatedSlug}`),
      anon.url(),
    )
    check('l article gated se lit une fois le portail passé', await seen(anon, GATED_TITLE))
    check('la fiche liée est en lien sous l article', await seen(anon, 'Undercrown'))

    /* Le flux et le sitemap ne le portent JAMAIS. */
    const rss3 = await anon.goto(`${BASE}/journal/flux.xml`)
    const rss3Body = (await rss3?.text().catch(() => '')) ?? ''
    check('le flux RSS ignore l article gated', !rss3Body.includes(GATED_TITLE))
    const sitemap2 = await anon.goto(`${BASE}/sitemap.xml`)
    const sitemap2Body = (await sitemap2?.text().catch(() => '')) ?? ''
    check('le sitemap aussi', !sitemap2Body.includes(gatedSlug))

    /* ---------------- 5 · Dépublier ----------------------------------------- */
    console.log('\n— Dépublier')
    await editor.goto(gatedEditUrl)
    await settle(editor)
    await editor.getByRole('button', { name: 'Dépublier' }).click()
    await editor.waitForURL(/fait=depublie/, { timeout: 15000 }).catch(() => undefined)
    await settle(editor)
    check('dépublier confirme', await seen(editor, 'Article dépublié'))

    const probe = await anon.goto(`${BASE}/journal/${gatedSlug}`).catch(() => null)
    check('dépublié, l article répond 404 — jamais « accès refusé »', probe?.status() === 404)
  } catch (error) {
    failures.push(`exception: ${String(error)}`)
    console.log(`  FAIL exception: ${String(error)}`)
  } finally {
    if (browser) {
      const pages = browser.contexts().flatMap((ctx) => ctx.pages())
      const editor = pages[2]

      console.log('\n— Nettoyage')
      /* Les deux articles de parcours, par leur auteur, chacun depuis son URL
         d édition (capturée à la publication) : Supprimer, confirmé par le
         dialogue persistant. Les deux brouillons d amorçage restent — ce sont
         des livrables du porteur, pas des restes. */
      if (editor) {
        for (const editUrl of [publicEditUrl, gatedEditUrl]) {
          if (!editUrl) continue
          await editor.goto(editUrl).catch(() => undefined)
          await settle(editor)
          const del = editor.getByRole('button', { name: "Supprimer l'article" })
          if (await del.count()) {
            await del
              .first()
              .click()
              .catch(() => undefined)
            await editor.waitForURL(/fait=supprime/, { timeout: 15000 }).catch(() => undefined)
          }
        }
      }
      void publicSlug

      console.log(`\n${passed} assertions passées, ${failures.length} échec(s).`)
      for (const failure of failures) console.log(`  - ${failure}`)

      await browser.close()
      process.exit(failures.length === 0 ? 0 : 1)
    }
  }
}

void main()
