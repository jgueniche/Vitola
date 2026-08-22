import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
const baseURL = `http://127.0.0.1:${PORT}`

/**
 * Some CI images ship a pre-installed Chromium whose build number does not match
 * the pinned @playwright/test. Setting PLAYWRIGHT_CHROMIUM_PATH points at it
 * instead of downloading a second copy. Unset locally, where `playwright install`
 * puts the matching build in the default location.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH
const launchOptions = executablePath ? { executablePath } : {}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions } },
    // 360px is the responsive floor of §4.5, so it is a first-class project
    // rather than an afterthought.
    {
      name: 'mobile-360',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions,
        viewport: { width: 360, height: 780 },
      },
    },
  ],
  webServer: {
    command: `pnpm start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { AGE_GATE_SECRET: process.env.AGE_GATE_SECRET ?? 'e2e-only-secret-at-least-32-chars-long' },
  },
})
