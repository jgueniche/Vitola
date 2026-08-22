import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  // Path aliases come from tsconfig.json natively; vite-tsconfig-paths is no
  // longer needed and was removed rather than kept "just in case" (§3: every
  // dependency must justify itself).
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/compliance/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts'],
      thresholds: { statements: 80, branches: 75, functions: 80, lines: 80 },
    },
  },
})
