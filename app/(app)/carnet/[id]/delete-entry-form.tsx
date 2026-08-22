'use client'

// A client component for one reason: window.confirm. Deleting an entry takes
// its thirds and its shares with it by cascade, and that is worth one question
// before it happens. Same pattern as the comment's delete control.

import { Button } from '@/components/ui/button'
import { m } from '@/lib/i18n'

import { deleteEntry } from '../actions'

const copy = m.notebook.entry

export function DeleteEntryForm({ id }: { id: string }) {
  return (
    <form
      action={deleteEntry}
      onSubmit={(event) => {
        if (!window.confirm(copy.deleteConfirm)) event.preventDefault()
      }}
      className="border-rule flex flex-wrap items-center gap-4 border-t pt-6"
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" className="text-negative">
        {copy.delete}
      </Button>
      {/* The consequence is written out as well as asked, because someone with
          JavaScript off never sees the confirm and should still be told. */}
      <p className="text-ink-faint measure text-xs leading-relaxed">{copy.deleteConfirm}</p>
    </form>
  )
}
