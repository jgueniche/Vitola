/**
 * Builds supabase/seed/seed_standalone.sql from seed.sql and the CSVs.
 *
 * Why it exists: `\copy` is a psql meta-command. It cannot run in the Supabase
 * web SQL editor, which is the only way in when the CLI or the connector is not
 * available. The standalone file inlines the CSV rows as INSERT ... VALUES and
 * changes NOTHING else — the transformation, the conflict handling and the
 * integrity checks are the very same statements, taken verbatim from seed.sql.
 * Duplicating that logic would guarantee it drifts.
 *
 *   pnpm tsx tooling/scripts/build-standalone-seed.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SEED = join(process.cwd(), 'supabase/seed')

/** Minimal RFC 4180 reader. A dependency for this would not survive §3. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else quoted = false
      } else field += char
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c !== ''))
}

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`

function valuesBlock(table: string, csvFile: string): string {
  const rows = parseCsv(readFileSync(join(SEED, csvFile), 'utf8'))
  const body = rows.slice(1) // drop the header
  const chunks: string[] = []
  // Chunked so no single statement grows unreasonably long for the web editor.
  for (let i = 0; i < body.length; i += 200) {
    const slice = body.slice(i, i + 200)
    chunks.push(
      `insert into ${table} values\n` +
        slice.map((r) => `  (${r.map(quote).join(', ')})`).join(',\n') +
        ';',
    )
  }
  return chunks.join('\n\n')
}

const source = readFileSync(join(SEED, 'seed.sql'), 'utf8')

const rebuilt = source
  .split('\n')
  .map((line) => {
    const copy = /^\\copy (\w+) from '([^']+)'/.exec(line)
    if (copy?.[1] && copy[2]) return valuesBlock(copy[1], copy[2])
    // psql meta-commands have no meaning in the web editor.
    if (/^\\(set|echo|pset)\b/.test(line)) return null
    return line
  })
  .filter((line): line is string => line !== null)
  .join('\n')

const header = `-- =============================================================================
-- GÉNÉRÉ — ne pas éditer à la main.
--   pnpm tsx tooling/scripts/build-standalone-seed.ts
--
-- Version autonome de seed.sql, sans aucune méta-commande psql : destinée à
-- l'éditeur SQL du tableau de bord Supabase, quand ni la CLI ni le connecteur
-- ne sont disponibles.
--
-- À exécuter APRÈS la migration (docs/phase-0/03-schema-p1.sql), qui est déjà
-- du SQL pur et se colle telle quelle.
--
-- La logique est identique à seed.sql, ligne pour ligne : seules les lectures
-- \\copy sont remplacées par les données inlinées.
-- =============================================================================

`

writeFileSync(join(SEED, 'seed_standalone.sql'), header + rebuilt)
const bytes = readFileSync(join(SEED, 'seed_standalone.sql')).length
console.log(`seed_standalone.sql écrit — ${(bytes / 1024).toFixed(0)} Ko`)
