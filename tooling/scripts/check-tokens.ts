/**
 * Design-system and brand guardrails, enforced in CI.
 *
 * ESLint covers what is expressible as an import or syntax rule. These four are
 * text-level and must also cover CSS and JSON, which is why they live here:
 *
 *   1. no raw hex colour outside app/globals.css
 *   2. no raw palette utility (bg-maduro, text-parchemin…) in a component
 *   3. no emoji anywhere in the interface (§4.3)
 *   4. no hard-coded brand name outside lib/brand.ts (§1)
 *
 * Rule 2 is the one that keeps the theme switchable: a component reaching for a
 * pigment instead of a semantic token silently breaks light mode.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SCANNED_DIRS = ['app', 'components', 'lib', 'messages']
const SCANNED_EXTENSIONS = ['.ts', '.tsx', '.css', '.json']

/** The files allowed to name a colour. */
const TOKEN_SOURCE = 'app/globals.css'
/** Exception: meta tags and OG images cannot read a CSS custom property. */
const THEME_CONSTANTS_SOURCE = 'lib/theme.ts'
/** The one file allowed to name the brand. */
const BRAND_SOURCE = 'lib/brand.ts'

const RAW_PALETTE = [
  'oscuro',
  'maduro',
  'maduro-raised',
  'cedre',
  'cedre-readable',
  'colorado',
  'colorado-readable',
  'claro',
  'claro-bright',
  'parchemin',
  'fumee',
  'papier',
  'encre',
  'succes',
  'succes-readable',
  'alerte',
  'erreur',
  'erreur-readable',
]

const UTILITY_PREFIXES = ['bg', 'text', 'border', 'ring', 'fill', 'stroke', 'from', 'to', 'via']

const HEX_COLOUR = /#[0-9a-fA-F]{3,8}\b/g
const EMOJI =
  /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu
const BRAND_LITERAL = /\bVitola\b/g

/**
 * Blanks out comment content while preserving line and column positions, so
 * reported line numbers stay accurate. Comments explain why something is
 * absent — asserting on them produces false positives, as this script itself
 * demonstrated on band.tsx ("Vitola or commercial name" in a JSDoc).
 */
function maskComments(source: string): string {
  let inBlock = false
  return source
    .split('\n')
    .map((line) => {
      let output = ''
      let index = 0
      while (index < line.length) {
        if (inBlock) {
          const end = line.indexOf('*/', index)
          if (end === -1) {
            output += ' '.repeat(line.length - index)
            index = line.length
          } else {
            output += ' '.repeat(end + 2 - index)
            index = end + 2
            inBlock = false
          }
          continue
        }
        if (line.startsWith('/*', index)) {
          inBlock = true
          output += '  '
          index += 2
          continue
        }
        if (line.startsWith('//', index)) {
          output += ' '.repeat(line.length - index)
          index = line.length
          continue
        }
        output += line[index]
        index += 1
      }
      return output
    })
    .join('\n')
}

type Violation = { file: string; line: number; rule: string; detail: string }

function collect(dir: string, acc: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return acc
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) collect(full, acc)
    else if (SCANNED_EXTENSIONS.some((ext) => full.endsWith(ext))) acc.push(full)
  }
  return acc
}

function paletteUtilityPattern(): RegExp {
  // Matches `bg-maduro`, `text-parchemin/70`, `hover:border-cedre` — but never
  // `bg-shade-maduro`, which is the data-visualisation ramp and is allowed.
  const names = RAW_PALETTE.map((n) => n.replace(/-/g, '\\-')).join('|')
  const prefixes = UTILITY_PREFIXES.join('|')
  return new RegExp(`(?<![\\w-])(?:${prefixes})-(?:${names})(?![\\w-])`, 'g')
}

function check(): Violation[] {
  const violations: Violation[] = []
  const files = SCANNED_DIRS.flatMap((dir) => collect(join(ROOT, dir)))
  const utilityPattern = paletteUtilityPattern()

  for (const file of files) {
    const rel = relative(ROOT, file)
    const raw = readFileSync(file, 'utf8')
    // JSON has no comments; masking would be a no-op but costs nothing.
    const lines = maskComments(raw).split('\n')

    lines.forEach((line, index) => {
      const at = index + 1

      if (rel !== TOKEN_SOURCE && rel !== THEME_CONSTANTS_SOURCE) {
        for (const match of line.matchAll(HEX_COLOUR)) {
          violations.push({
            file: rel,
            line: at,
            rule: 'raw-hex',
            detail: `${match[0]} — declare it in ${TOKEN_SOURCE} and use a semantic token`,
          })
        }
      }

      if (rel !== TOKEN_SOURCE) {
        for (const match of line.matchAll(utilityPattern)) {
          violations.push({
            file: rel,
            line: at,
            rule: 'raw-palette-utility',
            detail: `${match[0]} — use a semantic token (bg-surface, text-ink, border-rule…)`,
          })
        }
      }

      for (const match of line.matchAll(EMOJI)) {
        violations.push({
          file: rel,
          line: at,
          rule: 'emoji',
          detail: `${match[0]} — §4.3 forbids emoji in the interface; use a Lucide icon`,
        })
      }

      if (rel !== BRAND_SOURCE) {
        for (const match of line.matchAll(BRAND_LITERAL)) {
          violations.push({
            file: rel,
            line: at,
            rule: 'hard-coded-brand',
            detail: `${match[0]} — import BRAND from @/lib/brand (§1: the name must stay renameable)`,
          })
        }
      }
    })
  }

  return violations
}

const violations = check()

if (violations.length === 0) {
  console.log('check-tokens: OK — no raw hex, no raw palette utility, no emoji, no hard-coded brand.')
  process.exit(0)
}

console.error(`check-tokens: ${violations.length} violation(s)\n`)
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  [${v.rule}]  ${v.detail}`)
}
process.exit(1)
