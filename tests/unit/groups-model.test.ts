import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ATTENDEE_STATUSES,
  CLUB_LIMITS,
  clubSlug,
  countsAsAttending,
  EVENT_KINDS,
  EVENT_LIMITS,
  isAttendeeStatus,
  isEventKind,
  isFull,
  isUpcoming,
  MESSAGE_LIMITS,
} from '@/lib/social/groups'

/**
 * The rules of clubs, events and conversations, checked against the SQL.
 *
 * `lib/social/groups.ts` restates migration 0014's CHECK constraints so a
 * refusal reads as a sentence rather than as `23514`, and it derives a slug
 * that the same migration's CHECK has to accept. Both duplications are
 * deliberate; both are therefore pinned here, because a bound that drifts shows
 * a member an error for a value the database would have taken, and a slug that
 * drifts fails at the moment somebody presses "Créer".
 *
 * `countsAsAttending` is the one piece of *logic* copied rather than a bound —
 * it mirrors `tg_group_counts()`, which counts only `going`. `lib/CLAUDE.md`
 * says why that costs more than a bound: a bound that drifts is clumsy copy, a
 * rule that drifts shows a number the database contradicts, in silence.
 */

const M0014 = readFileSync(
  join(process.cwd(), 'supabase/migrations/0014_clubs_evenements_messagerie.sql'),
  'utf8',
)

describe('the bounds mirror migration 0014', () => {
  it('bounds a club name the way clubs_name_len does', () => {
    const match = /clubs_name_len check \(length\(btrim\(name\)\) between (\d+) and (\d+)\)/.exec(
      M0014,
    )
    expect(match, 'clubs_name_len is no longer in migration 0014').not.toBeNull()
    expect(Number(match?.[1])).toBe(CLUB_LIMITS.nameMin)
    expect(Number(match?.[2])).toBe(CLUB_LIMITS.nameMax)
  })

  it('caps a club description the way clubs_desc_len does', () => {
    const match =
      /clubs_desc_len check \(description is null or length\(description\) <= (\d+)\)/.exec(M0014)
    expect(match, 'clubs_desc_len is no longer in migration 0014').not.toBeNull()
    expect(Number(match?.[1])).toBe(CLUB_LIMITS.descriptionMax)
  })

  it('bounds an event title the way events_title_len does', () => {
    const match =
      /events_title_len check \(length\(btrim\(title\)\) between (\d+) and (\d+)\)/.exec(M0014)
    expect(match, 'events_title_len is no longer in migration 0014').not.toBeNull()
    expect(Number(match?.[1])).toBe(EVENT_LIMITS.titleMin)
    expect(Number(match?.[2])).toBe(EVENT_LIMITS.titleMax)
  })

  it('caps an event description and its place the way the CHECKs do', () => {
    const description =
      /events_desc_len check \(description is null or length\(description\) <= (\d+)\)/.exec(M0014)
    expect(Number(description?.[1])).toBe(EVENT_LIMITS.descriptionMax)

    const location =
      /events_location_len check \(location_text is null or length\(location_text\) <= (\d+)\)/.exec(
        M0014,
      )
    expect(Number(location?.[1])).toBe(EVENT_LIMITS.locationMax)
  })

  it('bounds a capacity the way events_capacity does', () => {
    const match =
      /events_capacity check \(capacity is null or capacity between (\d+) and (\d+)\)/.exec(M0014)
    expect(match, 'events_capacity is no longer in migration 0014').not.toBeNull()
    expect(Number(match?.[1])).toBe(EVENT_LIMITS.capacityMin)
    expect(Number(match?.[2])).toBe(EVENT_LIMITS.capacityMax)
  })

  it('bounds a message the way messages_body_len does', () => {
    const match =
      /messages_body_len check \(length\(btrim\(body\)\) between (\d+) and (\d+)\)/.exec(M0014)
    expect(match, 'messages_body_len is no longer in migration 0014').not.toBeNull()
    expect(Number(match?.[1])).toBe(MESSAGE_LIMITS.bodyMin)
    expect(Number(match?.[2])).toBe(MESSAGE_LIMITS.bodyMax)
  })
})

describe('the vocabularies mirror the enums', () => {
  it('lists exactly the values of public.event_kind', () => {
    const block = /create type public\.event_kind as enum \(([\s\S]*?)\);/.exec(M0014)?.[1] ?? ''
    const values = [...block.matchAll(/'([a-z_]+)'/g)].map((match) => match[1])
    expect(values).toEqual([...EVENT_KINDS])
  })

  it('lists exactly the values of public.attendee_status', () => {
    const block = /create type public\.attendee_status as enum \(([^)]*)\);/.exec(M0014)?.[1] ?? ''
    const values = [...block.matchAll(/'([a-z_]+)'/g)].map((match) => match[1])
    expect(values).toEqual([...ATTENDEE_STATUSES])
  })

  it('recognises a value and refuses anything else', () => {
    expect(isEventKind('degustation')).toBe(true)
    expect(isEventKind('soiree')).toBe(false)
    expect(isEventKind(null)).toBe(false)
    expect(isAttendeeStatus('maybe')).toBe(true)
    expect(isAttendeeStatus('yes')).toBe(false)
  })
})

describe('only "going" counts, exactly as the trigger counts', () => {
  it('mirrors the predicate of tg_group_counts()', () => {
    /* The trigger recomputes with a count filtered on 'going'. If that filter
       ever widens, an event would show a number the screen contradicts. */
    expect(M0014).toMatch(/status = 'going'/)
  })

  it('says yes to going and no to the other two', () => {
    expect(countsAsAttending('going')).toBe(true)
    expect(countsAsAttending('maybe')).toBe(false)
    expect(countsAsAttending('declined')).toBe(false)
  })
})

describe('a slug this produces is one the CHECK accepts', () => {
  const pattern = (() => {
    const match = /clubs_slug_format check \(slug ~ '([^']+)'\)/.exec(M0014)
    expect(match, 'clubs_slug_format is no longer in migration 0014').not.toBeNull()
    return new RegExp(match?.[1] ?? '(?!)')
  })()

  const names = [
    'Les amateurs de maduro',
    'Cigares & Whisky',
    'Château   Margaux',
    'Épicuriens de Lyon',
    '  Espaces  autour  ',
    'A2',
    'Aficionados — Île-de-France',
    'Le club (privé) !',
    'Über-Robusto',
    "L'atelier du fumeur",
  ]

  for (const name of names) {
    it(`accepts the slug of « ${name} »`, () => {
      const slug = clubSlug(name)
      expect(slug.length).toBeGreaterThan(0)
      expect(slug).toMatch(pattern)
    })
  }

  it('strips the diacritics rather than dropping the letters', () => {
    expect(clubSlug('Épicuriens de Lyon')).toBe('epicuriens-de-lyon')
  })

  it('never ends on a hyphen, even when the cut lands on one', () => {
    /* 60 characters is the cut, and a name whose 61st character is the only
       thing after a space would otherwise leave a trailing hyphen — which the
       CHECK refuses. Found by writing the regex, not by a form. */
    const slug = clubSlug(`${'a'.repeat(59)} bcdef`)
    expect(slug.endsWith('-')).toBe(false)
    expect(slug).toMatch(pattern)
  })

  it('gives nothing when there is nothing to give', () => {
    expect(clubSlug('!!!')).toBe('')
  })
})

describe('an event is ahead until it ends', () => {
  const now = new Date('2026-09-10T20:00:00Z')

  it('counts an evening already begun as still ahead', () => {
    expect(
      isUpcoming({ starts_at: '2026-09-10T19:00:00Z', ends_at: '2026-09-10T23:00:00Z' }, now),
    ).toBe(true)
  })

  it('counts one that ended as past', () => {
    expect(
      isUpcoming({ starts_at: '2026-09-09T19:00:00Z', ends_at: '2026-09-09T23:00:00Z' }, now),
    ).toBe(false)
  })

  it('falls back on starts_at when there is no end', () => {
    expect(isUpcoming({ starts_at: '2026-09-11T19:00:00Z', ends_at: null }, now)).toBe(true)
    expect(isUpcoming({ starts_at: '2026-09-09T19:00:00Z', ends_at: null }, now)).toBe(false)
  })
})

describe('a capacity is a courtesy, never a guarantee', () => {
  it('is never full without a capacity', () => {
    expect(isFull({ capacity: null, attendee_count: 999 })).toBe(false)
  })

  it('is full at the capacity and beyond', () => {
    expect(isFull({ capacity: 10, attendee_count: 9 })).toBe(false)
    expect(isFull({ capacity: 10, attendee_count: 10 })).toBe(true)
    expect(isFull({ capacity: 10, attendee_count: 11 })).toBe(true)
  })

  it('has no CHECK behind it, and the migration says so', () => {
    /* If a constraint ever appears comparing attendee_count to capacity, this
       function stops being a courtesy and the screens must stop pretending a
       refusal cannot happen. */
    expect(M0014).not.toMatch(/check \([^)]*attendee_count[^)]*capacity/)
  })
})
