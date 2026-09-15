/**
 * Soft navigations, traced server-side: which reads a CLICK costs, and in
 * what order. Companion to roundtrips.ts, which measures hard loads only.
 *
 *   VITOLA_TRACE_FILE=/tmp/trace.jsonl NODE_OPTIONS="--import ./tooling/audit/trace-roundtrips.mjs" pnpm start --port 3100
 *   VITOLA_TRACE_FILE=/tmp/trace.jsonl pnpm tsx tooling/audit/soft-nav-trace.ts
 */
import { appendFileSync, readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { chromium, type Page } from '@playwright/test'

const BASE = process.env.PARCOURS_BASE ?? 'http://127.0.0.1:3100'
const TRACE = process.env.VITOLA_TRACE_FILE ?? '/tmp/roundtrips.jsonl'
const MEMBER = process.env.PARCOURS_USER_ONE ?? 'test1@cigardeur.com'
const PASSWORD = process.env.PARCOURS_PASSWORD ?? 'cigardeur'
const ALLOW_PREFETCH = process.env.ALLOW_PREFETCH === '1'

type Hit = {
  t: number
  ms: number
  method: string
  target: string
  status: number
  marker?: string
}
type Window = {
  label: string
  from: number
  to: number
  tUrl: number
  tContent?: number
  wall: number
  prefetches: number
}

function mark(name: string) {
  appendFileSync(TRACE, `${JSON.stringify({ marker: name, t: Date.now() })}\n`)
}

async function settle(page: Page) {
  await page.waitForLoadState('load')
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(400)
}

async function gate(page: Page) {
  await page.goto(`${BASE}/majorite`)
  await settle(page)
  await page.locator('input[name="birthDate"]').fill('1985-04-02')
  await page
    .getByRole('button', { name: /entrer|valider|confirmer/i })
    .first()
    .click()
  await settle(page)
}
async function signIn(page: Page) {
  await page.goto(`${BASE}/connexion`)
  await settle(page)
  await page.locator('input[name="email"]').fill(MEMBER)
  await page.locator('input[name="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: /se connecter|sign in/i }).click()
  await page
    .waitForURL((u) => !new URL(u).pathname.startsWith('/connexion'), { timeout: 30000 })
    .catch(() => {})
  await settle(page)
  console.log(`  signed in → ${page.url()}`)
}

const windows: Window[] = []
let prefetchCount = 0

async function soft(page: Page, to: string, label: string) {
  prefetchCount = 0
  const from = Date.now()
  mark(`start ${label}`)
  await page.locator(`header nav a[href="${to}"]`).first().click()
  await page.waitForURL((u) => new URL(u).pathname === to, { timeout: 60000 })
  const tUrl = Date.now() - from
  /* The loading boundary (ADR 0021) commits the URL before the page: the
     content is there once no `main` is busy any more. */
  await page
    .waitForFunction(() => !document.querySelector('main[aria-busy="true"]'), undefined, {
      timeout: 60000,
    })
    .catch(() => {})
  const tContent = Date.now() - from
  await settle(page)
  const to_ = Date.now()
  mark(`end ${label}`)
  windows.push({
    label,
    from,
    to: to_,
    tUrl,
    tContent,
    wall: to_ - from,
    prefetches: prefetchCount,
  })
}
async function hard(page: Page, path: string, label: string) {
  prefetchCount = 0
  const from = Date.now()
  mark(`start ${label}`)
  await page.goto(`${BASE}${path}`)
  const tUrl = Date.now() - from
  await settle(page)
  const to_ = Date.now()
  mark(`end ${label}`)
  windows.push({ label, from, to: to_, tUrl, wall: to_ - from, prefetches: prefetchCount })
}

async function main() {
  const exe = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium'
  const browser = await chromium.launch(existsSync(exe) ? { executablePath: exe } : {})
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    await page.route('**/*', (route) => {
      if (route.request().headers()['next-router-prefetch'] === '1') {
        prefetchCount += 1
        return ALLOW_PREFETCH ? route.continue() : route.abort()
      }
      return route.continue()
    })
    await gate(page)
    await signIn(page)
    await hard(page, '/cigares', 'HARD /cigares')
    const seq: [string, string][] = [
      ['/boutique', 'soft cigares→boutique'],
      ['/carnet', 'soft boutique→carnet'],
      ['/cave', 'soft carnet→cave'],
      ['/cigares', 'soft cave→cigares'],
      ['/lieux', 'soft cigares→lieux'],
      ['/boutique', 'soft lieux→boutique'],
      ['/suggestions', 'soft boutique→suggestions'],
      ['/cigares', 'soft suggestions→cigares'],
    ]
    for (const [to, label] of seq) await soft(page, to, label)
    await hard(page, '/boutique', 'HARD /boutique')
    await hard(page, '/carnet', 'HARD /carnet')
    await ctx.close()
  } finally {
    await browser.close()
  }

  const hits: Hit[] = readFileSync(TRACE, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Hit)
  console.log(
    `\n  ${'window'.padEnd(30)} url-change content   wall   prefetch  reads   critical-path   calls (offset +dur)`,
  )
  for (const w of windows) {
    const mine = hits
      .filter((h) => !h.marker && h.t >= w.from && h.t <= w.to)
      .sort((a, b) => a.t - b.t)
    const critical = mine.length ? Math.max(...mine.map((h) => h.t + h.ms)) - w.from : 0
    const detail = mine
      .map((h) => `+${h.t - w.from}${h.method === 'HEAD' ? 'H' : ''}:${h.target}(${h.ms})`)
      .join(' ')
    console.log(
      `  ${w.label.padEnd(30)} ${String(w.tUrl).padStart(6)}ms ${String(w.tContent ?? w.tUrl).padStart(6)}ms ${String(w.wall).padStart(6)}ms ${String(w.prefetches).padStart(8)} ${String(mine.length).padStart(6)} ${String(critical).padStart(11)}ms   ${detail}`,
    )
  }
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
