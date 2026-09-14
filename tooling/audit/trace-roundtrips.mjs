/**
 * Le compteur d'allers-retours — la moitié serveur.
 *
 * Chargé par `--import` DEVANT le serveur Next, jamais importé par
 * l'application : rien de ce fichier ne part en production, et le dépôt n'a
 * pas une ligne de code de mesure dans `app/` ou `lib/`.
 *
 *   NODE_OPTIONS="--import ./tooling/audit/trace-roundtrips.mjs" \
 *   VITOLA_TRACE_FILE=/tmp/roundtrips.jsonl pnpm start --port 3100
 *
 * Il enveloppe `globalThis.fetch`, que `@supabase/supabase-js` utilise faute
 * d'un `fetch` à lui, et écrit une ligne JSON par appel à PostgREST : l'heure,
 * la méthode, la table ou la fonction visée, la durée, le statut.
 *
 * **Pourquoi pas lire le code.** Le point 2 de l'audit du 14 septembre demande
 * un compte mesuré et non un compte supposé, et la raison est dans le dépôt :
 * `lib/CLAUDE.md` promet « trois allers-retours » pour le carnet et « un seul
 * appel » pour le fil, promesses écrites avant sept migrations et deux refontes.
 * Une promesse tenue par une discipline se vérifie en comptant, pas en relisant
 * la phrase qui la porte.
 */

import { appendFileSync } from 'node:fs'

const traceFile = process.env.VITOLA_TRACE_FILE
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

/**
 * Un traceur qui ne trace rien doit le DIRE.
 *
 * Sa première version se taisait : `NEXT_PUBLIC_SUPABASE_URL` vit dans
 * `.env.local`, que Next lit lui-même APRÈS ce préchargement, donc la variable
 * était vide, la garde sautait tout, le serveur démarrait normalement et le
 * fichier de trace restait vide. Un compte de zéro aller-retour se serait lu
 * comme une bonne nouvelle. C'est la lacune de l'audit a11y dans une autre
 * peau : « un contrôle qui ne trouve pas sa cible est une lacune, pas un
 * verdict favorable ». Le serveur refuse donc de démarrer.
 */
if (traceFile) {
  if (!supabaseUrl) {
    throw new Error(
      'trace-roundtrips: VITOLA_TRACE_FILE est posé mais NEXT_PUBLIC_SUPABASE_URL est vide. ' +
        'Ce préchargement tourne avant que Next ne lise .env.local — passe la variable ' +
        'explicitement : NEXT_PUBLIC_SUPABASE_URL=… NODE_OPTIONS="--import …" pnpm start',
    )
  }
  const origin = new URL(supabaseUrl).origin
  const nativeFetch = globalThis.fetch

  /** `/rest/v1/reviews?select=…` devient `reviews`, `/rest/v1/rpc/feed_page` devient `rpc:feed_page`. */
  function target(pathname) {
    const rest = pathname.replace(/^\/rest\/v1\//, '')
    if (rest.startsWith('rpc/')) return `rpc:${rest.slice(4)}`
    if (pathname.startsWith('/auth/v1/')) return `auth:${pathname.slice('/auth/v1/'.length)}`
    return rest
  }

  globalThis.fetch = async function tracedFetch(input, init) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!url || !url.startsWith(origin)) return nativeFetch(input, init)

    const started = Date.now()
    const parsed = new URL(url)
    let status = 0
    try {
      const response = await nativeFetch(input, init)
      status = response.status
      return response
    } catch (error) {
      status = -1
      throw error
    } finally {
      appendFileSync(
        traceFile,
        `${JSON.stringify({
          t: started,
          ms: Date.now() - started,
          method:
            (typeof input === 'object' && 'method' in input ? input.method : init?.method) ?? 'GET',
          target: target(parsed.pathname),
          status,
          side: 'server',
        })}\n`,
      )
    }
  }

  console.log(`[trace] compteur d'allers-retours actif → ${traceFile}`)
}
