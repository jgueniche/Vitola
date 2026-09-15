import { expect, test } from '@playwright/test'

/**
 * The sign-in page, before the age gate.
 *
 * Like the other gate tests, these avoid every page that reads the referential:
 * CI builds with a placeholder Supabase URL, so /cigares throws there. The
 * sign-in page itself is safe — it asks the auth server who the visitor is and
 * treats a failure as "nobody", which is exactly what CI produces.
 */

test('sign-in offers a password sign-in and a sign-up, without clearing the gate', async ({
  page,
}) => {
  await page.goto('/connexion')
  await expect(page).toHaveURL(/\/connexion/)
  await expect(page.getByLabel('Adresse électronique')).toBeVisible()
  await expect(page.getByLabel('Mot de passe')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Créer un compte' })).toBeVisible()
})

test('submitting without a password asks for one rather than guessing', async ({ page }) => {
  // The two buttons are distinguishable by intent, not by guessing from which
  // fields happen to be filled. An empty password must not create anything.
  await page.goto('/connexion')
  await page.getByLabel('Adresse électronique').fill('quelquun@example.test')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.locator('#sign-in-error')).toContainText(/mot de passe/i)
})

test('a short password is refused before anything reaches the auth server', async ({ page }) => {
  // Checked by our own schema first: CI has no auth server behind this page,
  // and the refusal must be ours, in our words, whatever the service says.
  await page.goto('/connexion')
  await page.getByLabel('Adresse électronique').fill('quelquun@example.test')
  await page.getByLabel('Mot de passe').fill('court')
  await page.getByRole('button', { name: 'Créer un compte' }).click()
  await expect(page.locator('#sign-in-error')).toContainText(/8 caractères/)
})

test('sign-in shows no product before the gate', async ({ page }) => {
  // §2: nothing promotional, no brand, no entry may appear on a public page.
  await page.goto('/connexion')
  const body = (await page.locator('body').textContent()) ?? ''
  for (const forbidden of ['Cohíba', 'Montecristo', 'Robusto', 'Partagás']) {
    expect(body).not.toContain(forbidden)
  }
})

test('the health notice is present on sign-in too', async ({ page }) => {
  await page.goto('/connexion')
  await expect(page.getByText(/Fumer nuit gravement/i).first()).toBeVisible()
})

test('a used or forged link is refused, and says so', async ({ page }) => {
  await page.goto('/auth/callback?token_hash=pas-un-vrai-jeton')
  await expect(page).toHaveURL(/\/connexion\?erreur=lien/)
  await expect(page.getByText(/n'est plus valable/i)).toBeVisible()
})

test('a callback with nothing at all does not 500', async ({ page }) => {
  const response = await page.goto('/auth/callback')
  expect(response?.status()).toBeLessThan(500)
  await expect(page).toHaveURL(/\/connexion\?erreur=lien/)
})
