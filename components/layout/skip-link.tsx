/**
 * First focusable element of the page. Visually hidden until focused, which is
 * part of the non-negotiable quality floor of §4.5.
 */
export function SkipLink() {
  return (
    <a
      href="#contenu"
      className="bg-surface-raised text-ink focus:ring-accent sr-only rounded-[3px] px-4 py-2 focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:ring-2"
    >
      Aller au contenu
    </a>
  )
}
