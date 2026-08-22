import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

/**
 * Verbs, not nouns (§4.6): "Ajouter à la cave", never "Soumettre".
 * 3px radius, hairline borders, no shadow (§4.5).
 */
const buttonStyles = cva(
  'inline-flex items-center justify-center gap-2 rounded-[3px] font-medium ' +
    'transition-colors duration-(--duration-quick) ease-out ' +
    'disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-on-accent hover:bg-accent-bright',
        secondary: 'border-rule-strong text-ink hover:bg-surface-raised border bg-transparent',
        ghost: 'text-ink-muted hover:text-ink hover:bg-surface-raised bg-transparent',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonStyles>

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonStyles({ variant, size }), className)} {...props} />
  )
}
