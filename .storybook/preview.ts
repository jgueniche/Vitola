import type { Preview } from '@storybook/nextjs-vite'

import '../app/globals.css'

/**
 * Primitives are shown on the real ground colour, in both themes. A component
 * that only ever gets reviewed on the dark ground is a component whose light
 * mode breaks unnoticed.
 */
const preview: Preview = {
  parameters: {
    layout: 'padded',
    backgrounds: { disable: true },
  },
  globalTypes: {
    theme: {
      description: 'Thème',
      defaultValue: 'dark',
      toolbar: {
        title: 'Thème',
        items: [
          { value: 'dark', title: 'Oscuro (défaut)' },
          { value: 'light', title: 'Papier' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals['theme'] === 'light' ? 'light' : 'dark'
      document.documentElement.setAttribute('data-theme', theme)
      document.body.style.backgroundColor = 'var(--color-ground)'
      document.body.style.color = 'var(--color-ink)'
      return Story()
    },
  ],
}

export default preview
