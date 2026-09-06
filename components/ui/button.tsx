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

/**
 * The button's classes, for a link that must look like one.
 *
 * A `<Link>` wrapping a `<Button>` nests two interactive elements, which a
 * screen reader announces twice and a keyboard tabs through twice. A link
 * styled as a button is one element that does one thing — navigate — and says
 * so. Sizes follow the rule of the design system: `lg` (48px) for the one
 * gesture of a page, `md` (40px) for submitting and for secondary actions,
 * `sm` (32px) never for a gesture.
 */
export function buttonClass(props: VariantProps<typeof buttonStyles> & { className?: string }) {
  const { className, ...variants } = props
  return cn(buttonStyles(variants), className)
}

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonStyles({ variant, size }), className)} {...props} />
  )
}
