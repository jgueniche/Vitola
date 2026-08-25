/**
 * Fails when `lib/supabase/database.types.ts` no longer describes the schema.
 *
 * The failure this exists for is silent and this session hit it twice: a
 * migration adds a table, nobody regenerates the types, and the next query
 * against it type-checks against a `Database` that has never heard of it — so
 * `supabase.from('humidors')` is an error nobody sees until a page 500s.
 *
 * It compares an **inventory dumped by psql** against the types file, so it
 * needs no database driver: `pg` was deliberately not added as a dependency
 * (§3), and `supabase gen types` would need the CLI and a network. The
 * inventory is produced by the same `db.yml` job that has just applied every
 * migration, which means what is compared is the schema the migrations build
 * rather than whatever a project happens to hold.
 *
 *   psql -tAc "$(cat tooling/scripts/schema-inventory.sql)" > inventory.json
 *   pnpm tsx tooling/scripts/check-types-drift.ts inventory.json
 *
 * It is deliberately a **presence** check and not a shape check. Comparing every
 * column's nullability would re-implement the generator, and a check that
 * duplicates what it verifies fails for its own reasons. What it catches is the
 * thing that actually happens: a table, a view, an enum or a callable function
 * that exists in one place and not the other.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Inventory = {
  schema: string
  kind: 'table' | 'view' | 'enum' | 'function'
  name: string
}[]

const TYPES_PATH = join(process.cwd(), 'lib/supabase/database.types.ts')

/** Schemas PostgREST exposes, which are the only ones the types describe. */
const EXPOSED = ['public', 'ref', 'shop']

function fail(lines: string[]): never {
  console.error('\ncheck-types-drift: la base et database.types.ts ne se correspondent plus.\n')
  for (const line of lines) console.error(`  ${line}`)
  console.error(
    '\nRégénérer les types depuis le projet Supabase, ou ajouter à la main ce qui manque —',
  )
  console.error('les deux sont acceptables, une divergence non signalée ne l’est pas.\n')
  process.exit(1)
}

function main(): void {
  const inventoryPath = process.argv[2]
  if (!inventoryPath) {
    console.error('usage: check-types-drift.ts <inventory.json>')
    process.exit(2)
  }

  const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8')) as Inventory
  const types = readFileSync(TYPES_PATH, 'utf8')

  if (inventory.length === 0) {
    // Guards the guard: an empty inventory would make every check below pass.
    fail(["l'inventaire est vide — la requête psql n'a rien renvoyé"])
  }

  const problems: string[] = []

  for (const entry of inventory) {
    if (!EXPOSED.includes(entry.schema)) continue

    /*
     * The generator writes each name as an object key at some indentation, so a
     * name followed by `: {` is the reliable signal for a table or a view, and
     * a name followed by `:` for an enum or a function. Matching on the bare
     * name would find it in a comment; matching on the key does not.
     */
    const asKey = new RegExp(`^\\s+${entry.name}: `, 'm')
    if (!asKey.test(types)) {
      problems.push(`absent des types : ${entry.schema}.${entry.name} (${entry.kind})`)
    }
  }

  /*
   * And the other direction. A type describing a table that no longer exists is
   * how a query keeps compiling after the migration that dropped it — the exact
   * mirror of the first failure, and the one nobody thinks to look for.
   *
   * Six spaces is where the generator puts a table, a view or a function name;
   * four is where it puts the section headers, eight the `Row`/`Insert` keys.
   * Matching the indentation is what keeps this from finding a word in a
   * comment.
   */
  const known = new Set(inventory.map((entry) => entry.name))
  for (const match of types.matchAll(/^ {6}(\w+): \{$/gm)) {
    const name = match[1]
    if (!name) continue
    if (name === 'Row' || name === 'Insert' || name === 'Update' || name === 'Relationships') {
      continue
    }
    if (!known.has(name)) {
      problems.push(`décrit dans les types mais absent de la base : ${name}`)
    }
  }

  if (problems.length > 0) fail(problems)

  console.log(
    `check-types-drift: OK — ${inventory.filter((entry) => EXPOSED.includes(entry.schema)).length} objets exposés, tous décrits.`,
  )
}

main()
