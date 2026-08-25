// useActionState — a refused field rereads its error in place, without losing
// the rest of the address (the sign-in form's pattern).
'use client'

import { useActionState } from 'react'

import { FieldError, Input, Label } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { m } from '@/lib/i18n'
import type { ShippingInput } from '@/lib/shop/cart'

import { submitCheckoutAction, type CheckoutState } from '../actions'

const copy = m.shop.checkout

export function CheckoutForm({ prefill }: { prefill: ShippingInput | null }) {
  const [state, formAction, pending] = useActionState<CheckoutState, FormData>(
    submitCheckoutAction,
    {},
  )

  /* React 19 resets the form when the action returns, radios and text alike
     (the ScopeSelector lesson): each field is therefore KEYED on the value
     the refusal echoed back, so the remount's defaultValue is what was typed
     and a refused postal code does not also wipe the name above it. */
  const field = (
    name: keyof ShippingInput,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
  ) => {
    const value = state.values?.[name] ?? prefill?.[name] ?? ''
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={name}>{label}</Label>
        <Input
          key={`${name}:${value}`}
          id={name}
          name={name}
          defaultValue={value}
          aria-invalid={state.errors?.[name] ? true : undefined}
          aria-describedby={state.errors?.[name] ? `${name}-error` : undefined}
          {...props}
        />
        {state.errors?.[name] ? (
          <FieldError id={`${name}-error`}>{state.errors[name]}</FieldError>
        ) : null}
      </div>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {field('fullName', copy.nameLabel, { autoComplete: 'name' })}
      {field('email', copy.emailLabel, { type: 'email', autoComplete: 'email' })}
      {field('address', copy.addressLabel, { autoComplete: 'street-address' })}
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        {field('postalCode', copy.postalCodeLabel, {
          inputMode: 'numeric',
          autoComplete: 'postal-code',
        })}
        {field('city', copy.cityLabel, { autoComplete: 'address-level2' })}
      </div>
      {state.errors?.cart ? <FieldError>{state.errors.cart}</FieldError> : null}
      <div>
        <Button type="submit" disabled={pending}>
          {copy.continue}
        </Button>
      </div>
    </form>
  )
}
