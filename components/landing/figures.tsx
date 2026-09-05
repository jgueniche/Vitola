import {
  Award,
  Check,
  Flame,
  Gauge,
  Info,
  MessageCircle,
  Scissors,
  ShieldCheck,
  X,
} from 'lucide-react'

import { Band } from '@/components/band/band'
import {
  Marker,
  Notches,
  Panel,
  PanelHead,
  Pill,
  Row,
  Shades,
  Tag,
} from '@/components/landing/parts'
import { BRAND } from '@/lib/brand'
import { m } from '@/lib/i18n'

/**
 * The mocked interface panels of the landing page.
 *
 * They are drawings of screens that do not exist yet, so every value in them
 * is either a bracketed placeholder or a measurement. No brand name, no venue
 * name and no price has been invented: on a page about tobacco that would be a
 * legal problem, not a content one.
 */

const P = m.landing.placeholders

/* ------------------------------------------------------------------ 01 wiki */

export function ReferentialFigure() {
  const f = m.landing.modules.referentiel.figure
  return (
    <div className="flex flex-col gap-6">
      <div className="border-rule bg-surface rounded-band overflow-hidden border">
        {/* §4.4: the band tops a cigar card — the card IS a band. */}
        <Band brand={BRAND.name} vitola={f.cardBand} />
        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-1">
            <p className="eyebrow">{P.brand}</p>
            <h3 className="text-base leading-tight font-medium">{P.product}</h3>
            <p className="text-ink-muted text-sm">{f.vitola}</p>
          </div>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-sm tracking-wide">
                {m.landing.plate.vitolaDimensions}
              </span>
              <span aria-hidden="true" className="flex h-3 w-full items-center">
                <span className="bg-ink-faint h-2.5 w-[70%] rounded-full" />
              </span>
            </div>
            <div className="flex items-center gap-2 self-center">
              <Notches filled={4} />
              <span className="text-ink-muted text-sm">{f.strength}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Shades upTo={4} />
            <span className="text-ink-muted text-sm">{f.shade}</span>
          </div>
          <div className="text-ink-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span>{f.origin}</span>
            <span>{f.year}</span>
            <span className="font-mono">
              {f.revision} · <span className="text-ink-faint">{f.version}</span>
            </span>
          </div>
        </div>
      </div>

      <Panel>
        <PanelHead>
          <span className="eyebrow">{f.queueTitle}</span>
          <Pill>{f.queueCount}</Pill>
        </PanelHead>
        <Row>
          <span>
            {f.row1} — <span className="text-ink-faint font-mono">{f.row1Value}</span>
          </span>
          <Pill tone="caution">{f.row1State}</Pill>
        </Row>
        <Row>
          <span>
            {f.row2} — <span className="text-ink-faint">{f.row2Value}</span>
          </span>
          <Pill tone="positive">{f.row2State}</Pill>
        </Row>
        <Row>
          <span>
            {f.row3} — <span className="text-ink-faint">{f.row3Value}</span>
          </span>
          <Pill tone="caution">{f.row3State}</Pill>
        </Row>
      </Panel>
    </div>
  )
}

/* ------------------------------------------------------------------ 02 scan */

function Candidate({
  name,
  meta,
  score,
  width,
}: {
  name: string
  meta: string
  score: string
  width: number
}) {
  const lead = width > 80
  return (
    <div className="border-rule grid grid-cols-[1fr_auto] items-center gap-3 border-t px-4 py-3.5">
      <div className="flex flex-col gap-0.5">
        <span className={lead ? 'text-[0.9375rem]' : 'text-ink-muted text-[0.9375rem]'}>
          {name}
        </span>
        <span className="text-ink-faint text-[13px]">{meta}</span>
      </div>
      <div className="flex items-center gap-2.5">
        <span className={`font-mono text-[13px] ${lead ? 'text-accent-bright' : 'text-ink-muted'}`}>
          {score}
        </span>
        <span className="bg-rule-strong h-[3px] w-[88px] overflow-hidden rounded-sm">
          <span
            className={`block h-full ${lead ? 'bg-accent' : 'bg-ink-faint'}`}
            style={{ width: `${width}%` }}
          />
        </span>
      </div>
    </div>
  )
}

export function ScanFigure() {
  const f = m.landing.modules.scan.figure
  const name = `${P.brand} — ${P.product}`
  return (
    <div className="flex flex-col gap-6">
      <div className="viewfinder rounded-band overflow-hidden">
        <div className="relative h-[260px]">
          <span aria-hidden="true" className="finder-corner" data-corner="tl" />
          <span aria-hidden="true" className="finder-corner" data-corner="tr" />
          <span aria-hidden="true" className="finder-corner" data-corner="bl" />
          <span aria-hidden="true" className="finder-corner" data-corner="br" />
          <span aria-hidden="true" className="scanline" />
          {/* §4.4: the aiming frame IS a band. */}
          <div className="absolute top-1/2 left-1/2 w-[300px] -translate-x-1/2 -translate-y-1/2">
            <Band variant="viewfinder">
              <span className="eyebrow text-ink">{f.aim}</span>
            </Band>
          </div>
        </div>
        <Row className="border-rule border-t">
          <span className="eyebrow">{f.fingerprint}</span>
          <span className="text-ink-faint font-mono text-xs">{f.fingerprintValue}</span>
        </Row>
      </div>

      <Panel>
        <PanelHead>
          <span className="eyebrow">{f.candidates}</span>
          <Pill>{f.fusion}</Pill>
        </PanelHead>
        <Candidate name={name} meta={f.v1} score="0,94" width={94} />
        <Candidate name={name} meta={f.v2} score="0,41" width={41} />
        <Candidate name={name} meta={f.v3} score="0,22" width={22} />
        <Row>
          <span className="flex flex-wrap gap-2">
            <span className="bg-accent text-on-accent rounded-band inline-flex h-8 items-center px-3 text-sm font-medium">
              {f.confirm}
            </span>
            <span className="border-rule-strong text-ink rounded-band inline-flex h-8 items-center border px-3 text-sm">
              {f.other}
            </span>
            <span className="border-rule-strong text-ink rounded-band inline-flex h-8 items-center border px-3 text-sm">
              {f.missing}
            </span>
          </span>
        </Row>
      </Panel>
    </div>
  )
}

/* ------------------------------------------------------- 03 tasting: the wheel */

/**
 * Eleven aroma families as a radial bar chart in ONE hue.
 *
 * Eleven categorical colours would be eleven colours competing with the single
 * accent the design system allows, and the reading here is intensity, not
 * identity — so length carries the value and the hue stays constant.
 */
const SPOKES = [
  { label: 'Boisé', x1: 170, y1: 136, x2: 170, y2: 55.6, o: 0.8, tx: 170, ty: 20, a: 'middle' },
  {
    label: 'Torréfié',
    x1: 188.4,
    y1: 141.4,
    x2: 227.6,
    y2: 80.4,
    o: 0.74,
    tx: 251.1,
    ty: 43.8,
    a: 'start',
  },
  {
    label: 'Épicé',
    x1: 200.9,
    y1: 155.9,
    x2: 249.9,
    y2: 133.5,
    o: 0.62,
    tx: 306.4,
    ty: 107.7,
    a: 'start',
  },
  {
    label: 'Terreux',
    x1: 203.7,
    y1: 174.8,
    x2: 242.5,
    y2: 180.4,
    o: 0.52,
    tx: 318.5,
    ty: 191.3,
    a: 'start',
  },
  {
    label: 'Animal',
    x1: 195.7,
    y1: 192.3,
    x2: 212,
    y2: 206.4,
    o: 0.4,
    tx: 283.4,
    ty: 268.2,
    a: 'start',
  },
  {
    label: 'Fruité',
    x1: 179.6,
    y1: 202.6,
    x2: 187.8,
    y2: 230.8,
    o: 0.45,
    tx: 212.2,
    ty: 313.9,
    a: 'start',
  },
  {
    label: 'Floral',
    x1: 160.4,
    y1: 202.6,
    x2: 155.5,
    y2: 219.5,
    o: 0.36,
    tx: 127.8,
    ty: 313.9,
    a: 'end',
  },
  {
    label: 'Sucré',
    x1: 144.3,
    y1: 192.3,
    x2: 108.8,
    y2: 223,
    o: 0.58,
    tx: 56.6,
    ty: 268.2,
    a: 'end',
  },
  {
    label: 'Végétal',
    x1: 136.3,
    y1: 174.8,
    x2: 111.1,
    y2: 178.5,
    o: 0.42,
    tx: 21.5,
    ty: 191.3,
    a: 'end',
  },
  {
    label: 'Minéral',
    x1: 139.1,
    y1: 155.9,
    x2: 108.8,
    y2: 142,
    o: 0.48,
    tx: 33.6,
    ty: 107.7,
    a: 'end',
  },
  {
    label: 'Défaut',
    x1: 151.6,
    y1: 141.4,
    x2: 149,
    y2: 137.3,
    o: 0.24,
    tx: 88.9,
    ty: 43.8,
    a: 'end',
  },
] as const

function AromaWheel() {
  return (
    <svg
      viewBox="-40 -24 420 400"
      className="block h-auto w-full"
      role="img"
      aria-label={m.landing.modules.degustation.figure.wheel}
    >
      <g className="stroke-rule" fill="none">
        <circle cx="170" cy="170" r="132" />
        <circle cx="170" cy="170" r="88" />
      </g>
      <circle cx="170" cy="170" r="34" fill="none" className="stroke-rule-strong" />
      <g className="stroke-accent" strokeLinecap="round" strokeWidth={9}>
        {SPOKES.map((s) => (
          <line key={s.label} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} opacity={s.o} />
        ))}
      </g>
      <g className="fill-ink-muted font-eyebrow" style={{ fontSize: 8.5, letterSpacing: '0.1em' }}>
        {SPOKES.map((s) => (
          <text key={s.label} x={s.tx} y={s.ty} textAnchor={s.a}>
            {s.label.toUpperCase()}
          </text>
        ))}
      </g>
    </svg>
  )
}

export function TastingFigure() {
  const f = m.landing.modules.degustation.figure
  return (
    <div className="grid items-stretch gap-6 lg:grid-cols-[1fr_300px]">
      <Panel className="flex flex-col justify-center px-2.5 pt-4">
        <AromaWheel />
        <Row className="border-rule justify-center border-t">
          <span className="eyebrow">{f.wheel}</span>
        </Row>
      </Panel>

      <div className="flex flex-col gap-6">
        <Panel>
          <PanelHead>
            <span className="eyebrow">{f.thirds}</span>
            <Pill>{f.draft}</Pill>
          </PanelHead>
          <Row>
            <span>{f.third1}</span>
            <span className="text-ink-faint font-mono">{f.third1Value}</span>
          </Row>
          <Row>
            <span>{f.third2}</span>
            <span className="text-ink-faint font-mono">{f.third2Value}</span>
          </Row>
          <Row>
            <span>{f.third3}</span>
            <span className="text-ink-faint font-mono">{f.third3Value}</span>
          </Row>
        </Panel>

        <Panel>
          <PanelHead>
            <span className="eyebrow">{f.criteria}</span>
            <span className="text-accent-bright font-mono text-xl">
              {f.score}
              <span className="text-ink-faint text-[13px]"> {f.scoreOutOf}</span>
            </span>
          </PanelHead>
          {[
            [f.construction, 5],
            [f.draw, 4],
            [f.burn, 3],
            [f.evolution, 4],
          ].map(([label, filled]) => (
            <Row key={label as string}>
              <span>{label}</span>
              <Notches filled={filled as number} />
            </Row>
          ))}
          <Row className="text-ink-muted text-[13px]">
            <span>
              {f.average} <span className="font-mono">{P.count}</span> {f.averageSuffix}
            </span>
            <span className="text-ink-faint font-mono">{f.deviation}</span>
          </Row>
        </Panel>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- 04 humidor */

const CELLARS = [
  { entry: '03/2019', vitola: 'Corona gorda', qty: '18', age: '6 a 5 m', tone: 'positive' },
  { entry: '11/2022', vitola: 'Robusto', qty: '24', age: '3 a 9 m', tone: 'positive' },
  { entry: '06/2024', vitola: 'Petit corona', qty: '10', age: '2 a 2 m', tone: 'caution' },
  { entry: '01/2026', vitola: 'Piramide', qty: '25', age: '7 m', tone: 'muted' },
] as const

export function HumidorFigure() {
  const f = m.landing.modules.cave.figure
  const label = { positive: f.ready, caution: f.ongoing, muted: f.resting }
  const tone = {
    positive: 'text-positive',
    caution: 'text-caution',
    muted: 'text-ink-muted',
  }
  return (
    <Panel>
      <PanelHead>
        <span className="eyebrow">
          {f.title} — <span className="font-mono">{P.count}</span> {f.unit}
        </span>
        <span className="flex gap-2">
          <Pill>{f.humidity}</Pill>
          <Pill>{f.temperature}</Pill>
        </span>
      </PanelHead>
      {/* A five-column table cannot shrink below its content on a phone, and
          it was pushing the whole page sideways. Wide content scrolls inside
          its own box; the page body never scrolls horizontally. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="eyebrow">
              {[f.colEntry, f.colVitola, f.colQty, f.colAge, f.colMaturity].map((head, index) => (
                <th
                  key={head}
                  scope="col"
                  className={`border-rule border-b px-3 py-3 font-normal whitespace-nowrap ${
                    index === 0 ? 'pl-4.5' : ''
                  } ${index > 1 ? 'text-right' : 'text-left'}`}
                >
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CELLARS.map((row) => (
              <tr key={row.entry}>
                <td className="border-rule text-ink-faint border-b px-3 py-3.5 pl-4.5 font-mono whitespace-nowrap">
                  {row.entry}
                </td>
                <td className="border-rule border-b px-3 py-3.5">
                  {P.brand} · {row.vitola}
                </td>
                <td className="border-rule border-b px-3 py-3.5 text-right font-mono">{row.qty}</td>
                <td className="border-rule border-b px-3 py-3.5 text-right font-mono whitespace-nowrap">
                  {row.age}
                </td>
                <td
                  className={`border-rule border-b px-3 py-3.5 pr-4.5 text-right whitespace-nowrap ${tone[row.tone]}`}
                >
                  {label[row.tone]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Row className="border-rule text-ink-muted border-t text-[13px]">
        <span>{f.rotation}</span>
        <span className="text-ink-faint font-mono">{f.export}</span>
      </Row>
    </Panel>
  )
}

/* ----------------------------------------------------------------- 05 network */

export function NetworkFigure() {
  const f = m.landing.modules.reseau.figure
  return (
    <div className="flex flex-col gap-6">
      <Panel className="flex flex-col gap-3.5 p-5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="bg-surface-raised ring-rule-strong text-ink-faint font-eyebrow flex size-9.5 shrink-0 items-center justify-center rounded-full text-[13px] ring-1"
          >
            A
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="text-[0.9375rem]">{P.member}</span>
            <span className="text-ink-faint font-mono text-xs">
              {P.handle} · {f.ago}
            </span>
          </div>
          <div className="ml-auto min-w-[120px]">
            <Band variant="badge">
              <span className="eyebrow text-ink">{f.badge}</span>
            </Band>
          </div>
        </div>
        <p className="text-[0.9375rem] leading-relaxed">{f.post}</p>
        <Tag active>
          <Flame aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {P.brand} — {P.product}
        </Tag>
        <div className="border-rule text-ink-muted flex items-center gap-5 border-t pt-3.5 text-[13px]">
          <span className="inline-flex items-center gap-1.5">
            <Flame aria-hidden="true" className="text-accent size-4" strokeWidth={1.5} />
            <span className="font-mono">{P.count}</span> {f.embers}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MessageCircle aria-hidden="true" className="size-4" strokeWidth={1.5} />
            <span className="font-mono">{P.count}</span> {f.replies}
          </span>
          <span className="text-ink-faint ml-auto font-mono">{f.visibility}</span>
        </div>
      </Panel>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_240px]">
        <Panel>
          <PanelHead>
            <span className="eyebrow">{f.clubs}</span>
            <Pill>{f.thisMonth}</Pill>
          </PanelHead>
          <Row>
            <span>
              {f.club} — {P.club}
            </span>
            <span className="text-ink-faint font-mono whitespace-nowrap">
              {P.count} {f.members}
            </span>
          </Row>
          <Row>
            <span>
              {f.meetup} · <span className="text-ink-faint">{P.city}</span>
            </span>
            <span className="text-ink-faint font-mono whitespace-nowrap">{P.date}</span>
          </Row>
          <Row>
            <span>{f.workshop}</span>
            <span className="text-ink-faint font-mono whitespace-nowrap">{P.date}</span>
          </Row>
        </Panel>

        <Panel className="p-5">
          <span className="eyebrow">{f.reputation}</span>
          <ul className="mt-3.5">
            {[
              [f.member, '0', true],
              [f.contributor, P.threshold, true],
              [f.editor, P.threshold, false],
              [f.moderator, f.appointed, false],
            ].map(([label, value, on]) => (
              <li
                key={label as string}
                className="border-rule grid grid-cols-[26px_1fr_auto] items-center gap-3.5 border-t py-3.5 text-sm last:border-b"
              >
                <span
                  aria-hidden="true"
                  className={
                    on
                      ? 'bg-accent ring-accent/15 size-2 rounded-full ring-3'
                      : 'bg-rule-strong size-2 rounded-full'
                  }
                />
                <span>{label}</span>
                <span className="text-ink-faint font-mono text-xs">{value}</span>
              </li>
            ))}
          </ul>
          <p className="text-ink-muted mt-4 text-[13px] leading-normal">{f.reputationNote}</p>
          <div className="mt-5 flex flex-col gap-2.5">
            {[f.badge1, f.badge2, f.badge3].map((badge) => (
              <Band key={badge} variant="badge" className="min-w-[132px]">
                <span className="eyebrow text-ink">{badge}</span>
              </Band>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ 06 venues */

const PINS = [
  { key: 'pinCivette', left: '31%', top: '42%', lead: true },
  { key: 'pinCave', left: '57%', top: '31%', lead: false },
  { key: 'pinLounge', left: '70%', top: '63%', lead: false },
  { key: 'pinHotel', left: '19%', top: '76%', lead: false },
  { key: 'pinClub', left: '46%', top: '87%', lead: false },
] as const

export function VenuesFigure() {
  const f = m.landing.modules.lieux.figure
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_420px]">
      <div className="venue-map border-rule rounded-band relative h-[340px] overflow-hidden border">
        {PINS.map((pin) => (
          <span
            key={pin.key}
            className="absolute -translate-x-1/2 -translate-y-full"
            style={{ left: pin.left, top: pin.top }}
          >
            <span
              aria-hidden="true"
              className={
                pin.lead
                  ? 'bg-accent ring-accent/15 mx-auto block size-2.5 rounded-full ring-4'
                  : 'ring-ink-faint mx-auto block size-2.5 rounded-full ring-1 ring-inset'
              }
            />
            <span className="mt-1.5 block text-[11px] whitespace-nowrap">{f[pin.key]}</span>
          </span>
        ))}
        <div className="absolute bottom-3.5 left-4 flex flex-wrap gap-2">
          <Tag active>{f.chipVentilated}</Tag>
          <Tag>{f.chipOpen}</Tag>
          <Tag>{f.chipNear}</Tag>
        </div>
      </div>

      <Panel>
        <PanelHead>
          <span className="eyebrow">
            {f.around} {P.city}
          </span>
          <Pill>
            <span className="font-mono">{P.count}</span>&nbsp;{f.sheets}
          </Pill>
        </PanelHead>
        {[
          [f.row1, f.row1Meta, f.row1Distance],
          [f.row2, f.row2Meta, f.row2Distance],
          [f.row3, f.row3Meta, f.row3Distance],
        ].map(([kind, meta, distance]) => (
          <Row key={kind}>
            <span className="flex flex-col gap-0.5">
              <span>{P.venue}</span>
              <span className="text-ink-faint text-xs">
                {kind} · {P.city} · {meta}
              </span>
            </span>
            <span className="text-ink-faint font-mono text-xs whitespace-nowrap">{distance}</span>
          </Row>
        ))}
        <Row className="text-ink-muted text-[13px]">
          <span>{f.claimed}</span>
          <Pill tone="positive">{f.verified}</Pill>
        </Row>
        <Row className="text-ink-muted text-[13px]">
          <span>{f.reviewsNote}</span>
          <Info aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
        </Row>
      </Panel>
    </div>
  )
}

/* -------------------------------------------------------------------- 07 shop */

export function ShopFigure() {
  const f = m.landing.modules.boutique.figure
  const products = [
    { icon: Scissors, category: f.cat1, description: f.desc1 },
    { icon: Gauge, category: f.cat2, description: f.desc2 },
    { icon: Award, category: f.cat3, description: f.desc3 },
  ]
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 sm:grid-cols-3">
        {products.map(({ icon: Icon, category, description }) => (
          <div key={category} className="border-rule bg-surface rounded-band border">
            <div className="border-rule bg-surface-raised flex h-[180px] items-center justify-center border-b">
              <Icon aria-hidden="true" className="text-ink-faint size-16" strokeWidth={1.5} />
            </div>
            <div className="flex flex-col gap-2 p-4.5">
              <p className="eyebrow">{category}</p>
              <h3 className="text-base font-medium">{P.productName}</h3>
              <p className="text-ink-muted text-[13px]">{description}</p>
              <p className="mt-1 font-mono text-sm">
                {P.price} {f.currency}
              </p>
            </div>
          </div>
        ))}
      </div>
      <Panel>
        <Row>
          <span className="text-ink-muted flex items-center gap-3 text-sm">
            <ShieldCheck
              aria-hidden="true"
              className="text-accent size-4 shrink-0"
              strokeWidth={1.5}
            />
            {f.payment}
          </span>
          <span className="text-ink-faint font-mono text-xs">{f.enum}</span>
        </Row>
      </Panel>
    </div>
  )
}

/* ---------------------------------------------------------------- 08 partners */

export function PartnersFigure() {
  const f = m.landing.modules.partenaires.figure
  return (
    <div className="border-rule bg-rule rounded-band grid gap-px overflow-hidden border md:grid-cols-2">
      {(
        [
          { title: f.acceptTitle, items: f.accept, tone: 'text-positive', Icon: Check },
          { title: f.refuseTitle, items: f.refuse, tone: 'text-negative', Icon: X },
        ] as const
      ).map(({ title, items, tone, Icon }) => (
        <div key={title} className="bg-surface flex flex-col gap-4 p-8">
          <p className={`eyebrow ${tone}`}>{title}</p>
          <ul>
            {items.map((item) => (
              <li
                key={item.title}
                className="border-rule text-ink-muted grid grid-cols-[18px_1fr] items-start gap-3 border-t py-3 text-[0.9375rem] leading-normal"
              >
                <Icon aria-hidden="true" className={`mt-0.5 size-4 ${tone}`} strokeWidth={1.5} />
                <span>
                  <b className="text-ink font-medium">{item.title}</b> {item.body}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ 09 cercle */

export function PlansFigure() {
  const f = m.landing.modules.cercle.figure
  return (
    <div className="border-rule bg-rule rounded-band grid gap-px overflow-hidden border md:grid-cols-2">
      <div className="bg-surface flex flex-col px-8 pb-8">
        <div className="border-rule flex items-baseline justify-between gap-4 border-b pt-7 pb-4.5">
          <span className="eyebrow">{f.freeName}</span>
          <span className="text-ink font-mono text-lg">{f.freePrice}</span>
        </div>
        <ul>
          {f.free.map((item, index) => (
            <li
              key={item.title}
              className="border-rule text-ink-muted grid grid-cols-[14px_1fr] items-start gap-3.5 border-b py-3.5 text-[0.9375rem] leading-normal last:border-b-0"
            >
              <Marker />
              <span>
                <b className="text-ink font-medium">{item.title}</b>{' '}
                {index === 1 ? <span className="font-mono">{P.count}</span> : null}
                {index === 3 ? <span className="font-mono">{P.count}</span> : null} {item.body}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* The Cercle column is marked the way everything else here is marked:
          a band. Rule, lockup, rule. */}
      <div className="bg-surface-raised flex flex-col px-8 pt-5 pb-8">
        <span aria-hidden="true" className="brass-rule -mx-8 h-0.5" />
        <div className="flex items-baseline justify-between gap-4 pt-2 pb-3.5">
          <span className="eyebrow text-ink">{f.paidName}</span>
          <span className="text-ink font-mono text-lg">
            {/* ink-muted, not ink-faint: 13px of faint fails AA on the dark
                ground, and a price qualifier is information, not decoration. */}
            {P.price} {f.currency} <span className="text-ink-muted text-[13px]">{f.perMonth}</span>
          </span>
        </div>
        <span aria-hidden="true" className="brass-rule -mx-8 h-0.5" />
        <ul>
          {f.paid.map((item) => (
            <li
              key={item.title}
              className="border-rule text-ink-muted grid grid-cols-[14px_1fr] items-start gap-3.5 border-b py-3.5 text-[0.9375rem] leading-normal last:border-b-0"
            >
              <Marker accent />
              <span>
                <b className="text-ink font-medium">{item.title}</b> {item.body}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
