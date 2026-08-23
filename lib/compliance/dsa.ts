/**
 * The reporting mechanism required by the DSA, in one file.
 *
 * The ADR 0005 demands three things together — a mechanism, a queue, a
 * published deadline — and states why: the moment a member's text appears under
 * a cigar entry, we are the publisher of a text about tobacco, and the obligation
 * is the same whoever typed it. The queue is `mod.reports` (migration 0004) and
 * the write path is `public.file_report()` (migration 0006). What lives here is
 * everything the interface and the route need to agree on.
 *
 * Pure and importable by a test, like the rest of `lib/` — the route builds its
 * Zod schema from these lists rather than repeating them, so a reason added to
 * the enum in SQL and to this array cannot be accepted by one and refused by
 * the other.
 */

/**
 * The reasons of `mod.report_reason`, in the order they are offered.
 *
 * Two of the six are specific to this site rather than to the DSA:
 * `tobacco_promotion` (§2, loi Évin) and `inaccurate`. The second is not a
 * wrongdoing — a factual error is a misrouted contribution, and it belongs in
 * the wiki revision queue rather than in moderation. It is offered here anyway
 * because that is where the reader will look for it; sorting it out is the
 * moderator's job, not the reader's.
 */
export const REPORT_REASONS = [
  'tobacco_promotion',
  'illegal_content',
  'harassment',
  'spam',
  'inaccurate',
  'other',
] as const

export type ReportReason = (typeof REPORT_REASONS)[number]

/**
 * What can be reported, and where each thing lives.
 *
 * The keys are what the browser sends; the values are what `mod.reports`
 * stores, and its `reports_entity_known` CHECK constrains that pair to four
 * combinations. Sending a schema and a table straight from the client would
 * work — the CHECK would catch anything else — but it would also mean a public
 * endpoint takes table names as input. It takes a word from a closed list
 * instead, and the mapping happens here.
 *
 * `reviews` joined the map when the notebook shipped, on the rule this comment
 * already stated: an entry here without a Signaler button is a promise nobody
 * can keep, and the converse holds too — a public notebook entry is a member's
 * text about tobacco, readable by any visitor past the age gate, which is the
 * exact situation ADR 0005 says obliges us.
 *
 * P3 adds three at once, and the same rule decides all three. A publication and
 * a reply are members' text about tobacco on a page anyone past the gate can
 * read — the situation ADR 0005 describes, arriving a phase later and more
 * directly. `profiles` was in `reports_entity_known` from migration 0004 and
 * stayed out of this map for one reason only: a profile had no page. It has one
 * now, so it is offered.
 *
 * `messages` is the one that is not like the others, and it is here on purpose
 * rather than by symmetry. A private message is not published, so nothing about
 * ADR 0005 reaches it — what reaches it is art. 16 of the DSA, which asks for a
 * mechanism against *illegal content* wherever it lands, and harassment lands
 * here. ADR 0010 takes the consequence rather than hiding it: a message is not
 * end-to-end encrypted, a moderator can read a reported one, and the privacy
 * policy says so. Offering the button without that sentence would have been
 * the dishonest half of the pair.
 *
 * What is reportable is decided per *surface*, not per row: RLS decides whether
 * the reporter may see the entry at all, and the route asks it that question
 * before filing anything.
 */
export const REPORTABLE = {
  comment: { schema: 'public', table: 'comments' },
  cigar: { schema: 'ref', table: 'cigars' },
  review: { schema: 'public', table: 'reviews' },
  post: { schema: 'public', table: 'posts' },
  postComment: { schema: 'public', table: 'post_comments' },
  profile: { schema: 'public', table: 'profiles' },
  message: { schema: 'public', table: 'messages' },
  /* P5 adds the venue directory (ADR 0011), and the two surfaces arrive for
     different reasons. A venue entry is mostly reported as `inaccurate` — the
     2018 registry ages, shops close, and the report is how a closure reaches
     the `closed` status. A venue review is a member's text about a place that
     sells tobacco: the exact situation ADR 0005 describes, plus the §2
     guardrail — a review inciting consumption is `tobacco_promotion`. */
  venue: { schema: 'public', table: 'venues' },
  venueReview: { schema: 'public', table: 'venue_reviews' },
} as const

export type ReportableKind = keyof typeof REPORTABLE

export const REPORTABLE_KINDS = Object.keys(REPORTABLE) as [ReportableKind, ...ReportableKind[]]

/**
 * The processing deadline we announce, in hours.
 *
 * The real value is `feature_flags.dsa_report_sla_hours`, because a deadline
 * that engages us must be changeable without a deploy. This constant is what
 * the flag was created holding, and it is what the legal notice falls back on
 * when the read fails — a legal page that renders without its deadline would be
 * a page that quietly stops making the commitment.
 *
 * The two are pinned together by `tests/compliance/dsa.test.ts`, which reads
 * migration 0004 and fails if they drift. A fallback that disagrees with the
 * flag is worse than no fallback: it would be wrong exactly when nobody is
 * looking.
 */
export const DSA_SLA_HOURS = 72

/**
 * The single point of contact required by art. 11 and 12 of the DSA.
 *
 * Deliberately null. Publishing an address at a domain nobody owns is worse
 * than saying the channel is not open yet: it is a commitment to read a mailbox
 * that does not exist. Q7 has not chosen a domain, and until it does the
 * in-application form below is the mechanism, which is what art. 16 actually
 * requires — an easily accessible, electronic notice mechanism.
 *
 * Filling this in is one line, and it must happen before the site opens to the
 * public. `docs/legal/checklist-avant-mise-en-ligne.md` carries the item.
 */
export const DSA_CONTACT_EMAIL: string | null = null

/** Whether a string is one of the six reasons. Used by the route and the form. */
export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === 'string' && (REPORT_REASONS as readonly string[]).includes(value)
}
