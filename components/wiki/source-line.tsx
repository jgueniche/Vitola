import { m } from '@/lib/i18n'

const copy = m.contributions

/**
 * Where a proposal takes its fact from (migration 0026), rendered wherever a
 * proposal is read: the queue, the history, the serial review.
 *
 * An https address becomes a link that opens beside the review — the reviewer
 * checks the manufacturer's page and comes back to decide. Anything else (the
 * reference of a catalogue, a decree) is shown as the text it is. Nothing is
 * shown at all when the proposal cites nothing: a "sans source" line under
 * every band-in-hand correction would read as a reproach, and PROVENANCE §6
 * asks for a documented origin, not for a URL.
 */
export function SourceLine({ source, className }: { source: string | null; className?: string }) {
  if (!source) return null
  const isLink = /^https:\/\//i.test(source)

  return (
    <p className={className ?? 'text-ink-muted mt-3 text-sm leading-relaxed'}>
      <span className="label block">{copy.sourceLabel}</span>
      {isLink ? (
        <a
          href={source}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:text-accent-bright break-all underline underline-offset-4"
        >
          {source}
        </a>
      ) : (
        <span className="break-words">{source}</span>
      )}
    </p>
  )
}
