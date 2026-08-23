import Link from 'next/link'

import { Band } from '@/components/band/band'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { currentUser } from '@/lib/supabase/server'
import { venueOptions } from '@/lib/venues/queries'

import { SessionForm } from './session-form'

const copy = m.feed.session

/**
 * « Je fume ce cigare » on the cigar page — the third gesture, next to the
 * other two.
 *
 * Rendered only to a signed-in member, and that is not a permission check
 * standing in for RLS: the insert policy would refuse an anonymous caller
 * anyway. It is the rule the header follows for `/carnet` — a control whose one
 * behaviour is to bounce you is a promise it cannot keep. A visitor gets the
 * sign-in link instead, which is the same information without the dead end.
 */
export async function FeedSection({ cigarId, slug }: { cigarId: string; slug: string }) {
  const user = await currentUser()

  return (
    <section className="flex flex-col gap-6">
      <Band variant="divider" />

      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl">{copy.title}</h2>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
      </div>

      {user ? (
        <SessionForm cigarId={cigarId} slug={slug} venueOptions={await venueOptions()} />
      ) : (
        <p className="text-sm">
          <Link
            href={`${routes.signIn()}?suite=${encodeURIComponent(routes.cigar(slug))}`}
            className="text-accent hover:underline"
          >
            {m.auth.title}
          </Link>
        </p>
      )}
    </section>
  )
}
