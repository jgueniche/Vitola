import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { publishVenue, closeVenue } from '@/app/(app)/lieux/actions'
import { Band } from '@/components/band/band'
import { ReportDialog } from '@/components/moderation/report-dialog'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/format'
import { m } from '@/lib/i18n'
import { reportSlaHours } from '@/lib/moderation/queries'
import { routes } from '@/lib/routes'
import { getAccount } from '@/lib/settings/queries'
import { hasMinRole, REVIEWER_ROLE } from '@/lib/settings/roles'
import { currentUser } from '@/lib/supabase/server'
import { venueConfirmation } from '@/lib/venues/confirmations'
import { hasHours, HOURS_DAYS, meanRating } from '@/lib/venues/model'
import {
  getVenueBySlug,
  listVenueReviews,
  myVenueReview,
  upcomingEventsAtVenue,
  venuesFlag,
} from '@/lib/venues/queries'

import { DeleteReviewForm, WithdrawVenueForm } from './controls'
import { VenueReviewForm } from './review-form'

const copy = m.venues

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const venue = await getVenueBySlug(slug)
  return { title: venue ? venue.name : copy.sheet.notFound }
}

function TriState({ label, value }: { label: string; value: boolean | null }) {
  return (
    <p className="text-sm">
      <span className="text-ink-muted">{label} : </span>
      {value === null ? copy.tri.unknown : value ? copy.tri.yes : copy.tri.no}
    </p>
  )
}

/**
 * La fiche d'un lieu (ADR 0011).
 *
 * Who reads it is the RLS's decision, not this file's: a published or closed
 * venue is public, a pending one exists only for its author and the editors —
 * everyone else gets this very 404, which never says « accès refusé ».
 *
 * What the sheet refuses to carry, because §2 watches this page more than any
 * other: a price, a promotion, a « meilleure adresse ». It is an address book
 * entry with opening hours, and its reviews rate the welcome, the comfort and
 * the advice — the three columns that exist, and the only three.
 */
export default async function VenuePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const flag = await venuesFlag()
  if (!flag.enabled) notFound()

  const { slug } = await params
  const venue = await getVenueBySlug(slug)
  if (!venue) notFound()

  const query = await searchParams
  const done = venueConfirmation(query.fait)

  const user = await currentUser()
  const [account, reviews, mine, events, slaHours] = await Promise.all([
    user ? getAccount(user.id) : Promise.resolve(null),
    listVenueReviews(venue.id),
    user ? myVenueReview(venue.id, user.id) : Promise.resolve(null),
    upcomingEventsAtVenue(venue.id),
    reportSlaHours(),
  ])

  const isEditor = hasMinRole(account?.role ?? 'member', REVIEWER_ROLE)
  const isAuthor = user !== null && venue.created_by === user.id
  const isClaimant = user !== null && venue.claimed_by === user.id
  const mean = meanRating(reviews.map((review) => review.rating))
  const address = [venue.address, venue.postal_code, venue.city].filter(Boolean).join(', ')

  return (
    <main id="contenu" className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.types[venue.type]}</p>
        <h1 className="font-display text-4xl leading-tight">{venue.name}</h1>
        <p className="text-ink-muted text-sm">{address}</p>
      </div>

      <Band variant="divider" />

      {done ? (
        <p role="status" className="text-ink-muted text-sm">
          {done}
        </p>
      ) : null}

      {venue.status === 'pending' ? (
        <div className="border-rule bg-surface flex flex-col gap-3 rounded-[3px] border p-4">
          <p className="text-ink-muted text-sm leading-relaxed">{copy.sheet.pendingBanner}</p>
          {isEditor ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-ink-muted flex-1 text-xs">{copy.sheet.editorNote}</p>
              <form action={publishVenue}>
                <input type="hidden" name="venueId" value={venue.id} />
                <input type="hidden" name="slug" value={venue.slug} />
                <Button type="submit" size="sm">
                  {copy.sheet.publish}
                </Button>
              </form>
            </div>
          ) : null}
          {isAuthor ? <WithdrawVenueForm venueId={venue.id} /> : null}
        </div>
      ) : null}

      {venue.status === 'closed' ? (
        <p role="status" className="border-rule bg-surface rounded-[3px] border p-4 text-sm">
          {copy.sheet.closedBanner}
        </p>
      ) : null}

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-2xl">{copy.sheet.contactTitle}</h2>
          {venue.phone ? (
            <p className="text-sm">
              <span className="text-ink-muted">{copy.sheet.phoneLabel} : </span>
              <span className="font-mono">{venue.phone}</span>
            </p>
          ) : null}
          {venue.website ? (
            <p className="text-sm">
              <span className="text-ink-muted">{copy.sheet.websiteLabel} : </span>
              <a
                href={venue.website}
                rel="nofollow noopener noreferrer"
                className="text-accent break-all hover:underline"
              >
                {venue.website}
              </a>
            </p>
          ) : null}
          <TriState label={copy.sheet.smokingLabel} value={venue.has_smoking_room} />
          <TriState label={copy.sheet.ventilatedLabel} value={venue.is_ventilated} />
          {venue.status === 'published' || venue.status === 'closed' ? (
            <div className="mt-2">
              {user ? (
                <ReportDialog
                  kind="venue"
                  id={venue.id}
                  slaHours={slaHours}
                  label={copy.sheet.reportVenue}
                />
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="font-display text-2xl">{copy.sheet.hoursTitle}</h2>
          {hasHours(venue.hours) ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {HOURS_DAYS.map((day) =>
                venue.hours[day] ? (
                  <div key={day} className="contents">
                    <dt className="text-ink-muted">{copy.sheet.days[day]}</dt>
                    <dd>{venue.hours[day]}</dd>
                  </div>
                ) : null,
              )}
            </dl>
          ) : (
            <p className="text-ink-muted text-sm">{copy.sheet.hoursEmpty}</p>
          )}
        </div>
      </section>

      {/* Where the row comes from — the honesty the 2018 registry demands. */}
      {venue.source ? (
        <p className="text-ink-muted measure text-xs leading-relaxed">
          {copy.sheet.sourceLine} {copy.sheet.sourceInvite}
        </p>
      ) : null}
      {venue.status === 'published' && !isClaimant ? (
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-xl">{copy.sheet.claimTitle}</h2>
          <p className="text-ink-muted measure text-xs leading-relaxed">
            {venue.claimed_by ? copy.sheet.claimed : copy.sheet.claimHow}
          </p>
        </div>
      ) : null}

      {(isEditor || isClaimant) && venue.status === 'published' ? (
        <form action={closeVenue}>
          <input type="hidden" name="venueId" value={venue.id} />
          <input type="hidden" name="slug" value={venue.slug} />
          <Button type="submit" variant="secondary" size="sm">
            {copy.sheet.close}
          </Button>
        </form>
      ) : null}

      {events.length > 0 ? (
        <section className="flex flex-col gap-3">
          <Band variant="divider" />
          <h2 className="font-display text-2xl">{copy.sheet.eventsTitle}</h2>
          <ul className="flex flex-col gap-2">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                <Link href={routes.event(event.id)} className="text-accent hover:underline">
                  {event.title}
                </Link>
                <span className="text-ink-muted tabular-nums">
                  {formatDateTime(new Date(event.starts_at))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section id="avis" className="flex flex-col gap-4">
        <Band variant="divider" />
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-2xl">{copy.reviews.title}</h2>
          <p className="text-ink-muted text-sm tabular-nums">
            {mean !== null ? (
              <>
                <span className="text-ink">
                  {String(mean).replace('.', ',')}
                  {copy.reviews.onFive}
                </span>{' '}
                ·{' '}
              </>
            ) : null}
            {reviews.length === 1
              ? copy.reviews.countOne
              : copy.reviews.countMany.replace('{count}', String(reviews.length))}
          </p>
        </div>

        {reviews.length === 0 ? (
          <p className="text-ink-muted measure text-sm leading-relaxed">{copy.reviews.empty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {reviews.map((review) => (
              <li
                key={review.id}
                className="border-rule bg-surface flex flex-col gap-2 rounded-[3px] border p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm">
                    {review.author ? (
                      <Link
                        href={routes.member(review.author.handle)}
                        className="text-accent hover:underline"
                      >
                        {review.author.display_name ?? review.author.handle}
                      </Link>
                    ) : (
                      <span className="text-ink-muted">{copy.reviews.anonymousAuthor}</span>
                    )}
                    {user && review.user_id === user.id ? (
                      <span className="text-ink-muted"> — {copy.reviews.yours}</span>
                    ) : null}
                  </p>
                  <p className="text-sm tabular-nums">
                    {String(review.rating).replace('.', ',')}
                    {copy.reviews.onFive}
                  </p>
                </div>
                <p className="text-ink-muted text-xs tabular-nums">
                  {copy.reviews.criteria.welcome} {review.welcome}
                  {copy.reviews.onFive} · {copy.reviews.criteria.comfort} {review.comfort}
                  {copy.reviews.onFive} · {copy.reviews.criteria.advice} {review.advice}
                  {copy.reviews.onFive}
                  {review.updated_at !== review.created_at ? ` · ${copy.reviews.edited}` : ''}
                </p>
                {review.body ? (
                  <p className="measure text-sm leading-relaxed">{review.body}</p>
                ) : null}
                <div className="flex flex-wrap gap-3">
                  {user && review.user_id === user.id ? (
                    <DeleteReviewForm venueId={venue.id} slug={venue.slug} />
                  ) : null}
                  {user && review.user_id !== user.id ? (
                    <ReportDialog
                      kind="venueReview"
                      id={review.id}
                      slaHours={slaHours}
                      label={copy.sheet.reportReview}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {user && venue.status === 'published' ? (
          <VenueReviewForm
            key={mine ? `${mine.welcome}-${mine.comfort}-${mine.advice}-${mine.updated_at}` : 'new'}
            venueId={venue.id}
            slug={venue.slug}
            existing={mine}
          />
        ) : null}
        {!user && venue.status === 'published' ? (
          <p className="text-ink-muted text-sm">
            <Link href={routes.signIn()} className="text-accent hover:underline">
              {copy.reviews.signedOut}
            </Link>
          </p>
        ) : null}
      </section>
    </main>
  )
}
