/**
 * The frame a browsing panel is drawn in.
 *
 * Three panels list what the estate can reach — the subsystems it mounts, the
 * skills an org holds, the providers it has connected — and each wants the same
 * furniture: a scrim that closes, a frame, a title, a way to narrow by kind and
 * a way to narrow by word. Written out per panel, that furniture drifts: the
 * click that closes one is not the click that closes the next.
 *
 * What it does NOT own is a row. A mounted subsystem, a skill and a provider
 * carry different facts, and a card that could draw all three would take six
 * optional props to do it. The frame is shared; the contents are not.
 *
 * Nine older modals still hand-roll this. They are listed in LLM.md rather than
 * converted here, because a panel nobody is changing is not worth the churn.
 */
import { Search, X } from '@hanzogui/lucide-icons-2'
import type { ReactNode } from 'react'

export interface SheetProps {
  icon: ReactNode
  title: string
  /** One line saying what the panel shows. Not a pitch. */
  note: string
  onClose: () => void
  /** Narrow by kind, when there is more than one kind. */
  tabs?: { id: string; label: string }[]
  tab?: string
  onTab?: (id: string) => void
  /** Narrow by word. */
  search?: string
  onSearch?: (text: string) => void
  hint?: string
  children: ReactNode
}

export const Sheet = ({
  icon,
  title,
  note,
  onClose,
  tabs,
  tab,
  onTab,
  search,
  onSearch,
  hint,
  children,
}: SheetProps) => (
  <div
    style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.78)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: 16,
    }}
    onClick={onClose}
  >
    <div
      style={{
        width: '100%',
        maxWidth: 920,
        height: 600,
        borderRadius: 16,
        border: '1px solid rgba(255, 255, 255, 0.12)',
        backgroundColor: '#0c0c0e',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {icon}
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#ffffff' }}>{title}</div>
            <div style={{ fontSize: 11.5, color: 'rgba(255, 255, 255, 0.5)' }}>{note}</div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.5)',
            cursor: 'pointer',
            padding: 4,
          }}
        >
          <X size={16} />
        </button>
      </div>

      {tabs || onSearch ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 18px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {(tabs ?? []).map((one) => (
              <button
                key={one.id}
                type="button"
                onClick={() => onTab?.(one.id)}
                className="tap"
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  background: tab === one.id ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                  border:
                    tab === one.id
                      ? '1px solid rgba(255, 255, 255, 0.15)'
                      : '1px solid transparent',
                  color: tab === one.id ? '#ffffff' : 'rgba(255, 255, 255, 0.6)',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {one.label}
              </button>
            ))}
          </div>

          {onSearch ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 6,
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                width: 220,
              }}
            >
              <Search size={13} color="rgba(255, 255, 255, 0.4)" />
              <input
                type="text"
                placeholder={hint}
                value={search ?? ''}
                onChange={(e) => onSearch(e.target.value)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: 12,
                  outline: 'none',
                  width: '100%',
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>{children}</div>
    </div>
  </div>
)

/**
 * What a panel is doing when it has nothing to draw yet.
 *
 * One component because the three states are one decision and writing them as
 * three conditions per panel is how a panel comes to show "nothing here" while
 * a read is still in flight — which reads as an empty org.
 */
export const State = ({
  fault,
  pending,
  empty,
}: {
  fault: string | null
  pending: boolean
  empty: boolean
}) => {
  if (fault) return <div style={{ fontSize: 12, color: '#f87171' }}>{fault}</div>
  if (pending && empty)
    return <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Reading…</div>
  if (empty) return <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Nothing here.</div>
  return null
}

/**
 * What is not on screen.
 *
 * Every list route this app reads is unbounded, so a panel draws a window onto
 * whatever the org has. `useShown` reports what it withholds and this renders
 * that report — never rendering it is the silent-empty failure one level over,
 * where a person concludes their org has a hundred of something.
 */
export const More = ({ more, total, grow }: { more: number; total: number; grow: () => void }) =>
  more > 0 ? (
    <button
      type="button"
      onClick={grow}
      className="tap"
      style={{
        gridColumn: '1 / -1',
        padding: '8px 10px',
        borderRadius: 8,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: 'rgba(255,255,255,0.6)',
        fontSize: 11.5,
        cursor: 'pointer',
      }}
    >
      {more} more of {total}
    </button>
  ) : null
