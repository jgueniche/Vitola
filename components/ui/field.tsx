import type { ComponentProps, LabelHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('eyebrow block', className)} {...props} />
}

/* ComponentProps rather than InputHTMLAttributes, which is what Textarea and
   Select already use: only the former carries `ref`, and the tasting form's
   stopwatch needs one to stamp the measured duration into the field. */
export function Input({ className, ...props }: ComponentProps<'input'>) {
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

/**
 * Multi-line text. Same border, focus and invalid treatment as `Input`, so a
 * form mixing the two does not look like two forms.
 *
 * `field-sizing-content` lets it grow with what is typed, up to the max height:
 * a comment box that stays four lines tall while the text scrolls inside it
 * hides what one has written at the moment one wants to reread it.
 */
export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'border-rule-strong bg-surface text-ink placeholder:text-ink-muted w-full rounded-[3px] border px-3 py-2 text-sm leading-relaxed',
        'field-sizing-content max-h-80 min-h-24',
        'focus:border-accent focus:outline-none',
        'aria-[invalid=true]:border-negative',
        className,
      )}
      {...props}
    />
  )
}

/** A native select. No custom listbox: the platform one is keyboard-correct. */
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'border-rule-strong bg-surface text-ink h-10 w-full rounded-[3px] border px-3 text-sm',
        'focus:border-accent focus:outline-none',
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
