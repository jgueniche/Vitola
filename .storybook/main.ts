import type { StorybookConfig } from '@storybook/nextjs-vite'

const config: StorybookConfig = {
  stories: ['../components/**/*.stories.@(ts|tsx)'],
  addons: [],
  framework: { name: '@storybook/nextjs-vite', options: {} },
  typescript: { reactDocgen: 'react-docgen-typescript' },
  // No telemetry leaves this project (§3: observability must stay in the EU,
  // and a build tool phoning home is not something we control).
  core: { disableTelemetry: true },
}

export default config
