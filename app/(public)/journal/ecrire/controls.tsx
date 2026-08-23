'use client'

// window.confirm before deleting — an article's links go with it. The other
// status gestures are plain server-action forms in the page itself.
import { deleteArticle } from './actions'
import { Button } from '@/components/ui/button'
import { m } from '@/lib/i18n'

export function DeleteArticleForm({ articleId }: { articleId: string }) {
  return (
    <form
      action={deleteArticle}
      onSubmit={(event) => {
        if (!window.confirm(m.journal.compose.confirmDelete)) event.preventDefault()
      }}
    >
      <input type="hidden" name="articleId" value={articleId} />
      <Button type="submit" variant="secondary" size="sm">
        {m.journal.compose.delete}
      </Button>
    </form>
  )
}
