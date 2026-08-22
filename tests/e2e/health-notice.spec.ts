import { expect, test } from '@playwright/test'

const ROUTES = ['/', '/majorite', '/mentions-legales', '/confidentialite', '/conditions', '/cookies', '/sante']

/**
 * §2: the health warning is permanent. Not "present on most pages" — present on
 * every one, and impossible for the visitor to remove.
 */
test.describe('permanent health notice', () => {
  for (const route of ROUTES) {
    test(`is present on ${route}`, async ({ page }) => {
      await page.goto(route)
      const notice = page.getByRole('complementary', { name: 'Avertissement sanitaire' })
      await expect(notice).toBeVisible()
      await expect(notice).toContainText('Fumer nuit gravement à votre santé')
    })
  }

  test('offers no way to dismiss it', async ({ page }) => {
    await page.goto('/')
    const notice = page.getByRole('complementary', { name: 'Avertissement sanitaire' })
    await expect(notice.getByRole('button')).toHaveCount(0)
    await expect(notice.getByRole('link')).toHaveCount(0)
  })
})

test('the landing page shows no product before the gate', async ({ page }) => {
  await page.goto('/')
  const body = (await page.textContent('body')) ?? ''
  for (const brand of ['Cohíba', 'Montecristo', 'Partagás', 'Padrón']) {
    expect(body).not.toContain(brand)
  }
})
