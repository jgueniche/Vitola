import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { UnblockButton } from '@/app/(app)/membres/[handle]/unblock-button'
import { Band } from '@/components/band/band'
import { Button } from '@/components/ui/button'
import { formatEffectiveDate } from '@/lib/cigar'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import {
  CONSENT_KINDS,
  CONSENT_TRAITS,
  currentConsents,
  type ConsentKind,
} from '@/lib/settings/model'
import { getAccount } from '@/lib/settings/queries'
import { hasMinRole } from '@/lib/settings/roles'
import { getMyVendor } from '@/lib/shop/queries'
import { relationConfirmation } from '@/lib/social/confirmations'
import { listBlockedPeople } from '@/lib/social/queries'
import { currentUser } from '@/lib/supabase/server'

import { DeleteAccountButton, PreferencesForm, PrivacyForm, ProfileForm } from './forms'

export const metadata: Metadata = { title: m.settings.title }

const copy = m.settings

const KIND_LABELS: Record<ConsentKind, string> = {
  terms: copy.kindTerms,
  privacy: copy.kindPrivacy,
  age_verification: copy.kindAgeVerification,
  analytics: copy.kindAnalytics,
  marketing_email: copy.kindMarketingEmail,
  health_related_processing: copy.kindHealthRelatedProcessing,
}

/**
 * Mon compte — five sections, and the order is the order one cares about them.
 *
 * The consent section is the one worth reading the code for, because what it
 * does **not** do is the decision. It shows the register and offers no switch,
 * and that is not an unfinished feature:
 *
 *   - `terms`, `privacy` and `age_verification` are not consent-based at all
 *     (art. 6.1.b and 6.1.c). Rendering them as checkboxes would offer a choice
 *     that does not exist, which art. 7.4 says is not a consent;
 *   - `analytics`, `marketing_email` and `health_related_processing` are
 *     genuinely optional and genuinely **not happening**. Asking permission for
 *     a processing one does not perform produces a record, not a permission —
 *     and a register full of consents to nothing is worse than an empty one,
 *     because it looks like compliance.
 *
 * So the register is empty, the page says why in French, and the switches ship
 * with the processing they govern. What is offered instead is the withdrawal
 * that is real today and immediate: erasure.
 *
 * The /100 ↔ /20 switch moved here from `/carnet`, where it shipped first. It
 * belongs with the other display preferences; the notebook keeps a line saying
 * which scale is in force and a link back to this page, so the affordance is
 * not lost by the move.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const confirmation = relationConfirmation((await searchParams).fait)
  const user = await currentUser()
  if (!user) {
    redirect(`${routes.signIn()}?suite=${encodeURIComponent(routes.settings())}`)
  }

  const [account, blocked, vendor] = await Promise.all([
    getAccount(user.id),
    listBlockedPeople(),
    getMyVendor(user.id),
  ])
  /* `tg_handle_new_user()` creates the profile with the account. Its absence is
     a broken trigger, not an empty state, and a 404 says so loudly. */
  if (!account) notFound()

  /* The register is a ledger: the latest row per kind is the current state.
     Computed here rather than in the list, which shows the whole history. */
  const latest = currentConsents(account.consents)

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="font-display text-4xl leading-tight">{copy.title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
        <p className="text-ink-faint text-xs">
          {copy.memberSince.replace('{date}', formatEffectiveDate(account.created_at.slice(0, 10)))}
          {' · '}
          {copy.role} : {account.role}
          {' · '}
          {copy.reputation} : {account.reputation}
        </p>
        {/* The desk has no global nav entry — the header would pay a role read
            on every page for a link two accounts can use. It lives here, where
            the role is already loaded. */}
        {hasMinRole(account.role, 'moderator') ? (
          <p className="text-sm">
            <Link href={routes.moderation()} className="text-ink underline">
              {m.moderation.desk.settingsLink}
            </Link>{' '}
            <span className="text-ink-faint text-xs">{m.moderation.desk.settingsLede}</span>
          </p>
        ) : null}
        {hasMinRole(account.role, 'admin') ? (
          <p className="text-sm">
            <Link href={routes.admin()} className="text-ink underline">
              {m.admin.settingsLink}
            </Link>{' '}
            <span className="text-ink-faint text-xs">{m.admin.settingsLede}</span>
          </p>
        ) : null}
        {/* Not a role: a vendor is attached, never promoted (ADR 0016, D2).
            Same placement rule as the desk — the link lives where the account
            is already loaded, never in the header. */}
        {vendor ? (
          <p className="text-sm">
            <Link href={routes.vendorSpace()} className="text-ink underline">
              {m.vendor.settingsLink}
            </Link>{' '}
            <span className="text-ink-faint text-xs">{m.vendor.settingsLede}</span>
          </p>
        ) : null}
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl">{copy.profileTitle}</h2>
          <p className="text-ink-muted measure text-sm leading-relaxed">{copy.profileLede}</p>
        </div>
        <ProfileForm
          handle={account.handle}
          displayName={account.display_name}
          bio={account.bio}
          country={account.country}
          city={account.city}
          isDiscoverable={account.is_discoverable}
        />
        <p className="text-ink-faint measure text-xs leading-relaxed">{copy.roleHint}</p>
      </section>

      <Band variant="divider" />

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl">{copy.preferencesTitle}</h2>
          <p className="text-ink-muted measure text-sm leading-relaxed">{copy.preferencesLede}</p>
        </div>
        <PreferencesForm preferences={account.preferences} />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl">{copy.privacyTitle}</h2>
          <p className="text-ink-muted measure text-sm leading-relaxed">{copy.privacyLede}</p>
        </div>
        <PrivacyForm privacy={account.privacy} />
        <p className="text-ink-faint measure text-xs leading-relaxed">{copy.privacyNotYet}</p>
      </section>

      {/* Les personnes bloquées vivent ici et pas seulement sur leur profil.
          Le profil suffirait techniquement — la 0012 le laisse visible de qui a
          posé le blocage —, mais il faut en connaître le pseudo pour y aller.
          « Une commande qu'on ne trouve pas n'est pas un contrepoids » est
          l'argument que l'ADR 0007 fait pour le retrait d'un abonné ; il vaut
          mot pour mot ici. */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl">{copy.blockedTitle}</h2>
          <p className="text-ink-muted measure text-sm leading-relaxed">{copy.blockedLede}</p>
        </div>

        {confirmation ? (
          <p role="status" className="text-ink-muted text-sm">
            {confirmation}
          </p>
        ) : null}

        {blocked.length === 0 ? (
          <p className="text-ink-faint text-sm">{copy.blockedEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {blocked.map((person) => (
              <li
                key={person.id}
                className="border-rule bg-surface flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-[3px] border px-4 py-3"
              >
                <Link href={routes.member(person.handle)} className="text-ink text-sm">
                  {person.display_name ?? `@${person.handle}`}
                  <span className="text-ink-faint font-mono text-xs"> @{person.handle}</span>
                </Link>
                <UnblockButton
                  userId={person.id}
                  handle={person.handle}
                  retour={routes.settings()}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Band variant="divider" />

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl">{copy.consentsTitle}</h2>
          <p className="text-ink-muted measure text-sm leading-relaxed">{copy.consentsLede}</p>
        </div>

        {account.consents.length === 0 ? (
          <div className="border-rule bg-surface flex flex-col gap-2 rounded-[3px] border px-4 py-4">
            <p className="eyebrow">{copy.consentsEmptyTitle}</p>
            <p className="text-ink-muted measure text-sm leading-relaxed">
              {copy.consentsEmptyBody}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {account.consents.map((row, index) => (
              <li
                key={`${row.kind}-${row.granted_at}-${index}`}
                className="border-rule flex flex-wrap items-baseline justify-between gap-2 border-b py-2 text-sm last:border-0"
              >
                <span>{KIND_LABELS[row.kind]}</span>
                <span className="text-ink-muted flex items-baseline gap-3">
                  <span>{row.granted ? copy.consentGranted : copy.consentWithdrawn}</span>
                  <span className="text-ink-faint text-xs">
                    {copy.consentVersion.replace('{version}', row.version)} ·{' '}
                    {formatEffectiveDate(row.granted_at.slice(0, 10))}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* What governs each processing, whether or not the register has a row
            for it. A basis one cannot read is a basis one cannot contest. */}
        <div className="flex flex-col gap-2">
          <p className="eyebrow">{copy.basisTitle}</p>
          <dl className="flex flex-col gap-2 text-sm">
            {CONSENT_KINDS.map((kind) => {
              const trait = CONSENT_TRAITS[kind]
              const current = latest.get(kind)
              const basis = !trait.optional
                ? kind === 'age_verification'
                  ? copy.basisLegal
                  : copy.basisContract
                : copy.basisConsent
              return (
                <div key={kind} className="flex flex-col gap-0.5">
                  <dt className="text-ink">{KIND_LABELS[kind]}</dt>
                  <dd className="text-ink-muted measure text-xs leading-relaxed">
                    {basis}
                    {trait.optional && !trait.active ? ` ${copy.consentInactive}` : ''}
                    {/* The register's current answer for this kind, when it has
                        one. The list above is the history; this is the state. */}
                    {current ? (
                      <span className="text-ink block">
                        {current.granted ? copy.consentGranted : copy.consentWithdrawn} ·{' '}
                        {formatEffectiveDate(current.granted_at.slice(0, 10))}
                      </span>
                    ) : null}
                  </dd>
                </div>
              )
            })}
          </dl>
        </div>
      </section>

      <Band variant="divider" />

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl">{copy.gdprTitle}</h2>
          <p className="text-ink-muted measure text-sm leading-relaxed">{copy.gdprLede}</p>
        </div>

        <div className="flex flex-col gap-2">
          {/* An anchor, because the endpoint answers with a file and a browser
              already knows what to do with one. Same reasoning as the humidor's
              CSV export. */}
          <a href="/api/gdpr/export" download="vitola-mes-donnees.json" className="w-fit">
            <Button variant="secondary">{copy.exportAction}</Button>
          </a>
          <p className="text-ink-muted measure text-xs leading-relaxed">{copy.exportHint}</p>
        </div>

        <div className="border-rule flex flex-col gap-2 rounded-[3px] border border-dashed px-4 py-4">
          <DeleteAccountButton />
          <p className="text-ink-muted measure text-xs leading-relaxed">{copy.deleteHint}</p>
        </div>
      </section>
    </main>
  )
}
