import { expect, test } from '@playwright/test'

import { DSA_SLA_HOURS } from '@/lib/compliance/dsa'

/**
 * The published deadline, checked on a page rendered with no database.
 *
 * This is the shape of failure this repository has already paid for once:
 * `AGE_GATE_SECRET` was missing on Vercel, the build went green, and the site
 * returned a 500 on `/majorite` at the exact moment someone typed their date of
 * birth. A guard that only fires at runtime fires at the visitor.
 *
 * The same shape applies here, with a legal edge. `/mentions-legales` reads
 * `feature_flags.dsa_report_sla_hours`, and that read can fail — a cold
 * project, a network hiccup, or as here a stand-in Supabase URL. If it threw,
 * the page carrying our DSA commitment would 500 while the rest of the site
 * stayed up. `reportSlaHours()` swallows the failure and falls back to the
 * pinned constant instead; this run is what proves it, because the e2e
 * environment has no database at all.
 *
 * The page is public — the deadline must be readable before the age gate, by
 * anyone who has something to report.
 */
test.describe('the DSA deadline is published', () => {
  test('renders on the legal notice without a database', async ({ page }) => {
    const response = await page.goto('/mentions-legales')
    expect(response?.status()).toBe(200)

    const main = page.getByRole('main')
    await expect(main).toContainText('Signalement et modération')
    await expect(main).toContainText(`${DSA_SLA_HOURS} heures`)
  })

  test('names the mechanism, not only the deadline', async ({ page }) => {
    await page.goto('/mentions-legales')
    // Art. 16 asks for a notice mechanism that is easy to find. Saying only
    // "we answer in 72 hours" announces a deadline for a door nobody located.
    await expect(page.getByRole('main')).toContainText('Signaler')
  })
})
