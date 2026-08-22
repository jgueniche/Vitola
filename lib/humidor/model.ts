/**
 * The humidor, as rules rather than as queries (ADR 0006).
 *
 * Everything here is pure: the event vocabulary and its signs, the bounds
 * migration 0008 writes as CHECK constraints, the arithmetic that turns a
 * purchase date into an age and a maturity, and the CSV shape. It is the half
 * of the feature a test can hold without a database, which is why `lib/` exists.
 *
 * Two things this file deliberately does NOT contain:
 *
 *   - **any notion of who may read a humidor.** Four owner-only policies decide
 *     that, and P3 will add a fifth for `privacy.show_humidor` rather than edit
 *     one. A TypeScript filter here would double a policy and outlive it — the
 *     same rule ADR 0004 states for the notebook, and it is not weaker because
 *     the current answer is "only me".
 *
 *   - **any writing of `qty`.** It is not exposed as a settable value anywhere
 *     in this module. The GRANT already refuses it (ADR 0006, D3); this file
 *     simply never offers the shape that would tempt someone to try.
 */

import type { Database } from '@/lib/supabase/database.types'

export type HumidorEventType = Database['public']['Enums']['humidor_event_type']
export type HumidorReadingSource = Database['public']['Enums']['humidor_reading_source']

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The six of the brief's §5.5, in the order the ledger reads best.
 *
 * All six exist in the enum; only four are offered as a *gesture*, and the two
 * that are not are not missing features:
 *
 *   - `add` is written by a trigger when a lot is born, never by a button. A
 *     second way to add stock would be a second way to disagree with it.
 *   - `move` is written by a trigger when a lot changes humidor. Moving is an
 *     update of `humidor_id`, so offering a "move" event would let the two
 *     disagree — the lot in one cave, the ledger saying another.
 */
export const HUMIDOR_EVENT_TYPES = [
  'add',
  'smoke',
  'gift',
  'loss',
  'move',
  'adjust',
] as const satisfies readonly HumidorEventType[]

/** The ones a member performs from a form. See above for the other two. */
export const OFFERED_EVENT_TYPES = ['smoke', 'gift', 'loss', 'adjust'] as const

export type OfferedEventType = (typeof OFFERED_EVENT_TYPES)[number]

/**
 * The sign of an event, mirroring `public.humidor_event_delta()`.
 *
 * Duplicated from SQL on purpose, and it is the *only* duplication in this file
 * that is not a bound. The stock a member is about to see must be computable
 * before the round trip — "il vous en restera 4" is a sentence one reads before
 * confirming, not after. `tests/unit/humidor-model.test.ts` reads migration 0008
 * and fails if the two ever disagree.
 */
export function eventDelta(type: HumidorEventType, qty: number): number {
  switch (type) {
    case 'add':
      return qty
    case 'smoke':
    case 'gift':
    case 'loss':
      return -qty
    case 'adjust':
      return qty
    case 'move':
      return 0
  }
}

/** Whether this type takes stock away, and therefore needs enough of it. */
export function consumesStock(type: HumidorEventType): boolean {
  return eventDelta(type, 1) < 0
}

/* -------------------------------------------------------------------------- */
/* Bounds — the CHECK constraints of 0008, restated so a refusal is a sentence */
/* -------------------------------------------------------------------------- */

export const HUMIDOR_LIMITS = {
  nameMax: 80,
  capacityMin: 1,
  capacityMax: 100000,
  rhMin: 0,
  rhMax: 100,
  tempMin: -20,
  tempMax: 60,
  qtyMin: 1,
  qtyMax: 100000,
  priceMin: 0,
  priceMax: 1000000,
  vendorMax: 120,
  boxCodeMax: 40,
  positionMax: 60,
  notesMax: 2000,
} as const

/* -------------------------------------------------------------------------- */
/* Derived readings — §5.5, and ADR 0006 D5 on why none of them is a column    */
/* -------------------------------------------------------------------------- */

/**
 * Where a lot sits on its ageing curve.
 *
 * The §5.5 asks for a "courbe paramétrable par famille". This v1 is **not**
 * that, and says so rather than pretending: the referential holds no ageing
 * data per family — no maker's guidance, no measured plateau — and inventing
 * four thresholds per marque would dress a guess as a fact, which `PROVENANCE`
 * forbids for the referential and which is no better here.
 *
 * What ships instead is one coarse curve, the same for every cigar, with its
 * thresholds written where they can be read and argued with. It answers the
 * question a member actually asks — "is this one ready?" — at the resolution
 * the data supports, and it is one table away from being per-family the day a
 * family curve exists.
 */
export const MATURITY_STAGES = ['fresh', 'settling', 'ready', 'mature'] as const
export type MaturityStage = (typeof MATURITY_STAGES)[number]

/** Days at which each stage begins. Deliberately round: they are not measured. */
export const MATURITY_THRESHOLDS = { settling: 90, ready: 365, mature: 1095 } as const

export function maturityStage(agingDays: number | null): MaturityStage | null {
  if (agingDays === null || agingDays < 0) return null
  if (agingDays >= MATURITY_THRESHOLDS.mature) return 'mature'
  if (agingDays >= MATURITY_THRESHOLDS.ready) return 'ready'
  if (agingDays >= MATURITY_THRESHOLDS.settling) return 'settling'
  return 'fresh'
}

/**
 * A lot worth turning over: old enough to be past its sleep, never touched.
 *
 * Eighteen months, and the reason for that number rather than a rounder one is
 * that it sits between `ready` and `mature`: a lot one has never opened by then
 * is one that is being forgotten rather than aged. The alert is a nudge, so it
 * errs towards saying nothing — a cave that flags everything flags nothing.
 */
export const ROTATION_DAYS = 540

export function needsRotation(agingDays: number | null, lastSmokedOn: string | null): boolean {
  return agingDays !== null && agingDays >= ROTATION_DAYS && lastSmokedOn === null
}

/** How full a humidor is, as a ratio, or null when it declares no capacity. */
export function fillRatio(total: number, capacity: number | null): number | null {
  if (capacity === null || capacity <= 0) return null
  return total / capacity
}

/* -------------------------------------------------------------------------- */
/* CSV — §5.5 asks for import and export                                      */
/* -------------------------------------------------------------------------- */

/**
 * The columns of the interchange file, in order.
 *
 * The cigar is named by its **slug** and not by its uuid, which is the whole
 * design of this format: a uuid is meaningless outside this database, so an
 * export carrying one is a file one can read back and nothing else. A slug is
 * legible, stable, and is what the URL already uses.
 *
 * `qty` is exported and imported because an import *creates* lots — an opening
 * balance, which ADR 0006 D3 says is an insert. Importing does not, and cannot,
 * adjust an existing stock: that would be the "code appelant qui écrit qty"
 * the ADR refuses.
 */
export const CSV_COLUMNS = [
  'cigar_slug',
  'qty',
  'purchase_date',
  'purchase_price_eur',
  'currency',
  'vendor_name',
  'box_code',
  'position',
  'aging_start_date',
  'notes',
] as const

export type CsvColumn = (typeof CSV_COLUMNS)[number]

/** RFC 4180 quoting: only what needs quoting is quoted, and `"` doubles. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function csvLine(cells: readonly (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(',')
}

/**
 * Splits one CSV line, honouring quotes.
 *
 * Hand-written rather than taken from a dependency, per §3: the format we read
 * is the format we wrote, one line at a time, and a parser for it is fifteen
 * lines. A library would be a supply-chain decision made to avoid them.
 */
export function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i] ?? ''

    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
      continue
    }

    if (char === '"' && cell === '') quoted = true
    else if (char === ',') {
      cells.push(cell)
      cell = ''
    } else cell += char
  }

  cells.push(cell)
  return cells
}

export type CsvRow = Partial<Record<CsvColumn, string>>

export type CsvParse = { rows: CsvRow[]; error?: string }

/**
 * Reads a whole file into rows keyed by header name.
 *
 * Keyed by the header rather than by position, so a file whose columns were
 * reordered in a spreadsheet still imports. The two columns that matter are
 * required; the rest are optional, because an inventory typed by hand is
 * mostly "this cigar, that many" and demanding eight empty fields would make
 * the feature unusable for the case it exists for.
 */
export function parseCsv(text: string): CsvParse {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')

  const [headerLine, ...bodyLines] = lines
  if (headerLine === undefined) return { rows: [], error: 'empty' }

  const header = parseCsvLine(headerLine).map((name) => name.trim().toLowerCase())
  if (!header.includes('cigar_slug') || !header.includes('qty')) {
    return { rows: [], error: 'header' }
  }

  const rows: CsvRow[] = []
  for (const line of bodyLines) {
    const cells = parseCsvLine(line)
    const row: CsvRow = {}
    header.forEach((name, index) => {
      if ((CSV_COLUMNS as readonly string[]).includes(name)) {
        row[name as CsvColumn] = (cells[index] ?? '').trim()
      }
    })
    rows.push(row)
  }

  return { rows }
}
