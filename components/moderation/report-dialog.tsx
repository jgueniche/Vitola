'use client'

// useState + fetch: the panel has to hold what was typed, whether the request is
// in flight, and what came back. There is no server-rendered path to the same
// result — the notice mechanism is an API route (art. 16 wants one that a
// machine can call too), and a route handler cannot be a <form action>.
import { useId, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { FieldError, Label, Select, Textarea } from '@/components/ui/field'
import { REPORT_REASONS, type ReportableKind } from '@/lib/compliance/dsa'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'

type Outcome = 'idle' | 'sending' | 'sent' | 'duplicate'

/** What to do about a refusal, when there is something to do: a door to go
 *  through, with the way back to this page in its `suite`. */
type NextStep = { label: string; href: string }

const copy = m.moderation.report

/**
 * The "Signaler" control, and the form behind it.
 *
 * One component for every reportable surface — a comment, an entry, a product —
 * because the DSA asks for one mechanism, not one per page. What changes
 * between call sites is the `kind`, which `lib/compliance/dsa.ts` maps to a
 * schema and a table; the browser never sends a table name.
 *
 * Closed by default and quiet when closed: a report button that shouts is an
 * invitation to report, and this is a page about a cigar, not a courtroom.
 *
 * Two refusals are doors rather than dead ends, and each carries the way back.
 * A 401 is « connectez-vous » with `/connexion?suite=<here>`; a 403 is the age
 * gate answering in JSON, and it sends to `/majorite?suite=<here>`. On a gated
 * page a 403 can only mean the cookie expired mid-session; on the public shop
 * (25 août 2026) it is the ordinary case of a member who signed in from a
 * public page and never crossed the portal. Same answer both times: the door,
 * then back to what they were reporting — the detour `docs/decisions-log.md`
 * chose over moving the route in front of the gate.
 */
export function ReportDialog({
  kind,
  id,
  slaHours,
  label,
}: {
  kind: ReportableKind
  id: string
  slaHours: number
  /** What the trigger says. Differs on an entry ("cette fiche") and a comment. */
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [outcome, setOutcome] = useState<Outcome>('idle')
  const [error, setError] = useState<string | null>(null)
  const [next, setNext] = useState<NextStep | null>(null)
  const panelId = useId()
  const errorId = `${panelId}-error`
  const firstField = useRef<HTMLSelectElement>(null)

  function toggle() {
    const nextOpen = !open
    setOpen(nextOpen)
    setError(null)
    setNext(null)
    // Focus follows the disclosure, or the panel opens somewhere the keyboard
    // is not. requestAnimationFrame: the field does not exist until React
    // commits the state change.
    if (nextOpen) requestAnimationFrame(() => firstField.current?.focus())
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setOutcome('sending')
    setError(null)
    setNext(null)

    try {
      const response = await fetch('/api/signalements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          id,
          reason: form.get('reason'),
          detail: (form.get('detail') as string)?.trim() || undefined,
        }),
      })

      if (response.status === 201) return setOutcome('sent')
      if (response.status === 409) return setOutcome('duplicate')

      setOutcome('idle')
      // Each refusal says what to do next, which is the only useful thing a
      // refusal can say. The way back is read at this moment and not at
      // render: it is where the person IS, and `safeSuite()` on the other
      // side decides whether it is worth returning to.
      const here = encodeURIComponent(`${window.location.pathname}${window.location.search}`)
      if (response.status === 401) {
        setError(copy.signIn)
        setNext({ label: m.comments.signInAction, href: `${routes.signIn()}?suite=${here}` })
      } else if (response.status === 403) {
        setError(copy.ageGate)
        setNext({ label: copy.ageGateAction, href: `${routes.ageGate()}?suite=${here}` })
      } else if (response.status === 404) setError(copy.gone)
      else if (response.status === 429) setError(copy.throttled)
      else setError(copy.error)
    } catch {
      setOutcome('idle')
      setError(copy.error)
    }
  }

  if (outcome === 'sent' || outcome === 'duplicate') {
    return (
      <div className="border-rule bg-surface rounded-[3px] border p-4">
        <p className="eyebrow">{copy.sentTitle}</p>
        <p className="text-ink-muted measure mt-2 text-sm leading-relaxed">
          {outcome === 'duplicate'
            ? copy.duplicate
            : copy.sentBody.replace('{hours}', String(slaHours))}
        </p>
      </div>
    )
  }

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
      >
        {label ?? copy.trigger}
      </Button>

      {open ? (
        <form
          id={panelId}
          onSubmit={submit}
          className="border-rule bg-surface mt-2 flex flex-col gap-4 rounded-[3px] border p-4"
        >
          <div>
            <p className="eyebrow">{copy.title}</p>
            <p className="text-ink-muted measure mt-2 text-sm leading-relaxed">
              {copy.lede.replace('{hours}', String(slaHours))}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${panelId}-reason`}>{copy.reasonLabel}</Label>
            <Select id={`${panelId}-reason`} name="reason" ref={firstField} required>
              {REPORT_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {copy.reasons[reason]}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${panelId}-detail`}>{copy.detailLabel}</Label>
            <Textarea
              id={`${panelId}-detail`}
              name="detail"
              maxLength={2000}
              aria-describedby={error ? errorId : `${panelId}-hint`}
            />
            <p id={`${panelId}-hint`} className="text-ink-faint text-xs">
              {copy.detailHint}
            </p>
            {error ? <FieldError id={errorId}>{error}</FieldError> : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" disabled={outcome === 'sending'}>
              {copy.submit}
            </Button>
            <Button variant="ghost" size="sm" onClick={toggle}>
              {copy.cancel}
            </Button>
            {next ? (
              <a
                href={next.href}
                className="text-accent-bright text-sm underline underline-offset-4"
              >
                {next.label}
              </a>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  )
}
