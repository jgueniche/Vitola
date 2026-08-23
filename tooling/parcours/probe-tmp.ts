import { chromium } from '@playwright/test'
const BASE = 'http://127.0.0.1:3100'
async function main() {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  const page = await (await b.newContext()).newPage()
  page.on('dialog', (d) => void d.accept())
  await page.goto(`${BASE}/majorite`); await page.waitForTimeout(1500)
  await page.locator('input[name="birthDate"]').fill('1985-04-02')
  await page.getByRole('button', { name: /entrer|valider|confirmer/i }).first().click()
  await page.waitForTimeout(1500)
  await page.goto(`${BASE}/connexion`); await page.waitForTimeout(1500)
  await page.locator('input[name="email"]').fill('test1@cigardeur.com')
  await page.locator('input[name="password"]').fill('cigardeur')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.waitForTimeout(2000)
  for (const url of [`${BASE}/fil`, `${BASE}/fil?onglet=decouverte`]) {
    await page.goto(url); await page.waitForTimeout(1500)
    const arts = await page.locator('article').allInnerTexts()
    console.log(`\n${url} → ${arts.length} article(s)`)
    for (const a of arts) console.log('   -', a.replace(/\n/g, ' | ').slice(0, 110))
  }
  await b.close()
}
void main()
