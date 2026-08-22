import { expect, test, type Page } from '@playwright/test'

/**
 * Regression: the gate asked for a date of birth again on every pass through
 * the landing page.
 *
 * Reported from QA as "it keeps asking". The cookie was never the problem — it
 * is signed for 180 days and was still valid. The landing page's "Entrer"
 * button pointed at /majorite unconditionally, so anyone returning to the home
 * page was sent to the gate whether or not they had cleared it.
 *
 * ---------------------------------------------------------------------------
 * These tests deliberately avoid every page that reads the referential.
 *
 * CI builds with a placeholder Supabase URL, so /cigares, /marques and
 * /vitoles throw there. That matters more than it looks: when a Server Action
 * redirects to a page whose RSC fetch fails, the client navigation aborts and
 * the URL stays where it was — which looks exactly like "the gate did not let
 * me through". The first version of this file failed in CI for that reason and
 * not because the fix was wrong.
 *
 * /primitives is gated, static, and touches no database. It is the right
 * landing pad for anything testing the gate itself.
 * ---------------------------------------------------------------------------
 */

const ADULT = '1985-04-02'

async function clearTheGate(page: Page) {
  await page.goto('/primitives')
  await expect(page).toHaveURL(/\/majorite/)
  await page.getByLabel('Date de naissance').fill(ADULT)
  await page.getByRole('button', { name: 'Confirmer' }).click()
  await expect(page).toHaveURL(/\/primitives/)
}

test('the landing page does not send a cleared visitor back to the gate', async ({ page }) => {
  await clearTheGate(page)

  // The reported journey: a missing page, its way home, and back in.
  await page.goto('/cette-page-nexiste-pas')
  await page.getByRole('link', { name: /revenir à l'accueil/i }).click()
  await expect(page).toHaveURL(/\/$/)

  /*
   * The landing repeats its one call to action — header, hero, foot — the way
   * a long page is supposed to. Every one of them is the same link, so the
   * first is the one this journey meets; asserting the count keeps the
   * repetition deliberate rather than accidental.
   */
  const enter = page.getByRole('link', { name: 'Entrer' })
  expect(await enter.count()).toBeGreaterThan(1)
  await enter.first().click()

  // The claim, stated the way a visitor would: no second date of birth.
  await expect(page).not.toHaveURL(/\/majorite/)
  await expect(page.getByLabel('Date de naissance')).toHaveCount(0)
})

test('reaching the gate directly, already cleared, passes straight through', async ({ page }) => {
  await clearTheGate(page)

  // A bookmark, the back button, an old link. A full navigation follows the
  // redirect regardless of what the destination then renders.
  await page.goto('/majorite')
  await expect(page).toHaveURL(/\/cigares/)
})

test('passing through the gate honours where the visitor was going', async ({ page }) => {
  await clearTheGate(page)

  await page.goto('/majorite?suite=%2Fprimitives')
  await expect(page).toHaveURL(/\/primitives/)
  await expect(page.getByRole('heading', { name: 'Primitives' })).toBeVisible()
})

test('the redirect is not an open door to another origin', async ({ page }) => {
  await clearTheGate(page)

  // `suite` is attacker controlled. It must never leave the origin.
  await page.goto('/majorite?suite=%2F%2Fevil.example.com%2Fx')
  await expect(page).toHaveURL(/127\.0\.0\.1|localhost/)
  await expect(page).not.toHaveURL(/evil\.example\.com/)
})

test('the gate still stops a visitor who has not cleared it', async ({ page }) => {
  await page.goto('/primitives')
  await expect(page).toHaveURL(/\/majorite/)
  await expect(page.getByLabel('Date de naissance')).toBeVisible()
})
