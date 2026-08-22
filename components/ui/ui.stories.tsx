import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { EmptyState } from '../layout/empty-state'
import { Button } from './button'
import { FieldError, Input, Label } from './field'

const meta = {
  title: 'Interface/Primitives',
  parameters: { layout: 'padded' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** Verbs, not nouns (§4.6): "Ajouter à la cave", never "Soumettre". */
export const Buttons: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button>Ajouter à la cave</Button>
      <Button variant="secondary">Comparer</Button>
      <Button variant="ghost">Voir l’historique</Button>
      <Button disabled>Indisponible</Button>
    </div>
  ),
}

export const Fields: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="sb-code">Code de boîte</Label>
        <Input id="sb-code" placeholder="MSU JUN 19" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sb-error">Code de boîte</Label>
        <Input id="sb-error" aria-invalid defaultValue="XX" />
        {/* Uses --erreur-lisible: the brief's #9B3D32 reaches only 2.51:1 here (Q11). */}
        <FieldError>Ce code ne correspond à aucune usine connue.</FieldError>
      </div>
    </div>
  ),
}

/** An empty state is an invitation, never a dead end (§4.6). */
export const Empty: Story = {
  render: () => (
    <EmptyState
      title="Cave vide"
      description="Votre cave est vide. Scannez une bague ou cherchez une vitole pour commencer."
      action={<Button variant="secondary">Chercher une vitole</Button>}
    />
  ),
}
