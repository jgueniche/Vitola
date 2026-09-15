import { chromium, type Page, type Request, type Response } from '@playwright/test'
import { existsSync } from 'node:fs'

const BASE = process.env.BASE ?? 'https://vitola-teal.vercel.app'
const MEMBER = process.env.PARCOURS_USER_ONE ?? 'test1@cigardeur.com'
const PASSWORD = process.env.PARCOURS_PASSWORD ?? 'cigardeur'

function kind(req: Request): string {
  const h = req.headers()
  const url = req.url()
  if (h['next-router-prefetch'] === '1') return 'prefetch'
  if (h['rsc'] === '1') return 'rsc'
  if (url.includes('supabase.co/storage')) return 'storage-image'
  if (url.includes('supabase.co')) return 'supabase-direct'
  if (url.includes('/_next/static/')) return 'static'
  if (/\.(png|jpe?g|webp|avif|svg|ico)(\?|$)/.test(url)) return 'image'
  return 'other'
}

async function settle(page: Page) {
  await page.waitForLoadState('load')
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
}

/**
 * A preview deployment sits behind Vercel Authentication. `PARCOURS_ACCESS_URL`
 * is the temporary share link (`?_vercel_share=…`) that sets the bypass
 * cookie on first visit; it is opened once per browser context, before
 * anything is measured, and never appears in the numbers.
 */
async function unlock(page: Page) {
  const access = process.env.PARCOURS_ACCESS_URL
  if (!access) return
  await page.goto(access)
  await settle(page)
}

async function passGate(page: Page) {
  await unlock(page)
  const r = await page.goto(`${BASE}/majorite`)
  console.log(
    `  gate GET status=${r?.status()} ttfb=${Math.round(r?.request().timing().responseStart ?? -1)}ms`,
  )
  await settle(page)
  await page.locator('input[name="birthDate"]').fill('1985-04-02')
  await page
    .getByRole('button', { name: /entrer|valider|confirmer/i })
    .first()
    .click()
  await page.waitForURL((u) => new URL(u).pathname !== '/majorite', { timeout: 60000 })
  await settle(page)
  console.log(`  after gate: ${page.url()}`)
}

async function signIn(page: Page) {
  await page.goto(`${BASE}/connexion`)
  await settle(page)
  await page.locator('input[name="email"]').fill(MEMBER)
  await page.locator('input[name="password"]').fill(PASSWORD)
  const t0 = Date.now()
  await page.getByRole('button', { name: /se connecter|sign in/i }).click()
  await page
    .waitForURL((u) => !new URL(u).pathname.startsWith('/connexion'), { timeout: 30000 })
    .catch(() => {})
  await settle(page)
  console.log(`  sign-in took ${Date.now() - t0}ms → ${page.url()}`)
}

type Counter = Record<string, number>

async function softNav(page: Page, to: string, label: string) {
  const counts: Counter = {}
  const rsc: string[] = []
  const onReq = (req: Request) => {
    const k = kind(req)
    counts[k] = (counts[k] ?? 0) + 1
  }
  const onResp = async (resp: Response) => {
    const req = resp.request()
    if (kind(req) === 'rsc') {
      const t = req.timing()
      rsc.push(
        `${resp.status()} ttfb=${Math.round(t.responseStart)}ms end=${Math.round(t.responseEnd)}ms id=${resp.headers()['x-vercel-id'] ?? '-'} cache=${resp.headers()['x-vercel-cache'] ?? '-'} ${new URL(req.url()).pathname}`,
      )
    }
  }
  page.on('request', onReq)
  page.on('response', onResp)
  const prevH1 =
    (await page
      .locator('main h1')
      .first()
      .textContent()
      .catch(() => '')) ?? ''
  const link = page.locator(`header nav a[href="${to}"]`).first()
  if ((await link.count()) === 0)
    console.log(
      `  (no header link to ${to} on ${page.url()} — header nav links: ${await page.locator('header nav a').count()})`,
    )
  const t0 = Date.now()
  await link.click()
  await page.waitForURL((u) => new URL(u).pathname === to, { timeout: 60000 })
  const tUrl = Date.now() - t0
  await page
    .waitForFunction(
      (prev) => {
        const h = document.querySelector('main h1')
        return !!h && h.textContent !== prev
      },
      prevH1,
      { timeout: 60000 },
    )
    .catch(() => {})
  const tContent = Date.now() - t0
  await settle(page)
  const tIdle = Date.now() - t0
  page.off('request', onReq)
  page.off('response', onResp)
  console.log(
    `  ${label.padEnd(26)} url=${String(tUrl).padStart(5)}ms  content=${String(tContent).padStart(5)}ms  idle=${String(tIdle).padStart(5)}ms  reqs=${JSON.stringify(counts)}`,
  )
  for (const line of rsc) console.log(`      rsc ${line}`)
}

async function hardLoad(page: Page, path: string) {
  const counts: Counter = {}
  const onReq = (req: Request) => {
    const k = kind(req)
    counts[k] = (counts[k] ?? 0) + 1
  }
  page.on('request', onReq)
  const t0 = Date.now()
  const r = await page.goto(`${BASE}${path}`)
  const ttfb = Math.round(r?.request().timing().responseStart ?? -1)
  await page.waitForLoadState('load')
  const tLoad = Date.now() - t0
  await settle(page)
  const tIdle = Date.now() - t0
  page.off('request', onReq)
  console.log(
    `  hard ${path.padEnd(20)} status=${r?.status()} ttfb=${String(ttfb).padStart(5)}ms load=${String(tLoad).padStart(5)}ms idle=${String(tIdle).padStart(5)}ms id=${r?.headers()['x-vercel-id']} reqs=${JSON.stringify(counts)}`,
  )
}

async function prefetchStorm(page: Page, path: string) {
  let prefetch = 0
  const onReq = (req: Request) => {
    if (kind(req) === 'prefetch') prefetch += 1
  }
  page.on('request', onReq)
  await page.goto(`${BASE}${path}`)
  await settle(page)
  await page.mouse.wheel(0, 4000)
  await page.waitForTimeout(2500)
  await page.mouse.wheel(0, 4000)
  await page.waitForTimeout(2500)
  page.off('request', onReq)
  const links = await page.locator('a[href^="/"]').count()
  console.log(`  ${path.padEnd(20)} links=${links} prefetch requests after load+scroll=${prefetch}`)
}

async function main() {
  const exe = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium'
  const insecure = process.env.PARCOURS_INSECURE === '1'
  const browser = await chromium.launch({
    ...(existsSync(exe) ? { executablePath: exe } : {}),
    ...(insecure ? { args: ['--ignore-certificate-errors'] } : {}),
  })
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    console.log('\n== Member session ==')
    await passGate(page)
    await signIn(page)
    await hardLoad(page, '/cigares')
    const seq = [
      '/boutique',
      '/carnet',
      '/cave',
      '/cigares',
      '/lieux',
      '/boutique',
      '/suggestions',
      '/cigares',
      '/boutique',
      '/carnet',
    ]
    let from = '/cigares'
    for (const to of seq) {
      await softNav(page, to, `${from} → ${to}`)
      from = to
    }
    console.log('\n== Hard loads (member) ==')
    for (const p of ['/boutique', '/cigares', '/carnet', '/cave']) await hardLoad(page, p)
    console.log('\n== Prefetch storm (member) ==')
    for (const p of ['/cigares', '/lieux', '/boutique']) await prefetchStorm(page, p)
    await ctx.close()

    console.log('\n== Visitor (gate only) ==')
    const vctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const vpage = await vctx.newPage()
    await passGate(vpage)
    await hardLoad(vpage, '/boutique')
    let vfrom = '/boutique'
    for (const to of ['/cigares', '/lieux', '/boutique', '/cigares']) {
      await softNav(vpage, to, `${vfrom} → ${to}`)
      vfrom = to
    }
    await vctx.close()
  } finally {
    await browser.close()
  }
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
