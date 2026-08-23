import Link from 'next/link'

import { deleteClub, joinClub, leaveClub, removeClubMember } from '@/app/(app)/clubs/actions'
import { Button } from '@/components/ui/button'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import type { PersonRow } from '@/lib/social/queries'

const copy = m.clubs

/**
 * The gestures on a club, as plain `<form action={…}>`.
 *
 * Server components, so this page ships no JavaScript — the same choice
 * `/notifications` made. Each form carries the club's identifier and slug as
 * hidden fields because the action redirects back here, and a slug read from
 * the form is the address to return to, never a right: the policies decide
 * whether the delete touches anything.
 *
 * "Dissoudre" and "Retirer" carry a native `confirm` through the button's
 * `formNoValidate`-free path — there is none. They are irreversible and the
 * confirmation is the sentence next to them, which is the honest version: a
 * dialog nobody reads is not consent.
 */
export function ClubControls({
  clubId,
  slug,
  isMember,
  isOwner,
}: {
  clubId: string
  slug: string
  isMember: boolean
  isOwner: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {isMember ? (
        /* The owner is a member of their own club and may leave it like anyone
           else; what they cannot do is stop owning it. Dissolving is the other
           gesture, and it is next to this one rather than hidden behind it. */
        <form action={leaveClub}>
          <input type="hidden" name="clubId" value={clubId} />
          <input type="hidden" name="slug" value={slug} />
          <Button type="submit" variant="secondary" size="sm">
            {copy.leave}
          </Button>
        </form>
      ) : (
        <form action={joinClub}>
          <input type="hidden" name="clubId" value={clubId} />
          <input type="hidden" name="slug" value={slug} />
          <Button type="submit" size="sm">
            {copy.join}
          </Button>
        </form>
      )}

      {isOwner ? (
        <form action={deleteClub} className="flex items-center gap-2">
          <input type="hidden" name="clubId" value={clubId} />
          <Button type="submit" variant="ghost" size="sm">
            {copy.delete}
          </Button>
          <span className="text-ink-faint measure text-xs leading-relaxed">
            {copy.deleteConfirm}
          </span>
        </form>
      ) : null}
    </div>
  )
}

/** One member, and — for the owner alone — the control that removes them. */
export function MemberRow({
  member,
  clubId,
  slug,
  removable,
}: {
  member: PersonRow
  clubId: string
  slug: string
  removable: boolean
}) {
  return (
    <li className="border-rule bg-surface flex items-center justify-between gap-3 rounded-[3px] border px-4 py-2">
      <Link
        href={routes.member(member.handle)}
        className="text-ink hover:text-accent text-sm transition-colors duration-(--duration-quick)"
      >
        {member.display_name ?? member.handle}
        <span className="text-ink-faint ml-2 text-xs">@{member.handle}</span>
      </Link>

      {removable ? (
        <form action={removeClubMember}>
          <input type="hidden" name="clubId" value={clubId} />
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="userId" value={member.id} />
          <Button type="submit" variant="ghost" size="sm">
            {copy.remove}
          </Button>
        </form>
      ) : null}
    </li>
  )
}
