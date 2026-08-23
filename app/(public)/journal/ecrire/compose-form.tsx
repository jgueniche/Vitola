'use client'

// useActionState — a refusal (a title too long, a body missing) re-renders in
// place; every success navigates, and the page re-renders this form keyed on
// the saved row, which is how React 19's mount-time defaults stay truthful.
import { useActionState } from 'react'

import { addArticleLink, saveArticle, type ArticleFormState } from './actions'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/field'
import { m } from '@/lib/i18n'
import { ARTICLE_CATEGORIES, JOURNAL_LIMITS } from '@/lib/journal/model'
import type { ArticleRow } from '@/lib/journal/queries'

const copy = m.journal.compose

export function ComposeForm({ article }: { article: ArticleRow | null }) {
  const [state, formAction] = useActionState<ArticleFormState, FormData>(saveArticle, {})

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="articleId" value={article?.id ?? ''} />

      <fieldset className="flex flex-col gap-4">
        <legend className="font-display text-2xl">
          {article ? copy.legendEdit : copy.legendNew}
        </legend>

        <div className="flex flex-col gap-1">
          <Label htmlFor="article-title">{copy.titleLabel}</Label>
          <Input
            id="article-title"
            name="title"
            required
            minLength={JOURNAL_LIMITS.titleMin}
            maxLength={JOURNAL_LIMITS.titleMax}
            defaultValue={article?.title ?? ''}
          />
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="article-category">{copy.categoryLabel}</Label>
            <Select
              id="article-category"
              name="category"
              defaultValue={article?.category ?? 'guide'}
            >
              {ARTICLE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {m.journal.categories[category]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex min-w-64 flex-1 flex-col gap-1">
            <Label htmlFor="article-audience">{copy.audienceLabel}</Label>
            <Select id="article-audience" name="audience" defaultValue={article?.audience ?? 'gated'}>
              <option value="gated">{copy.audienceGated}</option>
              <option value="public">{copy.audiencePublic}</option>
            </Select>
            <p className="text-ink-faint text-xs leading-relaxed">{copy.audienceNote}</p>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="article-excerpt">{copy.excerptLabel}</Label>
          <Textarea
            id="article-excerpt"
            name="excerpt"
            rows={2}
            maxLength={JOURNAL_LIMITS.excerptMax}
            defaultValue={article?.excerpt ?? ''}
          />
          <p className="text-ink-faint text-xs">{copy.excerptHint}</p>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="article-body">{copy.bodyLabel}</Label>
          <Textarea
            id="article-body"
            name="body"
            rows={18}
            required
            maxLength={JOURNAL_LIMITS.bodyMax}
            defaultValue={article?.body_md ?? ''}
            className="font-mono text-xs"
          />
          <p className="text-ink-faint text-xs leading-relaxed">{copy.bodyHint}</p>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="article-tags">{copy.tagsLabel}</Label>
          <Input id="article-tags" name="tags" defaultValue={article?.tags.join(', ') ?? ''} />
        </div>
      </fieldset>

      {state.error ? <FieldError>{state.error}</FieldError> : null}

      <div>
        <Button type="submit">{copy.saveDraft}</Button>
      </div>
    </form>
  )
}

/** Linking a sheet by the slug its address shows — gated articles only (D4). */
export function LinkForm({ articleId }: { articleId: string }) {
  const [state, formAction] = useActionState<ArticleFormState, FormData>(addArticleLink, {})

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="articleId" value={articleId} />
      <div className="flex flex-col gap-1">
        <Label htmlFor="link-kind">{copy.linksLegend}</Label>
        <Select id="link-kind" name="kind" defaultValue="cigar">
          <option value="cigar">{copy.linkKindCigar}</option>
          <option value="venue">{copy.linkKindVenue}</option>
        </Select>
      </div>
      <div className="flex min-w-56 flex-1 flex-col gap-1">
        <Label htmlFor="link-slug">{copy.linkCigarLabel}</Label>
        <Input id="link-slug" name="slug" placeholder="undercrown-10-robusto" />
      </div>
      <Button type="submit" variant="secondary">
        {copy.linkAdd}
      </Button>
      {state.error ? <FieldError>{state.error}</FieldError> : null}
    </form>
  )
}
