import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Reads of the talk page of a cigar entry (ADR 0005).
 *
 * No `hidden_at is null` filter, and no `status = 'published'` on the entry:
 * both are `comments_select_visible`, and the ADR's rule for the notebook holds
 * here for the same reason — a query that duplicates a policy is a bug even
 * when it is right, because it will outlive the policy it doubles. The one
 * consequence to know: an author still sees their own hidden comment, through
 * `comments_select_own`, and that is deliberate. The DSA wants a decision to be
 * contestable, and one does not contest what one can no longer see.
 */

export type CommentAuthor = {
  handle: string
  display_name: string | null
}

export type CommentRow = {
  id: string
  body: string
  author_id: string
  created_at: string
  updated_at: string
  hidden_at: string | null
  hidden_reason: string | null
  author: CommentAuthor | null
}

const MAX_COMMENTS = 200

/**
 * The visible comments of an entry, oldest first — a talk page reads downwards.
 *
 * Two queries rather than an embed, and not for want of trying: PostgREST
 * resolves an embed from a foreign key, and `comments.author_id` points at
 * `auth.users`, not at `public.profiles`. There is no key between the two
 * tables to follow. The second query is a single `in (…)`, so this is two round
 * trips whatever the number of comments, not an N+1.
 *
 * A profile that comes back missing is not an error and not a deleted account —
 * erasing an account cascades its comments away. It is a member who has turned
 * `is_discoverable` off, and `profiles_select_directory` is doing its job.
 */
export async function listComments(cigarId: string): Promise<CommentRow[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('comments')
    .select('id, body, author_id, created_at, updated_at, hidden_at, hidden_reason')
    .eq('cigar_id', cigarId)
    .order('created_at', { ascending: true })
    .limit(MAX_COMMENTS)

  if (error) throw new Error(`Could not read the comments: ${error.message}`)

  const comments = data ?? []
  if (comments.length === 0) return []

  const authorIds = [...new Set(comments.map((row) => row.author_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, handle, display_name')
    .in('id', authorIds)

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]))

  return comments.map((row) => {
    const profile = byId.get(row.author_id)
    return {
      ...row,
      author: profile ? { handle: profile.handle, display_name: profile.display_name } : null,
    }
  })
}
