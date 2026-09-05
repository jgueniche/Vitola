import type { Metadata } from 'next'

import { isKnownFlag } from '@/lib/admin/flags'
import { listFlags } from '@/lib/admin/queries'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'

import { AdminRestricted, adminView } from '../shell'
import { FlagForm } from './flag-form'

export const metadata: Metadata = { title: m.admin.flagsScreen.title }

const copy = m.admin

type FlagCopy = { label: string; description: string; warning?: string }

/**
 * The flags — the one place ADR 0014 opened a door for.
 *
 * The list comes from the table, not from the registry: a flag a future
 * migration adds appears here without anybody editing a file, carrying its
 * stored English description until `messages/fr.json` learns it. The registry
 * only adds what a table cannot say — the French copy, the payload shape, and
 * whether the flag is a published commitment.
 */
export default async function AdminFlagsPage() {
  const isAdmin = await adminView(routes.adminFlags())
  if (!isAdmin) return <AdminRestricted />

  const flags = await listFlags()
  const flagCopy = copy.flags as Record<string, FlagCopy>

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="font-display text-display-md leading-tight">{copy.flagsScreen.title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.flagsScreen.lede}</p>
      </div>

      <ul className="flex flex-col gap-4">
        {flags.map((flag) => {
          const known = isKnownFlag(flag.key)
          const info = known ? flagCopy[flag.key] : undefined
          return (
            <li key={flag.key} className="border-rule bg-surface rounded-[3px] border p-4">
              <FlagForm
                flagKey={flag.key}
                enabled={flag.enabled}
                payload={flag.payload}
                updatedAt={flag.updated_at}
                label={info?.label ?? flag.key}
                description={
                  info?.description ?? `${copy.flagsScreen.unknownFlag} ${flag.description}`
                }
                warning={info?.warning}
              />
            </li>
          )
        })}
      </ul>
    </main>
  )
}
