/**
 * Permanent health warning (§2 of the brief).
 *
 * Rendered by the root layout on every route, above everything else. There is
 * deliberately no `dismissible` prop, no close button and no state: a warning
 * the visitor can remove is not a permanent warning. If a future ticket asks to
 * hide it on some route, the answer is no — that is the point of the component.
 *
 * It is a <p> inside a landmark rather than an aria-live region: it never
 * changes, so announcing it repeatedly would be noise.
 */
export function HealthNotice() {
  return (
    <aside
      aria-label="Avertissement sanitaire"
      className="border-rule bg-surface text-ink-muted border-b px-4 py-2 text-center text-xs leading-relaxed"
    >
      <p className="mx-auto max-w-3xl">
        Fumer nuit gravement à votre santé et à celle de votre entourage.
      </p>
    </aside>
  )
}
