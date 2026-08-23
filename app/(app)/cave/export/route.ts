import { CSV_COLUMNS, csvLine } from '@/lib/humidor/model'
import { listAllLots } from '@/lib/humidor/queries'
import { currentUser } from '@/lib/supabase/server'

/**
 * The inventory, as a file (§5.5 asks for import and export).
 *
 * A route handler rather than a Server Action, for the reason the DSA endpoint
 * gave first: an action returns a value to a component, and what is wanted here
 * is a *download*. A browser given `Content-Disposition: attachment` already
 * knows what to do; anything else would mean building a blob in the client to
 * work around not having said so.
 *
 * The rows come back under the member's own RLS — `listAllLots()` names no
 * `user_id`, and does not have to. There is therefore no filter in this file
 * that could be forgotten, which is the point of doing it this way.
 *
 * `no-store, private` for the same reason `/api/gdpr/export` carries it: this
 * is a file of somebody's possessions, and a shared cache holding it would be a
 * disclosure nobody performed.
 */
export async function GET(): Promise<Response> {
  const user = await currentUser()
  if (!user) return new Response('', { status: 401 })

  const lots = await listAllLots()

  const lines = [
    csvLine(CSV_COLUMNS),
    ...lots.map((lot) =>
      csvLine([
        /* A lot whose cigar was unpublished after it was shelved exports with
           an empty slug rather than being dropped: a line one can see and fix
           beats a count that no longer adds up. */
        lot.cigar?.slug ?? '',
        lot.qty,
        lot.purchase_date,
        lot.purchase_price_eur,
        lot.currency,
        lot.vendor_name,
        lot.box_code,
        lot.position,
        lot.aging_start_date,
        lot.notes,
      ]),
    ),
  ]

  /* A BOM, because the first thing anyone does with this file is open it in a
     spreadsheet, and the two most common ones read a UTF-8 CSV as Latin-1
     without it. "Boîte" is not a rare word here. */
  const body = `﻿${lines.join('\r\n')}\r\n`

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="vitola-cave.csv"',
      'Cache-Control': 'no-store, private',
    },
  })
}
