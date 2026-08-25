// useActionState — an unknown handle or a duplicate shop name must reappear
// next to what was typed. The suspension is a client form for `window.confirm`
// alone: it cuts a live shopfront.
'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { FieldError, FieldStatus, Input, Label } from '@/components/ui/field'
import { m } from '@/lib/i18n'

import { attachVendorOwner, createVendor, setVendorStatus, type AdminState } from '../../actions'

const copy = m.admin.vendors

export function CreateVendorForm() {
  const [state, action, pending] = useActionState<AdminState, FormData>(createVendor, {})

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vendor-name">{copy.nameLabel}</Label>
          <Input id="vendor-name" name="name" maxLength={120} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vendor-owner">{copy.ownerLabel}</Label>
          <Input id="vendor-owner" name="ownerHandle" maxLength={30} />
          <p className="text-ink-muted text-xs">{copy.ownerHint}</p>
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

export function AttachOwnerForm({ vendorId }: { vendorId: string }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(attachVendorOwner, {})

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={vendorId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`attach-${vendorId}`}>{copy.attachLabel}</Label>
        <Input id={`attach-${vendorId}`} name="handle" maxLength={30} />
      </div>
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {copy.attach}
      </Button>
      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {state.done ? <FieldStatus>{m.admin.confirmations.compteRattache}</FieldStatus> : null}
    </form>
  )
}

export function SuspendVendorForm({ vendorId }: { vendorId: string }) {
  return (
    <form
      action={setVendorStatus}
      onSubmit={(event) => {
        if (!window.confirm(copy.suspendConfirm)) event.preventDefault()
      }}
    >
      <input type="hidden" name="id" value={vendorId} />
      <input type="hidden" name="status" value="suspended" />
      <Button type="submit" variant="ghost" size="sm">
        {copy.suspend}
      </Button>
    </form>
  )
}
