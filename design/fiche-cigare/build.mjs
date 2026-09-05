// Assembles each artboard from src/<Name>.html (body only) and src/shared.css
// into <Name>.dc.html — the Design Components format the canvas editor reads.
// Run: node design/fiche-cigare/build.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, 'src')
const css = readFileSync(join(src, 'shared.css'), 'utf8')

const FONTS =
  'https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400;6..96,500&family=Marcellus&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap'

for (const file of readdirSync(src)) {
  if (!file.endsWith('.html')) continue
  const name = file.replace(/\.html$/, '')
  const body = readFileSync(join(src, file), 'utf8')
  // A fragment may carry its own <script data-dc-script> after a `<!-- logic -->` marker.
  const [markup, logic = ''] = body.split('<!-- logic -->')
  const out = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="${FONTS}">
  <style>
${css}
  </style>
</helmet>
${markup.trim()}
</x-dc>
${logic.trim()}
</body>
</html>
`
  writeFileSync(join(here, `${name}.dc.html`), out)
  process.stdout.write(`wrote ${name}.dc.html (${out.length} chars)\n`)
}
