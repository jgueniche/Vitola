import { expect, test } from '@playwright/test'

/**
 * The age gate is a legal requirement (§2), so the tests are adversarial:
 * they try to get past it, not merely to walk through it.
 */

test('a gated route redirects an unverified visitor to the gate', async ({ page }) => {
  await page.goto('/cigares')
  await expect(page).toHaveURL(/\/majorite/)
})

test('the gate remembers where the visitor was going', async ({ page }) => {
  await page.goto('/primitives')
  await expect(page).toHaveURL(/suite=%2Fprimitives/)
})

test('a forged cookie does not get past the gate', async ({ page, context }) => {
  // What an attacker types into the console in two seconds.
  await context.addCookies([
    { name: 'vitola_adult', value: 'true', domain: '127.0.0.1', path: '/' },
  ])
  await page.goto('/primitives')
  await expect(page).toHaveURL(/\/majorite/)
})

test('a cookie with a valid shape but a bogus signature is rejected', async ({
  page,
  context,
}) => {
  const body = Buffer.from(JSON.stringify({ v: 1, exp: 9_999_999_999 }))
    .toString('base64url')
  await context.addCookies([
    { name: 'vitola_adult', value: `${body}.AAAAAAAAAAAAAAAAAAAAAAAA`, domain: '127.0.0.1', path: '/' },
  ])
  await page.goto('/primitives')
  await expect(page).toHaveURL(/\/majorite/)
})

test('a minor is refused, and stays refused', async ({ page }) => {
  await page.goto('/majorite')
  const twelveYearsAgo = new Date()
  twelveYearsAgo.setFullYear(twelveYearsAgo.getFullYear() - 12)
  await page.getByLabel('Date de naissance').fill(twelveYearsAgo.toISOString().slice(0, 10))
  await page.getByRole('button', { name: 'Confirmer' }).click()

  // Targeted by id: Next's route announcer is also role="alert".
  await expect(page.locator('#age-gate-error')).toContainText('majeures')
  await page.goto('/primitives')
  await expect(page).toHaveURL(/\/majorite/)
})

test('an adult passes, and lands where they were going', async ({ page }) => {
  await page.goto('/primitives')
  await expect(page).toHaveURL(/\/majorite/)

  await page.getByLabel('Date de naissance').fill('1985-04-02')
  await page.getByRole('button', { name: 'Confirmer' }).click()

  await expect(page).toHaveURL(/\/primitives/)
  await expect(page.getByRole('heading', { name: 'Primitives' })).toBeVisible()
})
