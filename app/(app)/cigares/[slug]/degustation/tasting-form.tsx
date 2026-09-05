'use client'

/*
 * Client for four reasons, all of which are state a server cannot hold: the
 * running total of the six criteria, the stopwatch, the aroma selection, and
 * the local draft that survives a closed tab. Everything else on the page is a
 * plain uncontrolled input, and the form still posts through a Server Action.
 */
import { useRouter } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react'

import { saveTasting } from '@/app/(app)/carnet/actions'
import { STRENGTHS, strengthLabel } from '@/components/data/strength-meter'
import { AromaWheel } from '@/components/reviews/aroma-wheel'
import { ScopeSelector } from '@/components/reviews/scope-selector'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/field'
import type { AromaFamily } from '@/lib/aromas/queries'
import { formatScore } from '@/lib/format'
import { m } from '@/lib/i18n'
import {
  draftFromEntries,
  draftHasContent,
  draftStorageKey,
  minutesFromSeconds,
  parseDraft,
  type TastingDraft,
} from '@/lib/reviews/draft'
import {
  REVIEW_LIMITS,
  SCORE_KEYS,
  SUB_SCORE_MAX,
  SUB_SCORE_STEP,
  totalFromScores,
  type ScoreKey,
  type Scores,
} from '@/lib/reviews/model'
import { routes } from '@/lib/routes'

const copy = m.notebook.tasting
const scoreLabels = m.notebook.scores

/** A no-op subscription: the draft is restored once, never watched. */
function neverChanges() {
  return () => {}
}

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="border-rule bg-surface flex flex-col gap-4 rounded-[3px] border p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium">{title}</h2>
        {hint ? <p className="text-ink-muted measure text-sm leading-relaxed">{hint}</p> : null}
      </div>
      {children}
    </section>
  )
}

/**
 * The structured tasting of §5.4 — the exercise, as opposed to the notebook's
 * daily gesture.
 *
 * **The total is not a field.** `totalFromScores()` averages the six criteria
 * and the result is displayed, never typed. That is ADR 0004's D1 made visible:
 * if the total could be overridden, the six criteria would be decoration and a
 * tasting would be a log with extra steps.
 *
 * **The draft is restored through `useSyncExternalStore`, and this is the one
 * subtle thing in the file.** `localStorage` does not exist on the server, so
 * reading it during render would make the server and the client disagree and
 * React would call that a hydration error. Reading it in an effect and calling
 * `setState` is what `react-hooks/set-state-in-effect` forbids — the same rule
 * that shaped `comment-item.tsx`. `useSyncExternalStore` is the hook built for
 * exactly this shape: it renders the server snapshot (null) during hydration,
 * then re-reads on the client without a mismatch. `neverChanges` means the read
 * happens once — subscribing to our own autosave would remount the form on
 * every keystroke and take the cursor with it.
 *
 * The restored values arrive as `defaultValue`, which only applies when an input
 * first mounts, so the form is keyed on `startedAt` to remount once when a draft
 * turns up. `startedAt` is the moment the draft was *opened*, not saved, so
 * saving does not churn the key.
 */
export function TastingForm({
  cigarId,
  slug,
  families,
  today,
  lots = [],
}: {
  cigarId: string
  slug: string
  families: AromaFamily[]
  today: string
  /* The member's lots of this cigar, oldest first. Empty for anyone who does
     not keep one, and the section below then does not render at all. */
  lots?: { id: string; qty: number; label: string }[]
}) {
  const router = useRouter()
  const storageKey = draftStorageKey(slug)

  const restored = useRef<{ read: boolean; value: TastingDraft | null }>({
    read: false,
    value: null,
  })

  const readOnce = useCallback(() => {
    if (!restored.current.read) {
      restored.current.read = true
      try {
        restored.current.value = parseDraft(window.localStorage.getItem(storageKey))
      } catch {
        restored.current.value = null
      }
    }
    return restored.current.value
  }, [storageKey])

  const draft = useSyncExternalStore(neverChanges, readOnce, () => null)

  const form = useRef<HTMLFormElement>(null)
  const durationField = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startedAt = useRef(draft?.startedAt ?? null)

  const [total, setTotal] = useState<number | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [pending, startTransition] = useTransition()

  /* The stopwatch. setState lives in the interval callback, not in the effect
     body, so this is a subscription and not a render-time assignment. */
  useEffect(() => {
    if (!running) return
    const tick = setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => clearInterval(tick)
  }, [running])

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  /** Reads the six criteria out of the DOM and recomputes what they average. */
  const recomputeTotal = useCallback(() => {
    if (!form.current) return
    const data = new FormData(form.current)
    const scores: Scores = {}
    for (const key of SCORE_KEYS) {
      const raw = data.get(`score_${key}`)
      if (typeof raw === 'string' && raw.trim() !== '') scores[key] = Number(raw)
    }
    setTotal(totalFromScores(scores))
  }, [])

  /** Writes the form to `localStorage`, at most once every 400 ms. */
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (!form.current) return
      startedAt.current ??= new Date().toISOString()
      const next = draftFromEntries([...new FormData(form.current)], startedAt.current)
      try {
        if (draftHasContent(next)) {
          window.localStorage.setItem(storageKey, JSON.stringify(next))
        } else {
          window.localStorage.removeItem(storageKey)
        }
      } catch {
        // A full or disabled store is not a reason to interrupt a tasting.
      }
    }, 400)
  }, [storageKey])

  function onFormInput() {
    recomputeTotal()
    scheduleSave()
  }

  function discardDraft() {
    try {
      window.localStorage.removeItem(storageKey)
    } catch {
      /* nothing to discard */
    }
    setDismissed(true)
    startedAt.current = null
    form.current?.reset()
    recomputeTotal()
  }

  function stampDuration() {
    setRunning(false)
    if (durationField.current) {
      durationField.current.value = String(minutesFromSeconds(seconds))
      scheduleSave()
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const data = new FormData(event.currentTarget)

    startTransition(async () => {
      const result = await saveTasting(data)
      if (result.error || !result.id) {
        setError(result.error ?? m.notebook.errors.unknown)
        return
      }
      try {
        window.localStorage.removeItem(storageKey)
      } catch {
        /* the entry is saved; a lingering draft is a nuisance, not a failure */
      }
      router.push(routes.notebookEntry(result.id))
    })
  }

  const field = (name: string) => draft?.fields[name]
  const showRestored = draft !== null && !dismissed

  return (
    <form
      key={draft?.startedAt ?? 'fresh'}
      ref={form}
      onSubmit={onSubmit}
      onInput={onFormInput}
      className="flex flex-col gap-6"
    >
      <input type="hidden" name="cigarId" value={cigarId} />
      <input type="hidden" name="slug" value={slug} />

      {showRestored ? (
        <p
          role="status"
          className="border-caution text-ink-muted flex flex-wrap items-center gap-3 border-l-2 pl-3 text-sm"
        >
          {copy.draftRestored}
          <button
            type="button"
            onClick={discardDraft}
            className="text-ink-faint hover:text-ink text-xs underline underline-offset-4"
          >
            {copy.draftDiscard}
          </button>
        </p>
      ) : null}

      {/* ------------------------------------------------ the six criteria */}
      <Section title={copy.stepScores} hint={copy.stepScoresHint}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SCORE_KEYS.map((key: ScoreKey) => (
            <div key={key} className="flex flex-col gap-2">
              <Label htmlFor={`score-${key}`}>{scoreLabels[key]}</Label>
              <Input
                id={`score-${key}`}
                name={`score_${key}`}
                type="number"
                inputMode="decimal"
                min={0}
                max={SUB_SCORE_MAX}
                step={SUB_SCORE_STEP}
                defaultValue={field(`score_${key}`)}
                required
              />
            </div>
          ))}
        </div>

        <div className="border-rule flex flex-wrap items-baseline gap-3 border-t pt-4">
          <span className="eyebrow">{copy.total}</span>
          {total === null ? (
            <span className="text-ink-faint text-sm">{copy.totalPending}</span>
          ) : (
            <span className="font-mono text-3xl tabular-nums">
              {formatScore(total)}
              <span className="text-ink-faint text-xs">/100</span>
            </span>
          )}
        </div>
      </Section>

      {/* ------------------------------------------------------ the thirds */}
      <Section title={copy.stepThirds} hint={copy.stepThirdsHint}>
        <div className="flex flex-col gap-4">
          {[m.notebook.entry.thirdOne, m.notebook.entry.thirdTwo, m.notebook.entry.thirdThree].map(
            (label, index) => (
              <div key={label} className="flex flex-col gap-2">
                <Label htmlFor={`third-${index + 1}`}>{label}</Label>
                <Textarea
                  id={`third-${index + 1}`}
                  name={`third_${index + 1}`}
                  maxLength={REVIEW_LIMITS.thirdNotesMax}
                  defaultValue={field(`third_${index + 1}`)}
                />
              </div>
            ),
          )}
        </div>
      </Section>

      {/* ------------------------------------------------------ the aromas */}
      <Section title={copy.stepAromas}>
        <AromaWheel
          families={families}
          initial={draft?.aromaTags ?? []}
          onSelectionChange={scheduleSave}
        />
      </Section>

      {/* ----------------------------------------------------- the context */}
      <Section title={copy.stepContext} hint={copy.stepContextHint}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="tasting-smoked-on">{m.notebook.form.smokedOn}</Label>
            <Input
              id="tasting-smoked-on"
              name="smokedOn"
              type="date"
              defaultValue={field('smokedOn') ?? today}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="tasting-strength">{copy.strength}</Label>
            <Select id="tasting-strength" name="strength" defaultValue={field('strength') ?? ''}>
              <option value="">{copy.strengthNone}</option>
              {STRENGTHS.map((strength) => (
                <option key={strength} value={strength}>
                  {strengthLabel(strength)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* ------ the stopwatch, which only ever writes into the field ---- */}
        <div className="border-rule flex flex-col gap-3 rounded-[3px] border p-4">
          <div className="flex flex-wrap items-center gap-4">
            <span className="eyebrow">{copy.timerLabel}</span>
            <span className="font-mono text-2xl tabular-nums">{clock(seconds)}</span>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setRunning((value) => !value)}
              >
                {running ? copy.timerPause : seconds > 0 ? copy.timerResume : copy.timerStart}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRunning(false)
                  setSeconds(0)
                }}
              >
                {copy.timerReset}
              </Button>
              {seconds > 0 ? (
                <Button type="button" size="sm" variant="ghost" onClick={stampDuration}>
                  {copy.duration}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="tasting-duration">{copy.duration}</Label>
            <Input
              id="tasting-duration"
              ref={durationField}
              name="duration"
              type="number"
              inputMode="numeric"
              min={REVIEW_LIMITS.durationMin}
              max={REVIEW_LIMITS.durationMax}
              defaultValue={field('duration')}
            />
            <p className="text-ink-faint text-xs">{copy.timerHint}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="tasting-box-code">{copy.boxCode}</Label>
            <Input
              id="tasting-box-code"
              name="boxCode"
              maxLength={REVIEW_LIMITS.boxCodeMax}
              defaultValue={field('boxCode')}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tasting-humidity">{copy.humidity}</Label>
            <Input
              id="tasting-humidity"
              name="humidity"
              type="number"
              inputMode="decimal"
              min={REVIEW_LIMITS.humidityMin}
              max={REVIEW_LIMITS.humidityMax}
              step={0.1}
              defaultValue={field('humidity')}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tasting-production">{copy.productionYear}</Label>
            <Input
              id="tasting-production"
              name="productionYear"
              type="number"
              inputMode="numeric"
              min={REVIEW_LIMITS.yearMin}
              max={REVIEW_LIMITS.yearMax}
              defaultValue={field('productionYear')}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tasting-purchase">{copy.purchaseYear}</Label>
            <Input
              id="tasting-purchase"
              name="purchaseYear"
              type="number"
              inputMode="numeric"
              min={REVIEW_LIMITS.yearMin}
              max={REVIEW_LIMITS.yearMax}
              defaultValue={field('purchaseYear')}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="tasting-pairing">{copy.pairing}</Label>
          <Input
            id="tasting-pairing"
            name="pairingText"
            maxLength={REVIEW_LIMITS.pairingTextMax}
            defaultValue={field('pairingText')}
          />
          <p className="text-ink-faint text-xs">{copy.pairingHint}</p>
        </div>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="isBlind"
            defaultChecked={draft?.isBlind}
            className="accent-accent mt-1"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-ink text-sm">{copy.blind}</span>
            <span className="text-ink-muted text-xs leading-relaxed">{copy.blindHint}</span>
          </span>
        </label>
      </Section>

      {/* -------------------------------------------------- the last word */}
      <Section title={copy.body}>
        {/* The section title is visual only — a textarea still needs its own
            accessible name, and axe counts the lack as critical. */}
        <Textarea
          name="body"
          aria-label={copy.body}
          maxLength={REVIEW_LIMITS.bodyMax}
          defaultValue={field('body')}
        />
      </Section>

      {/* -------------------------------------------------- the humidor */}
      {lots.length > 0 ? (
        <Section title={m.humidor.inHumidor}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tasting-lot">{m.humidor.smokeLot}</Label>
            <Select id="tasting-lot" name="humidorItemId" defaultValue="">
              <option value="">{m.humidor.smokeLotNone}</option>
              {lots.map((lot) => (
                <option key={lot.id} value={lot.id}>
                  {m.humidor.smokeLotOption
                    .replace('{cigar}', lot.label)
                    .replace('{count}', String(lot.qty))}
                </option>
              ))}
            </Select>
            <p className="text-ink-muted text-xs leading-relaxed">{m.humidor.smokeLotHint}</p>
          </div>
        </Section>
      ) : null}

      <Section title={m.notebook.scope.legend}>
        <ScopeSelector pendingShares value={draft?.visibility} onChange={scheduleSave} />
      </Section>

      {error ? <FieldError id="tasting-error">{error}</FieldError> : null}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {copy.submit}
        </Button>
        <p className="text-ink-faint measure text-xs leading-relaxed">{copy.draftHint}</p>
      </div>
    </form>
  )
}

/** mm:ss — a cigar is measured in minutes, never in hours. */
function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}
