'use client'

// useActionState: a refused publication has to say why, in place, without
// losing what was typed. Everything else on this page is a server component.
import { useActionState } from 'react'

import { publishPost, type PostState } from '@/app/(app)/fil/actions'
import { Button } from '@/components/ui/button'
import { FieldError, FieldStatus, Label, Textarea } from '@/components/ui/field'
import { m } from '@/lib/i18n'
import {
  DEFAULT_POST_SCOPE,
  FREEFORM_POST_KINDS,
  POST_LIMITS,
  POST_SCOPES,
} from '@/lib/social/model'

const copy = m.feed.compose

const KIND_LABELS: Record<(typeof FREEFORM_POST_KINDS)[number], string> = {
  post: copy.kindPost,
  question: copy.kindQuestion,
}

const SCOPE_LABELS: Record<(typeof POST_SCOPES)[number], { label: string; hint: string }> = {
  followers: { label: copy.scopeFollowers, hint: copy.scopeFollowersHint },
  public: { label: copy.scopePublic, hint: copy.scopePublicHint },
}

/**
 * The composer — a note or a question, and who reads it.
 *
 * Two scopes and not four, and the sentence under them says why rather than
 * leaving it to be discovered: a publication addresses someone, and writing for
 * oneself is the notebook. `followers` is preselected because it is the column
 * default and the narrower of the two — the same reasoning that makes the
 * notebook default to `private`, one notch out.
 *
 * Radios rather than a select, for the reason `ScopeSelector` gives at length:
 * this is the control that decides who reads something about tobacco
 * consumption, and a collapsed listbox shows one option while hiding the other.
 *
 * Uncontrolled, unlike `ScopeSelector`. The difference is that this form has
 * nothing to come back to: React 19 resets it after the action returns, and a
 * reset here is exactly what one wants — the publication is gone to the feed,
 * the box should be empty. The bug that forced `ScopeSelector` to be keyed was
 * a *stored* value snapping back to its mount-time default; there is no stored
 * value here.
 */
export function Composer() {
  const [state, action, pending] = useActionState<PostState, FormData>(publishPost, {})

  return (
    <form action={action} className="border-rule bg-surface flex flex-col gap-4 rounded-[3px] border p-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="eyebrow mb-1">{copy.kind}</legend>
        <div className="flex flex-wrap gap-2">
          {FREEFORM_POST_KINDS.map((kind, index) => (
            <label
              key={kind}
              className="border-rule bg-surface hover:border-rule-strong has-checked:border-accent has-checked:text-accent flex cursor-pointer items-center gap-2 rounded-[3px] border px-3 py-1.5 text-sm"
            >
              <input
                type="radio"
                name="kind"
                value={kind}
                defaultChecked={index === 0}
                className="accent-accent"
              />
              {KIND_LABELS[kind]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="feed-body">{copy.body}</Label>
        <Textarea
          id="feed-body"
          name="body"
          maxLength={POST_LIMITS.bodyMax}
          placeholder={copy.bodyPlaceholder}
          aria-invalid={state.error ? true : undefined}
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="eyebrow mb-1">{copy.scopeLegend}</legend>
        <div className="flex flex-col gap-2">
          {POST_SCOPES.map((scope) => (
            <label
              key={scope}
              className="border-rule bg-surface hover:border-rule-strong has-checked:border-accent flex cursor-pointer gap-3 rounded-[3px] border px-3 py-2 text-sm"
            >
              <input
                type="radio"
                name="visibility"
                value={scope}
                defaultChecked={scope === DEFAULT_POST_SCOPE}
                className="accent-accent mt-1 shrink-0"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-ink">{SCOPE_LABELS[scope].label}</span>
                <span className="text-ink-muted text-xs leading-relaxed">
                  {SCOPE_LABELS[scope].hint}
                </span>
              </span>
            </label>
          ))}
        </div>
        <p className="text-ink-faint measure text-xs leading-relaxed">{copy.scopeNote}</p>
      </fieldset>

      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {state.done ? <FieldStatus>{copy.done}</FieldStatus> : null}

      <div>
        <Button type="submit" disabled={pending}>
          {copy.submit}
        </Button>
      </div>
    </form>
  )
}
