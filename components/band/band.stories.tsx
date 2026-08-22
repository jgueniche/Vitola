import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { Band } from './band'

/**
 * The signature element (§4.4). Four variants, one shape.
 * If a fifth variant is ever proposed, the answer is almost certainly no:
 * a second memorable element would not make two, it would leave none.
 */
const meta = {
  title: 'Signature/Band',
  component: Band,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Band>

export default meta
type Story = StoryObj<typeof meta>

export const Header: Story = {
  args: { variant: 'header', brand: 'Cohíba', vitola: 'Siglo VI' },
}

export const Divider: Story = {
  args: { variant: 'divider' },
}

export const DividerWithLabel: Story = {
  args: { variant: 'divider', brand: 'Au catalogue' },
}

export const Badge: Story = {
  args: { variant: 'badge', brand: 'Archiviste' },
}

export const Viewfinder: Story = {
  args: {
    variant: 'viewfinder',
    children: 'Cigare à l’horizontale · bague centrée',
  },
}

/** Long names must not break the lockup at 360px, the responsive floor (§4.5). */
export const LongNames: Story = {
  args: { brand: 'Vegas Robaina', vitola: 'Familiar Edición Limitada' },
}
