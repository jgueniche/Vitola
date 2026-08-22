import type { InputHTMLAttributes, LabelHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('eyebrow block', className)} {...props} />
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'border-rule-strong bg-surface text-ink placeholder:text-ink-muted h-10 w-full rounded-[3px] border px-3 text-sm',
        'focus:border-accent focus:outline-none',
        'aria-[invalid=true]:border-negative',
        className,
      )}
      {...props}
    />
  )
}

/** Error text uses the readable variant of the error pigment — see Q11. */
export function FieldError({ children, id }: { children: string; id?: string }) {
  return (
    <p id={id} role="alert" className="text-negative text-sm">
      {children}
    </p>
  )
}
