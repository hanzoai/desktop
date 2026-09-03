/**
 * The runs pinned to this board, and how far along each one is.
 *
 * It draws nothing when nothing is pinned — an empty strip above a board is a
 * heading with no answer under it, which is the shape this app keeps deleting.
 *
 * **It says the pins are local.** Nothing on the wire records that somebody is
 * watching a run, so a teammate opening the same board sees their own pins and
 * not these, and the strip states that rather than letting a reader assume a
 * shared view.
 */
import { X } from '@hanzogui/lucide-icons-2'

import { Progressing } from './Bar'
import { pin, usePinned } from './pinned'
import { useLiveRuns } from './store'

export const Watching = ({ live = true }: { live?: boolean }) => {
  const { runs, ids } = usePinned()
  // The strip is a live surface: a pinned run's bar fills from the same feed
  // the queue follows.
  useLiveRuns(live)

  if (ids.length === 0) return null

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '10px 16px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        background: 'rgba(255, 255, 255, 0.015)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.5,
          color: 'rgba(255, 255, 255, 0.35)',
        }}
      >
        <span>WATCHING</span>
        <span style={{ fontWeight: 400, letterSpacing: 0 }}>· pinned on this machine</span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 10,
        }}
      >
        {runs.map((run) => (
          <div
            key={run.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
              padding: '8px 10px',
              borderRadius: 8,
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 11.5,
                  color: '#ffffff',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {run.title}
              </span>
              {run.children > 0 ? (
                <span
                  style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}
                  title={`${run.children} subtask${run.children === 1 ? '' : 's'}`}
                >
                  {run.children}↳
                </span>
              ) : null}
              <button
                type="button"
                title="Stop watching"
                onClick={() => pin.drop(run.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,0.35)',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'inline-flex',
                }}
              >
                <X size={11} />
              </button>
            </div>
            <Progressing of={run.progress} />
          </div>
        ))}
      </div>

      {/* A pin that names a run the list no longer carries resolves to nothing
          rather than to a stale row, so the two counts can differ and the strip
          says why instead of quietly showing fewer. */}
      {runs.length < ids.length ? (
        <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.35)' }}>
          {ids.length - runs.length} pinned run
          {ids.length - runs.length === 1 ? ' is' : 's are'} no longer in the list.
        </div>
      ) : null}
    </div>
  )
}
