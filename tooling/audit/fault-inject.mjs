/**
 * Casser une lecture, et une seule, pour voir ce que la page en fait.
 *
 * Chargé par `--import` DEVANT le serveur Next, comme `trace-roundtrips.mjs`,
 * et jamais importé par l'application : rien de ce fichier ne part en
 * production.
 *
 *   NODE_OPTIONS="--import ./tooling/audit/fault-inject.mjs" \
 *   VITOLA_FAIL_MATCH='select=origin_country' pnpm start --port 3100
 *
 * `VITOLA_FAIL_MATCH` est une liste de fragments séparés par des virgules ;
 * toute requête vers PostgREST dont l'URL en contient un reçoit un **502**,
 * exactement ce que Kong a rendu le 14 septembre 2026.
 *
 * ## Pourquoi ce fichier existe
 *
 * L'ADR 0020 dit ce qu'une page doit faire d'un échec accessoire. La seule
 * façon de le VÉRIFIER est d'en provoquer un : une panne réelle casse tout à
 * la fois, donc le sujet tombe avec l'accompagnement et on ne voit jamais la
 * moitié intéressante. Il faut casser une lecture pendant que les autres
 * répondent.
 *
 * C'est aussi le seul moyen de distinguer les deux verdicts que la règle
 * sépare : une page qui rend 200 avec un encart « indisponible » et une page
 * qui rend l'écran d'erreur. Sans injection, les deux se ressemblent sur un
 * site qui marche.
 */

import { appendFileSync } from 'node:fs'

const patterns = (process.env.VITOLA_FAIL_MATCH ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter((value) => value !== '')

if (patterns.length > 0) {
  const nativeFetch = globalThis.fetch
  const log = process.env.VITOLA_FAIL_LOG

  globalThis.fetch = async function faultyFetch(input, init) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const hit = url ? patterns.find((pattern) => url.includes(pattern)) : undefined
    if (!hit) return nativeFetch(input, init)

    if (log) appendFileSync(log, `${JSON.stringify({ t: Date.now(), url, pattern: hit })}\n`)
    /* La forme exacte de la panne du 14 septembre : une réponse du proxy, pas
       une erreur de transport. Le corps est celui de Kong. */
    return new Response('<html><body>Bad Gateway</body></html>', {
      status: 502,
      statusText: 'Bad Gateway',
      headers: { 'content-type': 'text/html' },
    })
  }

  console.log(`[fault] 502 sur toute lecture contenant : ${patterns.join(', ')}`)
}
