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

const copy = m.venues.list

/**
 * « Me localiser » — the only client code on the venue list.
 *
 * The position goes into the URL, because that is where interface state lives
 * (app/CLAUDE.md): the resulting search reloads, shares, and survives the back
 * button — and the address bar shows exactly what was sent, which for a
 * geolocation is not a detail.
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
  const [state, setState] = useState<'idle' | 'locating' | 'failed'>('idle')

  function locate() {
    if (!('geolocation' in navigator)) {
      setState('failed')
      return
    }
    setState('locating')
    navigator.geolocation.getCurrentPosition(
      (position) => {
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
      { maximumAge: 60_000, timeout: 10_000 },
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="secondary" onClick={locate} disabled={state === 'locating'}>
        {state === 'locating' ? copy.locating : copy.locate}
      </Button>
      {state === 'failed' ? <FieldError>{copy.locateFailed}</FieldError> : null}
    </div>
  )
}
