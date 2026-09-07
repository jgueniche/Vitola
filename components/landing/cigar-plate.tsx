import { BRAND } from '@/lib/brand'
import { m } from '@/lib/i18n'

/**
 * The lit cigar of the landing page (§4.4, §4.5).
 *
 * Drawn rather than photographed, for two reasons that pull the same way: a
 * stock photograph of a cigar is somebody's advertising, and a drawing can be
 * annotated. What is on screen is a plate in a reference work — the ember, the
 * band, the wrapper shade and the vitola are labelled with measurements — not
 * a poster.
 *
 * Redrawn on 6 septembre 2026, after the owner found the first version too
 * smooth: seams at a fixed period, a highlight ruled dead straight, an ash
 * cut from gradients. This one is an SVG, and the rule it follows is that
 * nothing on a hand-rolled object is straight:
 *
 *   - a seam is a helix seen from the side, so it is a cosine — flat where it
 *     meets each edge, steepest on the axis — and the seams are spaced by hand;
 *   - the sheen is a region with undulating edges, blurred, not a stripe;
 *   - the ash outline, the burn line and the charred edge are wobbly paths,
 *     then a turbulence displacement crumbles them further;
 *   - the leaf is mottled by noise before the cylinder shading is laid over it.
 *
 * The pigment lives in app/globals.css as --plate-* (the token check forbids a
 * hex outside that file); the geometry lives here; the little CSS the plate
 * needs — the crop on a phone, the smoke's drift — is in app/landing.css.
 * Every path is computed from constants with Math.sin, so the markup is the
 * same on the server and on the client.
 */

const AXIS = 300
const R = 58
const TOP = AXIS - R
const BOT = AXIS + R
const BURN = 306
const HEAD = 1312
const BAND = { left: 872, right: 1006 } as const
const TILT = -1.8

const f = (n: number) => n.toFixed(1)

/** The cigar is drawn level and tilted as a whole; the notes are not. */
function rot(x: number, y: number): [number, number] {
  const a = (TILT * Math.PI) / 180
  const dx = x - 760
  const dy = y - AXIS
  return [760 + dx * Math.cos(a) - dy * Math.sin(a), AXIS + dx * Math.sin(a) + dy * Math.cos(a)]
}

/** A helix seen from the side projects to a cosine: horizontal at both edges. */
function helix(x: number, run: number, over = 6): string {
  const c = 0.38
  return `M${x} ${TOP - over} C${f(x + run * c)} ${TOP + 3} ${f(x + run * (1 - c))} ${BOT - 3} ${x + run} ${BOT + over}`
}

/* Where the leaf overlaps itself. Spaced by hand, with a different run each
   time — a wrapper is rolled, not printed. The band hides the stretch
   between 872 and 1006. */
const SEAMS = [
  { x: 371, run: 46, w: 1 },
  { x: 483, run: 54, w: 0.7 },
  { x: 569, run: 41, w: 0.9 },
  { x: 706, run: 60, w: 1 },
  { x: 809, run: 47, w: 0.8 },
  { x: 1053, run: 51, w: 0.9 },
  { x: 1141, run: 43, w: 0.7 },
  { x: 1232, run: 49, w: 1 },
] as const

/* The lateral veins of the leaf: the same curve at a shallower angle, in
   patches rather than everywhere. */
const VEINS = [
  332, 356, 389, 418, 447, 519, 548, 596, 631, 663, 742, 772, 801, 834, 857, 1082, 1108, 1168, 1199,
  1258, 1284,
].map((x, i) => ({ x, run: 118 + (i % 3) * 22, o: 0.05 + ((i * 7) % 5) * 0.014 }))

/** The oil of the wrapper: a long soft light whose edges wander. */
function sheen(): string {
  const top: string[] = []
  const bot: string[] = []
  for (let x = 322; x <= 1296; x += 34) {
    top.push(`${x} ${f(263 + 5 * Math.sin(x / 91) + 3 * Math.sin(x / 37 + 1.3))}`)
    bot.push(`${x} ${f(291 + 6 * Math.sin(x / 79 + 0.6) + 3 * Math.sin(x / 43))}`)
  }
  return `M${top.join(' L')} L${bot.reverse().join(' L')} Z`
}

/** The burn line, which is never straight either. */
function burn(): string {
  const pts: string[] = []
  for (let y = TOP - 4; y <= BOT + 4; y += 11) {
    pts.push(`${f(BURN + 3.2 * Math.sin(y / 9.5) + 1.6 * Math.sin(y / 4.1))} ${y}`)
  }
  return `M${pts.join(' L')}`
}

/** The charred band the burn leaves on the wrapper, with a ragged edge. */
function char(): string {
  const edge: string[] = []
  for (let y = TOP - 2; y <= BOT + 2; y += 14) {
    edge.push(`${f(352 + 7 * Math.sin(y / 13) + 3 * Math.sin(y / 5.3))} ${y}`)
  }
  return `M${BURN - 8} ${TOP - 2} L${edge.join(' L')} L${BURN - 8} ${BOT + 2} Z`
}

/** A thread of light on the top edge, the further from the ember the stronger. */
function rim(): string {
  const pts: string[] = []
  for (let x = 362; x <= 1244; x += 46) pts.push(`${x} ${f(TOP + 1.5 + 0.9 * Math.sin(x / 53))}`)
  return `M${pts.join(' L')}`
}

/* The silhouette of the wrapper: parallel sides, a shoulder, a cut head. */
const BODY = `M${BURN - 6} ${TOP} L1248 ${TOP} C1284 ${TOP + 1} 1302 ${TOP + 9} ${HEAD} ${AXIS - 52} L${HEAD} ${AXIS + 52} C1302 ${BOT - 9} 1284 ${BOT - 1} 1248 ${BOT} L${BURN - 6} ${BOT} Z`

/* The ash continues the cylinder and blunts toward the foot; its outline is
   drawn crumbled, and the displacement crumbles it more. */
const ASH = `M${BURN + 2} 243 L286 241 L270 245 L252 240 L236 246 L218 243 L204 249 L190 247 L180 256 L172 270 L169 286 L171 302 L168 318 L173 334 L182 346 L196 353 L214 356 L232 353 L250 358 L268 355 L288 359 L${BURN + 2} 357 Z`

const CRACKS = [
  'M229 243 l-2 9 l4 8 l-3 11 l2 13 l-4 10 l3 12 l-2 14 l3 11 l-1 12',
  'M197 249 l-3 8 l3 10 l-4 9 l1 12 l-3 10 l4 11 l-2 12 l2 11',
  'M262 241 l-1 10 l3 9 l-2 12 l3 11 l-3 10 l2 13 l-3 12 l2 10 l-1 9',
  'M283 244 l2 12 l-3 10 l2 13 l-2 11 l3 12 l-2 13 l2 10',
  'M176 262 l6 4 l7 -2 l8 5',
  'M240 318 l9 -3 l8 4 l10 -2',
  'M301 268 l-12 5 l-9 -2 l-8 4',
] as const

const BAND_SHAPE = `M${BAND.left} ${TOP} C${BAND.left - 4} ${AXIS - 28} ${BAND.left - 4} ${AXIS + 28} ${BAND.left} ${BOT} L${BAND.right} ${BOT} C${BAND.right + 4} ${AXIS + 28} ${BAND.right + 4} ${AXIS - 28} ${BAND.right} ${TOP} Z`

function bandRule(x: number, bulge: number): string {
  return `M${x} ${TOP + 2} C${x + bulge} ${AXIS - 28} ${x + bulge} ${AXIS + 28} ${x} ${BOT - 2}`
}

/* La fumée. Born on the burn line, lit by the ember at its foot, and drawn in
   three layers so that it thins as it rises rather than ends:

     - the body is a ribbon that widens with height, filled with a fade and
       torn into wisps by a turbulence displacement — two copies with
       different seeds rise out of phase, so the smoke never restarts and
       never shows an edge;
     - two threads leave the foot of the ash, thin and sharper, warmed by the
       ember for their first inches;
     - a breath of ember light sits where the smoke leaves the fire.

   Everything is relative to the ember (0, 0), y negative upward. The first
   version was two blurred strokes under a mask left in its default units:
   a mask's region is the box of what it masks plus a tenth, so the blur was
   cut by two straight vertical edges — the one thing this plate forbids. */
function plume(seed: number): string {
  const N = 16
  const H = 236
  const left: string[] = []
  const right: string[] = []
  for (let i = 0; i <= N; i += 1) {
    const t = i / N
    const y = -H * t
    const cx = 9 * Math.sin(t * 5.1 + seed) + 22 * t * Math.sin(t * 2.3 + 0.4 * seed)
    const w = 5 + 52 * Math.pow(t, 1.35)
    left.push(`${f(cx - w + 4 * Math.sin(t * 9.3 + seed))} ${f(y)}`)
    right.push(`${f(cx + w + 4 * Math.sin(t * 7.7 + 1.2 + seed))} ${f(y)}`)
  }
  return `M${left.join(' L')} L${right.reverse().join(' L')} Z`
}

const PLUMES = [
  { d: plume(0), filter: 'vt-smoke-wisps-a', dur: '13s', delay: '0s' },
  { d: plume(1.7), filter: 'vt-smoke-wisps-b', dur: '13s', delay: '-6.5s' },
] as const

const THREADS = [
  {
    d: 'M0 0 C-5 -20 9 -36 -1 -60 C-9 -80 7 -96 -3 -122 C-8 -136 2 -148 -4 -164',
    w: 3.4,
    o: 0.55,
    dur: '9s',
    delay: '0s',
  },
  {
    d: 'M6 2 C3 -18 17 -30 10 -52 C4 -70 19 -84 12 -106 C8 -118 15 -130 11 -142',
    w: 2.2,
    o: 0.42,
    dur: '11s',
    delay: '-4s',
  },
] as const

const BAND_CENTER = (BAND.left + BAND.right) / 2

export function CigarPlate() {
  const t = m.landing.plate
  const [emberX, emberY] = rot(BURN, TOP - 4)
  const [emberDotX, emberDotY] = rot(BURN, BOT + 9)
  const [bandDotX, bandDotY] = rot(BAND_CENTER, TOP - 9)
  const [wrapDotX, wrapDotY] = rot(600, BOT + 9)
  const [vitDotX, vitDotY] = rot(1180, BOT + 9)

  return (
    <div className="cigar-plate" role="img" aria-label={t.alt}>
      <div className="cigar-plate__box">
        <svg
          viewBox="0 0 1440 520"
          preserveAspectRatio="xMinYMid slice"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <clipPath id="vt-body">
              <path d={BODY} />
            </clipPath>
            <clipPath id="vt-ash">
              <path d={ASH} />
            </clipPath>
            <clipPath id="vt-band">
              <path d={BAND_SHAPE} />
            </clipPath>

            {/* Texture: noise, desaturated, blended over the matter. */}
            <filter id="vt-leaf-noise" x="0" y="0" width="100%" height="100%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.018 0.07"
                numOctaves={3}
                seed={11}
              />
              <feColorMatrix type="saturate" values="0" />
            </filter>
            <filter id="vt-ash-noise" x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.06 0.2" numOctaves={4} seed={5} />
              <feColorMatrix type="saturate" values="0" />
            </filter>

            {/* Displacement: the drawing is straight to the pixel until this. */}
            <filter id="vt-wobble-leaf" x="-4%" y="-20%" width="108%" height="140%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.008 0.035"
                numOctaves={2}
                seed={23}
                result="t"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="t"
                scale={3.5}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
            <filter id="vt-wobble-ash" x="-20%" y="-30%" width="140%" height="160%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.02 0.06"
                numOctaves={3}
                seed={9}
                result="t"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="t"
                scale={7}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>

            <filter id="vt-soft" x="-30%" y="-60%" width="160%" height="220%">
              <feGaussianBlur stdDeviation={2} />
            </filter>
            <filter id="vt-softer" x="-30%" y="-60%" width="160%" height="220%">
              <feGaussianBlur stdDeviation={7} />
            </filter>
            <filter id="vt-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation={18} />
            </filter>
            {/* The smoke. A turbulence tears the ribbon into wisps, then a blur
                softens what is left. The regions are in user space and wide:
                a region measured on the ribbon's own box would cut the wisps
                with straight edges. */}
            <filter
              id="vt-smoke-wisps-a"
              filterUnits="userSpaceOnUse"
              x={-240}
              y={-330}
              width={480}
              height={390}
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.013 0.03"
                numOctaves={3}
                seed={11}
                result="n"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="n"
                scale={44}
                xChannelSelector="R"
                yChannelSelector="G"
              />
              <feGaussianBlur stdDeviation={5} />
            </filter>
            <filter
              id="vt-smoke-wisps-b"
              filterUnits="userSpaceOnUse"
              x={-240}
              y={-330}
              width={480}
              height={390}
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.011 0.034"
                numOctaves={3}
                seed={23}
                result="n"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="n"
                scale={40}
                xChannelSelector="R"
                yChannelSelector="G"
              />
              <feGaussianBlur stdDeviation={5} />
            </filter>
            <filter
              id="vt-smoke-thread"
              filterUnits="userSpaceOnUse"
              x={-240}
              y={-330}
              width={480}
              height={390}
            >
              <feGaussianBlur stdDeviation={1.6} />
            </filter>

            {/* The leaf, warmed near the ember, deepening toward the head. */}
            <linearGradient id="vt-leaf" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" style={{ stopColor: 'var(--plate-leaf-lit)' }} />
              <stop offset="0.16" style={{ stopColor: 'var(--plate-leaf)' }} />
              <stop offset="0.58" style={{ stopColor: 'var(--plate-leaf)' }} />
              <stop offset="0.86" style={{ stopColor: 'var(--plate-leaf-deep)' }} />
              <stop offset="1" style={{ stopColor: 'var(--plate-leaf-deep)' }} />
            </linearGradient>
            {/* The drape of the cylinder: a lit crest a third of the way down. */}
            <linearGradient id="vt-drape" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="rgb(0 0 0)" stopOpacity={0.9} />
              <stop offset="0.05" stopColor="rgb(0 0 0)" stopOpacity={0.58} />
              <stop offset="0.14" stopColor="rgb(0 0 0)" stopOpacity={0.26} />
              <stop offset="0.27" stopColor="rgb(0 0 0)" stopOpacity={0.05} />
              <stop offset="0.36" stopColor="rgb(0 0 0)" stopOpacity={0} />
              <stop offset="0.5" stopColor="rgb(0 0 0)" stopOpacity={0.03} />
              <stop offset="0.62" stopColor="rgb(0 0 0)" stopOpacity={0.18} />
              <stop offset="0.78" stopColor="rgb(0 0 0)" stopOpacity={0.48} />
              <stop offset="0.92" stopColor="rgb(0 0 0)" stopOpacity={0.76} />
              <stop offset="1" stopColor="rgb(0 0 0)" stopOpacity={0.94} />
            </linearGradient>
            <linearGradient id="vt-char" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" style={{ stopColor: 'var(--plate-char)' }} stopOpacity={0.97} />
              <stop offset="0.35" style={{ stopColor: 'var(--plate-char)' }} stopOpacity={0.62} />
              <stop offset="1" style={{ stopColor: 'var(--plate-char)' }} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="vt-ashfill" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" style={{ stopColor: 'var(--plate-ash-old)' }} />
              <stop offset="0.42" style={{ stopColor: 'var(--plate-ash)' }} />
              <stop offset="0.86" style={{ stopColor: 'var(--plate-ash-fresh)' }} />
              <stop offset="1" style={{ stopColor: 'var(--plate-ash)' }} />
            </linearGradient>
            {/* Ash is pale: its shoulders darken without going black. */}
            <linearGradient id="vt-ashdrape" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="rgb(0 0 0)" stopOpacity={0.7} />
              <stop offset="0.08" stopColor="rgb(0 0 0)" stopOpacity={0.42} />
              <stop offset="0.22" stopColor="rgb(0 0 0)" stopOpacity={0.12} />
              <stop offset="0.34" stopColor="rgb(255 252 246)" stopOpacity={0.1} />
              <stop offset="0.46" stopColor="rgb(255 252 246)" stopOpacity={0.02} />
              <stop offset="0.62" stopColor="rgb(0 0 0)" stopOpacity={0.18} />
              <stop offset="0.82" stopColor="rgb(0 0 0)" stopOpacity={0.5} />
              <stop offset="1" stopColor="rgb(0 0 0)" stopOpacity={0.78} />
            </linearGradient>
            <radialGradient id="vt-cut" cx="0.42" cy="0.46" r="0.6">
              <stop offset="0" style={{ stopColor: 'var(--plate-cut-core)' }} />
              <stop offset="0.5" style={{ stopColor: 'var(--plate-cut)' }} />
              <stop offset="1" style={{ stopColor: 'var(--plate-char)' }} />
            </radialGradient>
            <radialGradient id="vt-ember-glow">
              <stop offset="0" style={{ stopColor: 'var(--plate-ember)' }} stopOpacity={0.5} />
              <stop offset="0.35" style={{ stopColor: 'var(--plate-ember)' }} stopOpacity={0.16} />
              <stop offset="1" style={{ stopColor: 'var(--plate-ember)' }} stopOpacity={0} />
            </radialGradient>
            <radialGradient id="vt-ground-glow">
              <stop offset="0" style={{ stopColor: 'var(--plate-ember)' }} stopOpacity={0.22} />
              <stop offset="0.45" style={{ stopColor: 'var(--plate-ember)' }} stopOpacity={0.06} />
              <stop offset="1" style={{ stopColor: 'var(--plate-ember)' }} stopOpacity={0} />
            </radialGradient>
            {/* The band: brass, lit from above like the leaf under it. */}
            <linearGradient id="vt-brass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--plate-band-edge)' }} />
              <stop offset="0.05" style={{ stopColor: 'var(--plate-band-lo)' }} />
              <stop offset="0.17" style={{ stopColor: 'var(--plate-band)' }} />
              <stop offset="0.31" style={{ stopColor: 'var(--plate-band-hi)' }} />
              <stop offset="0.48" style={{ stopColor: 'var(--plate-band)' }} />
              <stop offset="0.74" style={{ stopColor: 'var(--plate-band-lo)' }} />
              <stop offset="0.92" style={{ stopColor: 'var(--plate-band-edge)' }} />
              <stop offset="1" style={{ stopColor: 'var(--plate-band-edge)' }} />
            </linearGradient>
            <linearGradient id="vt-brass-ends" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="rgb(0 0 0)" stopOpacity={0.4} />
              <stop offset="0.14" stopColor="rgb(0 0 0)" stopOpacity={0} />
              <stop offset="0.86" stopColor="rgb(0 0 0)" stopOpacity={0} />
              <stop offset="1" stopColor="rgb(0 0 0)" stopOpacity={0.4} />
            </linearGradient>
            <linearGradient id="vt-smoke-fade" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="rgb(255 255 255)" stopOpacity={1} />
              <stop offset="0.5" stopColor="rgb(255 255 255)" stopOpacity={0.9} />
              <stop offset="1" stopColor="rgb(255 255 255)" stopOpacity={0} />
            </linearGradient>
            {/* The plume's own fade, from the foot to nothing. */}
            <linearGradient id="vt-smoke-body" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" style={{ stopColor: 'var(--plate-smoke)' }} stopOpacity={0.5} />
              <stop offset="0.35" style={{ stopColor: 'var(--plate-smoke)' }} stopOpacity={0.34} />
              <stop offset="1" style={{ stopColor: 'var(--plate-smoke)' }} stopOpacity={0} />
            </linearGradient>
            {/* A thread is warmed by the ember for its first inches. */}
            <linearGradient
              id="vt-smoke-heat"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2="0"
              y2="-130"
            >
              <stop offset="0" style={{ stopColor: 'var(--plate-ember-hot)' }} />
              <stop offset="0.3" style={{ stopColor: 'var(--plate-smoke)' }} />
              <stop offset="1" style={{ stopColor: 'var(--plate-smoke)' }} stopOpacity={0} />
            </linearGradient>
            <radialGradient id="vt-smoke-breath">
              <stop offset="0" style={{ stopColor: 'var(--plate-ember-hot)' }} stopOpacity={0.4} />
              <stop offset="1" style={{ stopColor: 'var(--plate-ember)' }} stopOpacity={0} />
            </radialGradient>
            {/* In user space, and wide: a mask's default region is the box of
                what it masks plus a tenth — the ribbon's box, not the wisps'. */}
            <mask
              id="vt-smoke-mask"
              maskUnits="userSpaceOnUse"
              x={f(emberX - 240)}
              y={0}
              width={480}
              height={f(emberY + 30)}
            >
              <rect
                x={f(emberX - 240)}
                y={0}
                width={480}
                height={f(emberY + 30)}
                fill="url(#vt-smoke-fade)"
              />
            </mask>
          </defs>

          {/* The single light source of the composition, on the ground. */}
          <ellipse
            cx={emberX}
            cy={AXIS + 10}
            rx={330}
            ry={210}
            fill="url(#vt-ground-glow)"
            style={{ mixBlendMode: 'screen' }}
          />

          {/* Cast shadow — outside the tilt, on the table. */}
          <ellipse
            cx={790}
            cy={392}
            rx={580}
            ry={20}
            fill="rgb(0 0 0)"
            fillOpacity={0.5}
            filter="url(#vt-glow)"
          />

          <g transform={`rotate(${TILT} 760 ${AXIS})`}>
            {/* ------------------------------------------------- the ash */}
            <g filter="url(#vt-wobble-ash)">
              <path d={ASH} fill="url(#vt-ashfill)" />
              <g clipPath="url(#vt-ash)">
                <rect
                  x={160}
                  y={TOP - 10}
                  width={160}
                  height={R * 2 + 20}
                  filter="url(#vt-ash-noise)"
                  opacity={0.55}
                  style={{ mixBlendMode: 'overlay' }}
                />
                <rect x={160} y={TOP} width={160} height={R * 2} fill="url(#vt-ashdrape)" />
                {CRACKS.map((d) => (
                  <g key={d}>
                    <path
                      d={d}
                      fill="none"
                      stroke="rgb(255 250 240)"
                      strokeOpacity={0.16}
                      strokeWidth={0.9}
                      transform="translate(1.2 0.6)"
                    />
                    <path
                      d={d}
                      fill="none"
                      stroke="rgb(18 14 10)"
                      strokeOpacity={0.62}
                      strokeWidth={1.3}
                    />
                  </g>
                ))}
              </g>
            </g>

            {/* ------------------------------------------------ the leaf */}
            <g filter="url(#vt-wobble-leaf)">
              <g clipPath="url(#vt-body)">
                <path d={BODY} fill="url(#vt-leaf)" />

                {/* Blotches: a wrapper is never one brown. */}
                <ellipse
                  cx={560}
                  cy={318}
                  rx={180}
                  ry={40}
                  style={{ fill: 'var(--plate-leaf-lit)' }}
                  opacity={0.3}
                  filter="url(#vt-glow)"
                />
                <ellipse
                  cx={766}
                  cy={262}
                  rx={150}
                  ry={34}
                  style={{ fill: 'var(--plate-leaf-deep)' }}
                  opacity={0.5}
                  filter="url(#vt-glow)"
                />
                <ellipse
                  cx={1126}
                  cy={322}
                  rx={190}
                  ry={44}
                  style={{ fill: 'var(--plate-leaf-lit)' }}
                  opacity={0.22}
                  filter="url(#vt-glow)"
                />

                <rect
                  x={BURN - 10}
                  y={TOP - 10}
                  width={HEAD - BURN + 20}
                  height={R * 2 + 20}
                  filter="url(#vt-leaf-noise)"
                  opacity={0.42}
                  style={{ mixBlendMode: 'overlay' }}
                />

                {/* Veins, then seams: matter before light. */}
                {VEINS.map((v) => (
                  <path
                    key={v.x}
                    d={helix(v.x, v.run)}
                    fill="none"
                    style={{ stroke: 'var(--plate-leaf-vein)' }}
                    strokeOpacity={v.o}
                    strokeWidth={0.9}
                  />
                ))}
                {SEAMS.map((s) => (
                  <g key={s.x}>
                    <path
                      d={helix(s.x, s.run)}
                      fill="none"
                      stroke="rgb(0 0 0)"
                      strokeOpacity={0.36 * s.w}
                      strokeWidth={2.4}
                      filter="url(#vt-soft)"
                    />
                    <path
                      d={helix(s.x, s.run)}
                      fill="none"
                      stroke="rgb(0 0 0)"
                      strokeOpacity={0.3 * s.w}
                      strokeWidth={1}
                    />
                    <path
                      d={helix(s.x + 2.2, s.run)}
                      fill="none"
                      stroke="rgb(255 226 180)"
                      strokeOpacity={0.09 * s.w}
                      strokeWidth={1.1}
                    />
                  </g>
                ))}

                <rect
                  x={BURN - 10}
                  y={TOP}
                  width={HEAD - BURN + 20}
                  height={R * 2}
                  fill="url(#vt-drape)"
                />

                {/* The oil: a light whose edges wander, and which the ember does not reach. */}
                <path
                  d={sheen()}
                  fill="rgb(255 238 206)"
                  fillOpacity={0.13}
                  filter="url(#vt-softer)"
                />
                <path
                  d={rim()}
                  fill="none"
                  stroke="rgb(236 220 196)"
                  strokeOpacity={0.3}
                  strokeWidth={1.4}
                  filter="url(#vt-soft)"
                />

                {/* Bounce from the ember on the near end. */}
                <ellipse
                  cx={336}
                  cy={AXIS}
                  rx={96}
                  ry={72}
                  style={{ fill: 'var(--plate-ember)' }}
                  opacity={0.26}
                  filter="url(#vt-glow)"
                />

                {/* The band's paper is thicker than the leaf: a hairline of shadow either side. */}
                <path
                  d={`M${BAND.left - 5} ${TOP} L${BAND.left - 5} ${BOT}`}
                  stroke="rgb(0 0 0)"
                  strokeOpacity={0.5}
                  strokeWidth={9}
                  filter="url(#vt-soft)"
                />
                <path
                  d={`M${BAND.right + 5} ${TOP} L${BAND.right + 5} ${BOT}`}
                  stroke="rgb(0 0 0)"
                  strokeOpacity={0.5}
                  strokeWidth={9}
                  filter="url(#vt-soft)"
                />

                {/* The charred edge, laid last on the leaf. */}
                <path d={char()} fill="url(#vt-char)" />
              </g>
            </g>

            {/* ------------------------------------------------ the head */}
            <ellipse cx={HEAD} cy={AXIS} rx={12} ry={52} fill="url(#vt-cut)" />
            <path
              d={`M1250 ${TOP + 1} C1284 ${TOP + 2} 1301 ${TOP + 10} ${HEAD - 1} ${AXIS - 50}`}
              fill="none"
              stroke="rgb(236 220 196)"
              strokeOpacity={0.22}
              strokeWidth={1.2}
            />

            {/* ------------------------------------------------ la bague */}
            <g clipPath="url(#vt-band)">
              <path d={BAND_SHAPE} fill="url(#vt-brass)" />
              <rect
                x={BAND.left - 6}
                y={TOP}
                width={BAND.right - BAND.left + 12}
                height={R * 2}
                fill="url(#vt-brass-ends)"
              />
              <path
                d={bandRule(BAND.left + 13, -2)}
                fill="none"
                style={{ stroke: 'var(--plate-band-ink)' }}
                strokeOpacity={0.6}
                strokeWidth={1}
              />
              <path
                d={bandRule(BAND.left + 17, -2)}
                fill="none"
                style={{ stroke: 'var(--plate-band-hi)' }}
                strokeOpacity={0.75}
                strokeWidth={0.8}
              />
              <path
                d={bandRule(BAND.right - 13, 2)}
                fill="none"
                style={{ stroke: 'var(--plate-band-ink)' }}
                strokeOpacity={0.6}
                strokeWidth={1}
              />
              <path
                d={bandRule(BAND.right - 17, 2)}
                fill="none"
                style={{ stroke: 'var(--plate-band-hi)' }}
                strokeOpacity={0.75}
                strokeWidth={0.8}
              />
              <text x={BAND_CENTER} y={AXIS + 6} textAnchor="middle" className="plate-band-mark">
                {BRAND.name.toUpperCase()}
              </text>
              <path
                d={`M${BAND_CENTER - 44} ${AXIS - 16} L${BAND_CENTER + 44} ${AXIS - 16}`}
                style={{ stroke: 'var(--plate-band-ink)' }}
                strokeOpacity={0.5}
                strokeWidth={0.8}
              />
              <text x={BAND_CENTER} y={AXIS + 24} textAnchor="middle" className="plate-band-sub">
                {t.bandVitola.toUpperCase()}
              </text>
              <rect
                x={BAND.left - 6}
                y={TOP}
                width={BAND.right - BAND.left + 12}
                height={R * 2}
                fill="url(#vt-drape)"
                opacity={0.7}
              />
            </g>

            {/* --------------------------------------------- the burn line */}
            <ellipse
              cx={BURN - 4}
              cy={AXIS}
              rx={80}
              ry={110}
              fill="url(#vt-ember-glow)"
              style={{ mixBlendMode: 'screen' }}
            />
            <path
              d={burn()}
              fill="none"
              style={{ stroke: 'var(--plate-ember)' }}
              strokeWidth={5.5}
              strokeLinecap="round"
              filter="url(#vt-soft)"
              className="plate-ember-breathe"
            />
            <path
              d={burn()}
              fill="none"
              style={{ stroke: 'var(--plate-ember-hot)' }}
              strokeWidth={2}
              strokeLinecap="round"
              className="plate-ember-breathe"
            />
            <path
              d={burn()}
              fill="none"
              style={{ stroke: 'var(--plate-ember-white)' }}
              strokeOpacity={0.7}
              strokeWidth={1}
              strokeLinecap="round"
            />
          </g>

          {/* --------------------------------------------------- la fumée */}
          <g mask="url(#vt-smoke-mask)">
            <g className="plate-smoke" transform={`translate(${f(emberX)} ${f(emberY)})`}>
              {/* The breath of light where the smoke leaves the fire. */}
              <ellipse
                className="plate-smoke-breath"
                cx={4}
                cy={-14}
                rx={26}
                ry={40}
                fill="url(#vt-smoke-breath)"
                style={{ mixBlendMode: 'screen' }}
              />
              {PLUMES.map((p) => (
                <path
                  key={p.filter}
                  className="plate-smoke-body"
                  d={p.d}
                  fill="url(#vt-smoke-body)"
                  filter={`url(#${p.filter})`}
                  style={{ '--dur': p.dur, '--delay': p.delay } as React.CSSProperties}
                />
              ))}
              {THREADS.map((s) => (
                <path
                  key={s.d}
                  className="plate-smoke-thread"
                  d={s.d}
                  fill="none"
                  stroke="url(#vt-smoke-heat)"
                  strokeWidth={s.w}
                  strokeLinecap="round"
                  filter="url(#vt-smoke-thread)"
                  style={{ '--o': s.o, '--dur': s.dur, '--delay': s.delay } as React.CSSProperties}
                />
              ))}
            </g>
          </g>

          {/* --------------------------------------------- the annotations
              A plate in a reference work: leader lines and measurements. */}
          <g className="plate-note">
            <circle
              cx={f(emberDotX)}
              cy={f(emberDotY)}
              r={3}
              fill="none"
              style={{ stroke: 'var(--color-accent)' }}
            />
            <line
              x1={f(emberDotX)}
              y1={f(emberDotY + 4)}
              x2={f(emberDotX)}
              y2={412}
              style={{ stroke: 'var(--color-rule-strong)' }}
            />
            <text x={f(emberDotX - 74)} y={440} className="plate-label">
              {t.emberLabel}
            </text>
            <text x={f(emberDotX - 74)} y={462} className="plate-value">
              {t.emberValue}
            </text>
          </g>
          <g className="plate-note">
            <circle
              cx={f(bandDotX)}
              cy={f(bandDotY)}
              r={3}
              fill="none"
              style={{ stroke: 'var(--color-accent)' }}
            />
            <line
              x1={f(bandDotX)}
              y1={162}
              x2={f(bandDotX)}
              y2={f(bandDotY - 4)}
              style={{ stroke: 'var(--color-rule-strong)' }}
            />
            <text x={f(bandDotX)} y={126} textAnchor="middle" className="plate-label">
              {t.bandLabel}
            </text>
            <text x={f(bandDotX)} y={148} textAnchor="middle" className="plate-value">
              {t.bandValue}
            </text>
          </g>
          <g className="plate-note">
            <circle
              cx={f(wrapDotX)}
              cy={f(wrapDotY)}
              r={3}
              fill="none"
              style={{ stroke: 'var(--color-accent)' }}
            />
            <line
              x1={f(wrapDotX)}
              y1={f(wrapDotY + 4)}
              x2={f(wrapDotX)}
              y2={412}
              style={{ stroke: 'var(--color-rule-strong)' }}
            />
            <text x={f(wrapDotX)} y={440} textAnchor="middle" className="plate-label">
              {t.wrapperLabel}
            </text>
            <text x={f(wrapDotX)} y={462} textAnchor="middle" className="plate-value">
              {t.wrapperValue}
            </text>
          </g>
          <g className="plate-note">
            <circle
              cx={f(vitDotX)}
              cy={f(vitDotY)}
              r={3}
              fill="none"
              style={{ stroke: 'var(--color-accent)' }}
            />
            <line
              x1={f(vitDotX)}
              y1={f(vitDotY + 4)}
              x2={f(vitDotX)}
              y2={412}
              style={{ stroke: 'var(--color-rule-strong)' }}
            />
            <text x={f(vitDotX)} y={440} textAnchor="middle" className="plate-label">
              {t.vitolaLabel}
            </text>
            <text x={f(vitDotX)} y={462} textAnchor="middle" className="plate-value">
              <tspan className="plate-mono">{t.vitolaDimensions}</tspan> — {t.vitolaName}
            </text>
          </g>
        </svg>
      </div>
    </div>
  )
}
