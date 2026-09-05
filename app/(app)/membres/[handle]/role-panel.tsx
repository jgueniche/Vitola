'use client'

// useState + fetch: `profiles.role` is barred from every client grant and by a
// trigger, so the write is an API route — and a route cannot be a <form action>.
// Same reasoning as the report dialog, and the same shape.
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { FieldError, FieldStatus, Label, Select } from '@/components/ui/field'
import { m } from '@/lib/i18n'
import { GRANTABLE_ROLES, type AppRole, type GrantableRole } from '@/lib/settings/roles'

const copy = m.members

const LABELS: Record<AppRole, string> = {
  member: copy.role_member,
  contributor: copy.role_contributor,
  editor: copy.role_editor,
  moderator: copy.role_moderator,
  admin: copy.role_admin,
}

/**
 * The screen that was missing, and whose absence reserved the wiki queue to one
 * person since P1.
 *
 * It shows what the judgement is made on — reputation, accepted revisions — and
 * then gets out of the way. No threshold is computed: §6 says `editor` and
 * above may review, and who reaches that bar is a product decision nobody has
 * taken. Inventing "50 points" here would take it in passing.
 *
 * Rendered only to an admin, and that is presentation rather than protection:
 * the route re-checks `has_min_role('admin')` under the caller's own session
 * before the service key is touched. Hiding a control is never the barrier.
 */
export function RolePanel({
  userId,
  currentRole,
  reputation,
  acceptedRevisions,
}: {
  userId: string
  currentRole: AppRole
  reputation: number
  acceptedRevisions: number
}) {
  const [role, setRole] = useState<GrantableRole | ''>(
    (GRANTABLE_ROLES as readonly string[]).includes(currentRole)
      ? (currentRole as GrantableRole)
      : '',
  )
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  if (currentRole === 'admin') {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-medium">{copy.roleTitle}</h2>
        <p className="text-ink-muted text-sm">
          {copy.roleCurrent} : {LABELS[currentRole]}
        </p>
        <p className="text-ink-faint measure text-xs leading-relaxed">{copy.roleAdminLocked}</p>
      </div>
    )
  }

  async function apply() {
    if (!role) return
    setState('sending')
    setError(null)

    try {
      const response = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role }),
      })
      if (!response.ok) {
        setError(response.status === 403 ? copy.roleForbidden : copy.roleFailed)
        setState('idle')
        return
      }
      setState('done')
    } catch {
      setError(copy.roleFailed)
      setState('idle')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium">{copy.roleTitle}</h2>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.roleLede}</p>
      </div>

      <dl className="text-ink-muted flex flex-wrap gap-x-8 gap-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="eyebrow text-ink-faint">{copy.roleCurrent}</dt>
          <dd>{LABELS[currentRole]}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="eyebrow text-ink-faint">{copy.reputation}</dt>
          <dd className="tabular-nums">{reputation}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="eyebrow text-ink-faint">{copy.roleAcceptedRevisions}</dt>
          <dd className="tabular-nums">{acceptedRevisions}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-48 flex-col gap-2">
          <Label htmlFor="role">{copy.roleTitle}</Label>
          <Select
            id="role"
            value={role}
            onChange={(event) => setRole(event.target.value as GrantableRole)}
          >
            {GRANTABLE_ROLES.map((value) => (
              <option key={value} value={value}>
                {LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
        <Button
          onClick={() => void apply()}
          disabled={state === 'sending' || role === currentRole}
          size="sm"
          variant="secondary"
        >
          {copy.roleApply}
        </Button>
      </div>

      {error ? <FieldError>{error}</FieldError> : null}
      {state === 'done' ? <FieldStatus>{copy.roleDone}</FieldStatus> : null}

      <p className="text-ink-faint measure text-xs leading-relaxed">{copy.roleTraced}</p>
    </div>
  )
}
