// A global keydown listener — the one thing a Server Component cannot hold.
// A and R act on the first proposal of the current sheet; the arrows follow
// the two links the page already renders. Announced in the legend beside it.
'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * The keyboard of the serial review.
 *
 * Nothing here decides anything: `a` clicks the « Accepter » button of the
 * first proposal on screen, and the Server Action behind that button applies
 * the same freshness rule, the same trace and the same policies as a mouse
 * would. `r` does not refuse — a refusal needs a word, and the action says so
 * — it moves focus into the comment field of that proposal; `Ctrl + Enter`
 * there submits the refusal, `Escape` leaves the field. Arrows follow the
 * previous / next links, so the position stays in the URL.
 *
 * Keys are ignored while typing (input, textarea, select, contenteditable)
 * and when a modifier is held, so nobody accepts a proposal by typing an
 * « a » in the comment box.
 */
export function ReviewShortcuts({
  previousHref,
  nextHref,
}: {
  previousHref: string | null
  nextHref: string | null
}) {
  const router = useRouter()

  useEffect(() => {
    function isTyping(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
    }

    function onKeyDown(event: KeyboardEvent) {
      const form = document.querySelector<HTMLFormElement>('form[data-decide-form="true"]')

      if (isTyping(event.target)) {
        if (event.key === 'Escape' && event.target instanceof HTMLElement) {
          event.target.blur()
        }
        /* Ctrl + Enter inside the comment field refuses: the word is typed. */
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && form) {
          const textarea = form.querySelector('textarea')
          if (textarea && event.target === textarea) {
            event.preventDefault()
            form.querySelector<HTMLButtonElement>('button[data-decide="reject"]')?.click()
          }
        }
        return
      }
      if (event.altKey || event.ctrlKey || event.metaKey) return

      switch (event.key) {
        case 'a':
        case 'A':
          event.preventDefault()
          form?.querySelector<HTMLButtonElement>('button[data-decide="approve"]')?.click()
          break
        case 'r':
        case 'R': {
          event.preventDefault()
          const textarea = form?.querySelector<HTMLTextAreaElement>('textarea')
          textarea?.focus()
          break
        }
        case 'ArrowRight':
          if (nextHref) {
            event.preventDefault()
            router.push(nextHref)
          }
          break
        case 'ArrowLeft':
          if (previousHref) {
            event.preventDefault()
            router.push(previousHref)
          }
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [router, previousHref, nextHref])

  return null
}
