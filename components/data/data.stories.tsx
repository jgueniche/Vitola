import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { RingGauge } from './ring-gauge'
import { STRENGTHS, StrengthMeter } from './strength-meter'
import { WRAPPER_SHADES, WrapperScale } from './wrapper-scale'

const meta = {
  title: 'Données/Échelles',
  parameters: { layout: 'padded' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** The palette is the trade scale — §4.1. Colour is never the only signal. */
export const WrapperShades: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {WRAPPER_SHADES.map((shade) => (
        <WrapperScale key={shade} shade={shade} />
      ))}
    </div>
  ),
}

export const Strengths: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {STRENGTHS.map((strength) => (
        <StrengthMeter key={strength} strength={strength} />
      ))}
    </div>
  ),
}

/** The silhouette shows what a number cannot: a 38 next to a 56. */
export const Dimensions: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col gap-4">
      <RingGauge ringGauge={38} lengthMm={192} withSilhouette />
      <RingGauge ringGauge={52} lengthMm={150} withSilhouette />
      <RingGauge ringGauge={56} lengthMm={124} withSilhouette />
    </div>
  ),
}
