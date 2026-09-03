/**
 * The one progress bar.
 *
 * Every depth draws this — a root run, a subagent, a card pinned to a board —
 * so a bar means the same thing wherever somebody sees one.
 *
 * FOUR STATES, AND THEY ARE NOT INTERCHANGEABLE:
 *
 *   a share    `pct` is a number. A filled track.
 *   a guess    the same, drawn in the ESTIMATE colour, because a model read it
 *              off the transcript and it may be wrong.
 *   unknown    `pct` is null. A striped indeterminate track — NOT an empty one,
 *              because an empty bar says "nothing has happened" and this says
 *              "nobody can say", which are opposite claims about a run.
 *   blocked    a run that is stuck. Amber, and it stays wherever it got to.
 *
 * A finished run is drawn full whatever its last number was: `done` is 100% by
 * definition, and a run that ended at "60%" was mis-measured, not two-fifths
 * unfinished.
 */
import type { CSSProperties } from 'react'

import type { Progress } from './types.ts'

/**
 * The indeterminate stripe's motion, inserted once.
 *
 * It lives HERE rather than in `index.html`, whose own comment says that
 * document answers only the two questions no stylesheet can — how tall the app
 * is, and that its child is a flex item. A keyframe used by one component is
 * not one of those.
 */
const drift = 'hanzo-bar-drift'
if (typeof document !== 'undefined' && !document.getElementById(drift)) {
  const rule = document.createElement('style')
  rule.id = drift
  rule.textContent = `@keyframes ${drift}{from{background-position:0 0}to{background-position:32px 0}}`
  document.head.append(rule)
}

/** Measured is green, a model's guess is violet, blocked is amber. */
const colour = (of: Progress): string => {
  if (of.phase === 'error') return '#f87171'
  if (of.phase === 'blocked') return '#fbbf24'
  if (of.phase === 'done') return '#34d399'
  return of.estimated ? '#a78bfa' : '#34d399'
}

const TRACK: CSSProperties = {
  width: '100%',
  height: 4,
  borderRadius: 2,
  background: 'rgba(255, 255, 255, 0.08)',
  overflow: 'hidden',
  position: 'relative',
}

export const Bar = ({ of, height = 4 }: { of: Progress; height?: number }) => {
  // `done` is 100% by definition — a run that ended is not still two-fifths of
  // the way through whatever its last report happened to say.
  const share = of.phase === 'done' ? 100 : of.pct
  const tone = colour(of)

  return (
    <div
      style={{ ...TRACK, height }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      // An indeterminate bar reports NO value, which is what a screen reader
      // needs in order to say "busy" rather than "nought percent".
      aria-valuenow={share ?? undefined}
      aria-valuetext={
        share === null ? `${of.phase}, share unknown` : `${share}%${of.estimated ? ' (estimated)' : ''}`
      }
      title={of.activity || of.phase}
    >
      {share === null ? (
        // Indeterminate. A moving stripe rather than an empty track, because an
        // empty track is a claim that nothing has happened.
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `repeating-linear-gradient(115deg, ${tone}44 0 8px, transparent 8px 16px)`,
            animation: 'hanzo-bar-drift 900ms linear infinite',
          }}
        />
      ) : (
        <div
          style={{
            width: `${Math.max(0, Math.min(100, share))}%`,
            height: '100%',
            background: tone,
            transition: 'width 240ms ease',
          }}
        />
      )}
    </div>
  )
}

/**
 * The bar, plus the two things a person reads beside it.
 *
 * `estimated` is shown as a word rather than only as a colour: an estimate
 * rendered as a measurement is what tells somebody a stuck run is fine, and
 * colour alone is not something everybody can read.
 */
export const Progressing = ({ of }: { of: Progress }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
    <Bar of={of} />
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        fontSize: 10.5,
        color: 'rgba(255, 255, 255, 0.45)',
      }}
    >
      <span
        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={of.activity}
      >
        {of.activity || of.phase}
      </span>
      <span style={{ flexShrink: 0, display: 'inline-flex', gap: 6 }}>
        {of.estimated ? (
          <span
            style={{ color: '#a78bfa' }}
            title="A model read this off the run's transcript. It is not a measurement."
          >
            est
          </span>
        ) : null}
        <span>{of.phase === 'done' ? '100%' : of.pct === null ? '—' : `${of.pct}%`}</span>
      </span>
    </div>
  </div>
)
