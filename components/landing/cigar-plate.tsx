import { BRAND } from '@/lib/brand'
import { m } from '@/lib/i18n'

/**
 * The lit cigar of the landing page (§4.4, §4.5).
 *
 * Drawn rather than photographed, for two reasons that pull the same way: a
 * stock photograph of a cigar is somebody's advertising, and a drawing can be
 * annotated. What is on screen is a plate in a reference work — the ember, the
 * band, the wrapper shade and the vitola are all labelled — not a poster.
 *
 * The geometry and the light live in app/landing.css; the pigment lives in
 * app/globals.css as --plate-*. Everything here is structure.
 *
 * Two things are load-bearing and easy to break:
 *
 *   - The band is a real 3D ring: sixteen slats laid on a cylinder of radius
 *     58px. Its lighting sheet is a SIBLING of the ring, not a child, so the
 *     light stays put while the ring sways. Nest it inside and the highlight
 *     rotates with the metal, which reads as a sticker.
 *   - The two SVG filters below are referenced by CSS `filter: url(#…)`, which
 *     only resolves within the same document. They must be rendered here, not
 *     imported from a file.
 */

/** Sixteen slats at 22.5° each: one full turn around the cigar's axis. */
const SLATS = [-8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7] as const

/** Puffs, pre-seeded with negative delays so the column is never empty. */
const WISPS = [
  { left: 47, size: 48, dx: 52, duration: 10, delay: -0.6 },
  { left: 33, size: 76, dx: -34, duration: 13, delay: -3.4 },
  { left: 53, size: 36, dx: 84, duration: 9, delay: -6.1 },
  { left: 39, size: 64, dx: 30, duration: 14.5, delay: -8.8 },
  { left: 26, size: 90, dx: -58, duration: 16, delay: -11.5 },
  { left: 51, size: 40, dx: 70, duration: 11.5, delay: -2 },
  { left: 43, size: 56, dx: 44, duration: 12.5, delay: -5 },
  { left: 57, size: 30, dx: -20, duration: 8.2, delay: -7.4 },
] as const

/** A leader line and its dot, from a label to the point it names. */
function Note({
  left,
  top,
  lineTop,
  lineHeight,
  dotTop,
  anchor,
  label,
  children,
}: {
  left: number
  top: number
  lineTop: number
  lineHeight: number
  dotTop: number
  anchor: number
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="note absolute" style={{ left, top, width: 240 }}>
      <p className="eyebrow text-ink">{label}</p>
      <p className="text-ink-muted text-xs leading-snug">{children}</p>
      <span
        aria-hidden="true"
        className="note-l"
        style={{ left: anchor, top: lineTop, height: lineHeight }}
      />
      <span aria-hidden="true" className="note-d" style={{ left: anchor - 3, top: dotTop }} />
    </div>
  )
}

export function CigarPlate() {
  const t = m.landing.plate

  return (
    <div className="cigar-plate" role="img" aria-label={t.alt}>
      {/* Turbulence displacement. Referenced from app/landing.css by id, so it
          has to live in the rendered document — hence a 0×0 inline svg. */}
      <svg width="0" height="0" aria-hidden="true" focusable="false" className="absolute">
        <filter
          id="vt-ash-rough"
          x="-14%"
          y="-28%"
          width="128%"
          height="156%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.021 0.055"
            numOctaves={3}
            seed={9}
            result="t"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="t"
            scale={6}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        <filter
          id="vt-leaf-rough"
          x="-3%"
          y="-16%"
          width="106%"
          height="132%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.009 0.038"
            numOctaves={3}
            seed={23}
            result="t"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="t"
            scale={3}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>

      <div className="cigar-plate__box">
        <div className="cigar-plate__inner">
          <span aria-hidden="true" className="glow" />

          <div className="scene" aria-hidden="true">
            <div className="cigar">
              <span className="cast" />

              <div className="body-wrap">
                <span className="stick" />
                <span className="shade" />
                <span className="mottle" />
                <span className="veins" />
                <span className="grain" />
                <span className="sheen" />
                <span className="rimlight" />
                <span className="bounce" />
              </div>

              <span className="head" />
              <span className="head-rim" />
              <span className="ring-cast" />

              <div className="ash-wrap">
                <span className="ash" />
                <span className="ash-grain" />
                <span className="ash-crack" />
                <span className="ash-shade" />
              </div>
              <span className="ash-heat" />
              <span className="char" />
              <span className="rim" />
              <span className="ember" />
              <span className="ember-core" />
              <span className="ember-glow" />

              <div className="ring">
                {SLATS.map((i) => {
                  if (i === 0) {
                    return (
                      <div
                        key={i}
                        className="slat slat-face"
                        style={{ '--i': i } as React.CSSProperties}
                      >
                        <span className="lk-fil" />
                        <span className="lk-mark">{BRAND.name}</span>
                        <span className="lk-fil" />
                      </div>
                    )
                  }
                  if (i === -1 || i === 1) {
                    return (
                      <div
                        key={i}
                        className="slat slat-sub"
                        style={{ '--i': i } as React.CSSProperties}
                      >
                        {i === -1 ? BRAND.tagline : t.bandVitola}
                      </div>
                    )
                  }
                  return (
                    <div key={i} className="slat" style={{ '--i': i } as React.CSSProperties} />
                  )
                })}
              </div>
              <span className="ring-light" />
              <span className="ring-spec" />
            </div>
          </div>

          <div className="smoke">
            <span className="ember-lit" />
            <span className="thread" />
            <span
              className="thread"
              style={{
                left: 76,
                width: 10,
                height: 132,
                animationDuration: '8.5s',
                animationDelay: '-2.5s',
                opacity: 0.72,
              }}
            />
            {WISPS.map((w) => (
              <span
                key={`${w.left}-${w.size}`}
                className="wisp"
                style={
                  {
                    left: w.left,
                    width: w.size,
                    height: w.size,
                    '--dx': `${w.dx}px`,
                    animationDuration: `${w.duration}s`,
                    animationDelay: `${w.delay}s`,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>

          <Note
            left={151}
            top={126}
            anchor={97}
            lineTop={38}
            lineHeight={92}
            dotTop={124}
            label={t.emberLabel}
          >
            {t.emberValue}
          </Note>
          <Note
            left={923}
            top={126}
            anchor={89}
            lineTop={38}
            lineHeight={92}
            dotTop={124}
            label={t.bandLabel}
          >
            {t.bandValue}
          </Note>
          <Note
            left={470}
            top={424}
            anchor={90}
            lineTop={-44}
            lineHeight={44}
            dotTop={-50}
            label={t.wrapperLabel}
          >
            {t.wrapperValue}
          </Note>
          <Note
            left={1214}
            top={424}
            anchor={86}
            lineTop={-44}
            lineHeight={44}
            dotTop={-50}
            label={t.vitolaLabel}
          >
            <span className="font-mono">{t.vitolaDimensions}</span> — {t.vitolaName}
          </Note>
        </div>
      </div>
    </div>
  )
}
