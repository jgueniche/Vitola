import { expect, test } from '@playwright/test'

/**
 * Regression: the gate asked for a date of birth again on every pass through
 * the landing page.
 *
 * Reported from QA as "it keeps asking". The cookie was never the problem — it
 * is signed for 180 days and was still valid. The landing page's "Entrer"
 * button simply pointed at /majorite unconditionally, so anyone who went back
 * to the home page was sent to the gate whether or not they had cleared it.
 *
 * The journey below is the reported one, exactly: clear the gate, hit a missing
 * page, use its "Revenir à l'accueil" link, and go back in.
 */
test('a visitor who has cleared the gate is never asked again', async ({ page }) => {
  await page.goto('/majorite')
  await page.getByLabel(/date de naissance/i).fill('1985-04-02')
  await page.getByRole('button', { name: /confirmer/i }).click()
  await expect(page).toHaveURL(/\/cigares/)

  // A missing page, and its way back to the landing page.
  await page.goto('/cigares/cette-fiche-nexiste-pas')
  await page.getByRole('link', { name: /revenir à l'accueil/i }).click()
  await expect(page).toHaveURL(/\/$/)

  // Back in through the front door. This must NOT return to the gate.
  await page.getByRole('link', { name: /entrer/i }).click()
  await expect(page).not.toHaveURL(/\/majorite/)
  await expect(page).toHaveURL(/\/cigares/)
})

test('going to the gate directly, already cleared, does not ask again', async ({ page }) => {
  await page.goto('/majorite')
  await page.getByLabel(/date de naissance/i).fill('1979-11-20')
  await page.getByRole('button', { name: /confirmer/i }).click()
  await expect(page).toHaveURL(/\/cigares/)

  // A bookmark, a stale link, the back button — all land here.
  await page.goto('/majorite')
  await expect(page).toHaveURL(/\/cigares/)
})

test('the gate still stops a visitor who has not cleared it', async ({ page }) => {
  // The fix must not open the door: no cookie, still gated.
  await page.goto('/marques')
  await expect(page).toHaveURL(/\/majorite/)
})
