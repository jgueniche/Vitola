import Link from 'next/link'

/**
 * A universe's landing page — the answer to a seventeen-entry flat nav.
 *
 * The header names four universes; each hub lists what lives inside, one row
 * per section, each with the one sentence that says what it is. Rows are
 * links and nothing else: no counts, no queries — a hub must cost nothing,
 * because it is on the path to everything. Rows rather than tiles: a bordered
 * box for a title and a sentence was the heaviest thing on the lightest
 * pages of the site.
 */

export type HubCard = { title: string; body: string; href: string }

export function HubPage({
  eyebrow,
  title,
  lede,
  cards,
}: {
  eyebrow: string
  title: string
  lede: string
  cards: HubCard[]
}) {
  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="font-display text-display-md leading-tight">{title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{lede}</p>
      </div>

      <ul className="border-rule border-t">
        {cards.map((card) => (
          <li key={card.href} className="border-rule border-b">
            <Link href={card.href} className="group block py-4">
              <span className="text-ink group-hover:text-accent-bright block font-medium transition-colors duration-(--duration-quick)">
                {card.title}
              </span>
              <span className="text-ink-muted mt-1 block text-sm leading-relaxed">{card.body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
