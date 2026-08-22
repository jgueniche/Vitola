import Link from 'next/link'

import { Band } from '@/components/band/band'
import { routes } from '@/lib/routes'

export default function NotFound() {
  return (
    <main id="contenu" className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-24">
      <Band variant="divider" />
      <p className="eyebrow">Page introuvable</p>
      <h1 className="font-display text-4xl">Cette page n&apos;existe pas.</h1>
      <p className="text-ink-muted measure">
        Le lien est peut-être ancien, ou la fiche a été fusionnée avec une autre.
      </p>
      <Link href={routes.home()} className="text-accent text-sm underline underline-offset-4">
        Revenir à l&apos;accueil
      </Link>
    </main>
  )
}
