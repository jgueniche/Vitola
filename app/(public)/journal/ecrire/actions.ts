'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { m } from '@/lib/i18n'
import {
  articleSlug,
  isArticleAudience,
  isArticleCategory,
  JOURNAL_DONE,
  JOURNAL_LIMITS,
  readingTimeMin,
} from '@/lib/journal/model'
import { routes } from '@/lib/routes'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Every write of the journal (ADR 0012).
 *
 * All of them go through the session client and none restates a policy: who
 * writes is `articles_insert_editor` and its siblings, and this file could not
 * write as a member if it tried. What migration 0017 decides and shows up here
 * only as mapped refusals: an article born public cannot exist with links, and
 * `reading_time_min` is computed from the body — never read from the form,
 * where a field for it does not exist.
 */

export type ArticleFormState = { error?: string }

const copy = m.journal.compose

function firstMessage(error: z.ZodError, fallback: string): string {
  return error.issues[0]?.message ?? fallback
}

const saveSchema = z.object({
  articleId: z.union([z.uuid(), z.literal('')]),
  title: z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(JOURNAL_LIMITS.titleMin, copy.titleTooShort.replace('{min}', String(JOURNAL_LIMITS.titleMin)))
        .max(JOURNAL_LIMITS.titleMax, copy.titleTooLong.replace('{max}', String(JOURNAL_LIMITS.titleMax))),
    ),
  category: z.string().refine(isArticleCategory, copy.refused),
  audience: z.string().refine(isArticleAudience, copy.refused),
  excerpt: z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .max(
          JOURNAL_LIMITS.excerptMax,
          copy.excerptTooLong.replace('{max}', String(JOURNAL_LIMITS.excerptMax)),
        ),
    )
    .transform((value) => (value.length > 0 ? value : null)),
  body: z
    .string()
    .transform((value) => value.replace(/\r\n/g, '\n').trim())
    .pipe(
      z
        .string()
        .min(JOURNAL_LIMITS.bodyMin, copy.bodyMissing)
        .max(JOURNAL_LIMITS.bodyMax, copy.bodyTooLong.replace('{max}', String(JOURNAL_LIMITS.bodyMax))),
    ),
  tags: z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
        .slice(0, 24),
    )
    .pipe(
      z
        .array(z.string().max(40))
        .max(JOURNAL_LIMITS.tagsMax, copy.tagsTooMany.replace('{max}', String(JOURNAL_LIMITS.tagsMax))),
    ),
})

function refusal(code: string | undefined, message: string | undefined): string {
  if (code === '42501') return copy.refused
  if (code === '23505') return copy.slugTaken
  /* The D4 triggers raise in 23514 with their own sentence; ours is shorter. */
  if (code === '23514' && message?.includes('VITOLA_AUDIENCE_GAP')) return copy.audienceHasLinks
  return message ?? copy.refused
}

export async function saveArticle(
  _previous: ArticleFormState,
  formData: FormData,
): Promise<ArticleFormState> {
  const parsed = saveSchema.safeParse({
    articleId: formData.get('articleId') ?? '',
    title: formData.get('title') ?? '',
    category: formData.get('category') ?? '',
    audience: formData.get('audience') ?? '',
    excerpt: formData.get('excerpt') ?? '',
    body: formData.get('body') ?? '',
    tags: formData.get('tags') ?? '',
  })
  if (!parsed.success) return { error: firstMessage(parsed.error, copy.refused) }

  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { error: copy.refused }

  const payload = {
    title: parsed.data.title,
    category: parsed.data.category,
    audience: parsed.data.audience,
    excerpt: parsed.data.excerpt,
    body_md: parsed.data.body,
    tags: parsed.data.tags,
    reading_time_min: readingTimeMin(parsed.data.body),
  }

  if (parsed.data.articleId) {
    const { data, error } = await supabase
      .from('articles')
      .update(payload)
      .eq('id', parsed.data.articleId)
      .select('id')
      .maybeSingle()
    if (error) return { error: refusal(error.code, error.message) }
    if (!data) return { error: copy.refused }

    revalidatePath(routes.journal())
    redirect(`${routes.journalCompose()}?article=${data.id}&fait=${JOURNAL_DONE.saved}`)
  }

  const base = articleSlug(parsed.data.title)
  if (base.length === 0) return { error: copy.slugEmpty }

  let slug = base
  for (let attempt = 2; attempt <= 6; attempt += 1) {
    const { data, error } = await supabase
      .from('articles')
      .insert({ ...payload, slug, author_id: auth.user.id })
      .select('id')
      .maybeSingle()

    if (data) {
      revalidatePath(routes.journal())
      redirect(`${routes.journalCompose()}?article=${data.id}&fait=${JOURNAL_DONE.saved}`)
    }
    if (error?.code === '23505') {
      slug = `${base}-${attempt}`
      continue
    }
    return { error: refusal(error?.code, error?.message) }
  }
  return { error: copy.refused }
}

/**
 * Publish, unpublish, delete — status gestures, and they navigate: the buttons
 * live beside a form whose banners change under them. Each reads the result of
 * its write; a policy that refuses returns zero rows.
 */
export async function publishArticle(formData: FormData): Promise<void> {
  const id = z.uuid().safeParse(formData.get('articleId'))
  if (!id.success) return

  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('articles')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', id.data)
    .select('id, slug')
    .maybeSingle()

  revalidatePath(routes.journal())
  if (data) revalidatePath(routes.journalArticle(data.slug))
  redirect(
    data
      ? `${routes.journalCompose()}?article=${data.id}&fait=${JOURNAL_DONE.published}`
      : routes.journalCompose(),
  )
}

export async function unpublishArticle(formData: FormData): Promise<void> {
  const id = z.uuid().safeParse(formData.get('articleId'))
  if (!id.success) return

  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('articles')
    .update({ status: 'draft' })
    .eq('id', id.data)
    .select('id, slug')
    .maybeSingle()

  revalidatePath(routes.journal())
  if (data) revalidatePath(routes.journalArticle(data.slug))
  redirect(
    data
      ? `${routes.journalCompose()}?article=${data.id}&fait=${JOURNAL_DONE.unpublished}`
      : routes.journalCompose(),
  )
}

export async function deleteArticle(formData: FormData): Promise<void> {
  const id = z.uuid().safeParse(formData.get('articleId'))
  if (!id.success) return

  const supabase = await createSupabaseServerClient()
  await supabase.from('articles').delete().eq('id', id.data)

  revalidatePath(routes.journal())
  redirect(`${routes.journalCompose()}?fait=${JOURNAL_DONE.deleted}`)
}

/**
 * Linking a sheet or a venue, by the slug its address shows — the one
 * identifier an editor already has under their eyes. Refused on a public
 * article by the D4 trigger, and the refusal is mapped to a sentence.
 */
export async function addArticleLink(
  _previous: ArticleFormState,
  formData: FormData,
): Promise<ArticleFormState> {
  const parsed = z
    .object({
      articleId: z.uuid(),
      kind: z.enum(['cigar', 'venue']),
      slug: z
        .string()
        .transform((value) => value.trim().toLowerCase())
        .pipe(z.string().min(1, copy.linkUnknown).max(120)),
    })
    .safeParse({
      articleId: formData.get('articleId'),
      kind: formData.get('kind') ?? 'cigar',
      slug: formData.get('slug') ?? '',
    })
  if (!parsed.success) return { error: firstMessage(parsed.error, copy.refused) }

  const supabase = await createSupabaseServerClient()

  let targetId: string | null = null
  if (parsed.data.kind === 'cigar') {
    const { data } = await supabase
      .schema('ref')
      .from('cigars')
      .select('id')
      .eq('slug', parsed.data.slug)
      .maybeSingle()
    targetId = data?.id ?? null
  } else {
    const { data } = await supabase
      .from('venues')
      .select('id')
      .eq('slug', parsed.data.slug)
      .maybeSingle()
    targetId = data?.id ?? null
  }
  if (!targetId) return { error: copy.linkUnknown }

  const { data, error } = await supabase
    .from('article_links')
    .insert({
      article_id: parsed.data.articleId,
      cigar_id: parsed.data.kind === 'cigar' ? targetId : null,
      venue_id: parsed.data.kind === 'venue' ? targetId : null,
    })
    .select('id')
    .maybeSingle()

  if (error) return { error: refusal(error.code, error.message) }
  if (!data) return { error: copy.refused }

  redirect(
    `${routes.journalCompose()}?article=${parsed.data.articleId}&fait=${JOURNAL_DONE.linked}`,
  )
}

export async function removeArticleLink(formData: FormData): Promise<void> {
  const linkId = z.uuid().safeParse(formData.get('linkId'))
  const articleId = z.uuid().safeParse(formData.get('articleId'))
  if (!linkId.success || !articleId.success) return

  const supabase = await createSupabaseServerClient()
  await supabase.from('article_links').delete().eq('id', linkId.data)

  redirect(
    `${routes.journalCompose()}?article=${articleId.data}&fait=${JOURNAL_DONE.unlinked}`,
  )
}
