import Link from 'next/link'

/**
 * A universe's landing page — the answer to a seventeen-entry flat nav.
 *
 * The header names four universes; each hub lists what lives inside, one card
 * per section, each with the one sentence that says what it is. Cards are
 * links and nothing else: no counts, no queries — a hub must cost nothing,
 * because it is on the path to everything.
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
    <main id="contenu" className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="font-display text-display-md leading-tight">{title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{lede}</p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <li key={card.href}>
            <Link
              href={card.href}
              className="border-rule bg-surface hover:border-rule-strong block h-full rounded-[3px] border p-4 transition-colors duration-(--duration-quick)"
            >
              <span className="text-ink block font-semibold">{card.title}</span>
              <span className="text-ink-muted mt-1 block text-sm leading-relaxed">{card.body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
