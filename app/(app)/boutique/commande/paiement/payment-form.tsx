// useActionState — a malformed card rereads its refusal in place; QA is here
// precisely to exercise those refusals.
'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/field'
import { m } from '@/lib/i18n'
import { DEMO_CARD_NUMBER } from '@/lib/shop/cart'

import { confirmDemoPaymentAction, type PaymentState } from '../../actions'

const copy = m.shop.payment

/**
 * The demo card form. Prefilled with the sandbox number everybody knows, so
 * the happy path is one click — and editable, so the refusal paths are one
 * keystroke. Nothing typed here leaves the action's validation: no PSP, no
 * storage, and the order snapshot keeps titles and totals, never the card.
 */
export function PaymentForm({ totalLabel }: { totalLabel: string }) {
  const [state, formAction, pending] = useActionState<PaymentState, FormData>(
    confirmDemoPaymentAction,
    {},
  )

  /* Keyed on the echoed values, like the checkout form: React 19 resets the
     form when the action returns, and a refused card must not also be a
     wiped one. */
  const cardNumber = state.values?.cardNumber ?? DEMO_CARD_NUMBER
  const expiry = state.values?.expiry ?? '12/29'
  const cvc = state.values?.cvc ?? '123'

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cardNumber">{copy.cardNumberLabel}</Label>
        <Input
          key={`cardNumber:${cardNumber}`}
          id="cardNumber"
          name="cardNumber"
          inputMode="numeric"
          autoComplete="off"
          defaultValue={cardNumber}
          aria-invalid={state.errors?.cardNumber ? true : undefined}
          aria-describedby={state.errors?.cardNumber ? 'cardNumber-error' : undefined}
          className="font-mono"
        />
        {state.errors?.cardNumber ? (
          <FieldError id="cardNumber-error">{state.errors.cardNumber}</FieldError>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="expiry">{copy.expiryLabel}</Label>
          <Input
            key={`expiry:${expiry}`}
            id="expiry"
            name="expiry"
            inputMode="numeric"
            autoComplete="off"
            placeholder="12/29"
            defaultValue={expiry}
            aria-invalid={state.errors?.expiry ? true : undefined}
            aria-describedby={state.errors?.expiry ? 'expiry-error' : undefined}
            className="font-mono"
          />
          {state.errors?.expiry ? (
            <FieldError id="expiry-error">{state.errors.expiry}</FieldError>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cvc">{copy.cvcLabel}</Label>
          <Input
            key={`cvc:${cvc}`}
            id="cvc"
            name="cvc"
            inputMode="numeric"
            autoComplete="off"
            placeholder="123"
            defaultValue={cvc}
            aria-invalid={state.errors?.cvc ? true : undefined}
            aria-describedby={state.errors?.cvc ? 'cvc-error' : undefined}
            className="font-mono"
          />
          {state.errors?.cvc ? <FieldError id="cvc-error">{state.errors.cvc}</FieldError> : null}
        </div>
      </div>

      {state.errors?.cart ? <FieldError>{state.errors.cart}</FieldError> : null}

      <div>
        <Button type="submit" disabled={pending}>
          {copy.pay.replace('{total}', totalLabel)}
        </Button>
      </div>
    </form>
  )
}
