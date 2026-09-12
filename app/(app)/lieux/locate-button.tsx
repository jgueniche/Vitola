'use client'

// navigator.geolocation + router.push: the position is read on the device, at
// the moment the person asks, and leaves the browser only as two URL numbers —
// there is no server-rendered path to a sensor.
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { GEOLOCATION, isCoarse } from '@/lib/venues/geolocation'

const copy = m.venues.list

/**
 * « Me localiser » — the only client code on the venue list.
 *
 * The position goes into the URL, because that is where interface state lives
 * (app/CLAUDE.md): the resulting search reloads, shares, and survives the back
 * button — and the address bar shows exactly what was sent, which for a
 * geolocation is not a detail.
 *
 * **The bug this fixes, and it was mine.** QA of 12 septembre 2026: « corriger
 * la fonction me localiser elle marche mal, il faut la recaler de façon
 * beaucoup plus précise — on était à Marnes-la-Coquette et il nous sortait des
 * lieux dans Paris 13 ». Marnes-la-Coquette to the 13th arrondissement is
 * about 14 km, which is not drift — it is a different position entirely, and
 * the options told the browser to produce it:
 *
 *   - `enableHighAccuracy` was absent, so it defaults to false. The browser is
 *     then free to answer from the cheapest source it has, which on a desk
 *     without GPS is the IP address — and an IP resolves to the operator's
 *     point of presence. Paris 13 is where an IP lands, not where anyone was.
 *   - `maximumAge: 60_000` accepted a cached fix up to a minute old, which on a
 *     phone in a car is a different street and on a laptop is whatever the last
 *     site asked for.
 *
 * So: high accuracy, no cache, and a longer timeout because a real fix takes
 * longer than a lookup. The third part is the one that matters most, though,
 * and it is not an option: the browser REPORTS how wrong it might be, in
 * `coords.accuracy`, in metres. A 15 km radius of uncertainty was always in
 * the answer and nobody read it. Now a coarse fix is refused with a sentence
 * that says why, instead of silently searching around a telephone exchange.
 */
export function LocateButton({
  radiusKm,
  type,
  q,
}: {
  radiusKm: number
  type?: string
  q?: string
}) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'locating' | 'failed' | 'coarse'>('idle')

  function locate() {
    if (!('geolocation' in navigator)) {
      setState('failed')
      return
    }
    setState('locating')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        /* The browser's own estimate of how wrong it might be. Refusing a
           coarse fix is the whole fix: a position accurate to ±15 km searched
           a radius that did not contain the person asking. */
        if (isCoarse(position.coords.accuracy)) {
          setState('coarse')
          return
        }

        const params = new URLSearchParams()
        params.set('lat', position.coords.latitude.toFixed(5))
        params.set('lng', position.coords.longitude.toFixed(5))
        params.set('rayon', String(radiusKm))
        if (type) params.set('type', type)
        if (q) params.set('q', q)
        router.push(`${routes.venues()}?${params.toString()}`)
        setState('idle')
      },
      () => setState('failed'),
      {
        enableHighAccuracy: true,
        maximumAge: GEOLOCATION.maximumAgeMs,
        timeout: GEOLOCATION.timeoutMs,
      },
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="secondary" onClick={locate} disabled={state === 'locating'}>
        {state === 'locating' ? copy.locating : copy.locate}
      </Button>
      {state === 'failed' ? <FieldError>{copy.locateFailed}</FieldError> : null}
      {state === 'coarse' ? (
        <FieldError>
          {copy.locateCoarse.replace('{km}', String(GEOLOCATION.maxAccuracyMetres / 1000))}
        </FieldError>
      ) : null}
    </div>
  )
}
