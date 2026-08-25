// useActionState for the creation — a refusal (duplicate address, empty name)
// must reappear next to what was typed, without losing it. The deletion is a
// client component for `window.confirm` alone.
'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { FieldError, FieldStatus, Input, Label, Select } from '@/components/ui/field'
import { m } from '@/lib/i18n'

import { createLine, deleteLine, type AdminState } from '../actions'

const copy = m.admin.lines

export function CreateLineForm({ brands }: { brands: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(createLine, {})

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brandId">{copy.brandLabel}</Label>
          <Select id="brandId" name="brandId" defaultValue="">
            <option value="">{copy.brandPlaceholder}</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">{copy.nameLabel}</Label>
          <Input id="name" name="name" maxLength={120} />
        </div>
      </div>

      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {state.done ? <FieldStatus>{copy.created}</FieldStatus> : null}

      <div>
        <Button type="submit" disabled={pending}>
          {copy.create}
        </Button>
      </div>
    </form>
  )
}

export function DeleteLineForm({ id }: { id: string }) {
  return (
    <form
      action={deleteLine}
      onSubmit={(event) => {
        if (!window.confirm(copy.deleteConfirm)) event.preventDefault()
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm">
        {copy.delete}
      </Button>
    </form>
  )
}
