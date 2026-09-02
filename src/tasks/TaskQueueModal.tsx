/**
 * The org's live agent runs.
 *
 * A card shows the run's status, how far along it is and whether that number is
 * a MEASUREMENT or a model's estimate — the server marks the difference and so
 * does this. The transcript below is the selected run's own turns.
 *
 * The three canned "dispatch pipeline" buttons that stood here — a Next.js
 * build, a k3s pod, a KMS audit — named work this desktop cannot do; a run is
 * named by whoever starts it.
 */
import { ListTodo, Play, RotateCcw, X } from '@hanzogui/lucide-icons-2'
import { useState } from 'react'
import { taskQueueStore, useTaskQueue } from './store'
import type { DurableTask, TaskStatus } from './types'

// A session's status is exactly four words. There is no 'queued' and no
// 'retrying': a run is open or it is not, and a finished one stays finished.
const statusBadge = (status: TaskStatus) => {
  switch (status) {
    case 'done':
      return { label: 'DONE', bg: 'rgba(52, 211, 153, 0.15)', color: '#34d399', border: 'rgba(52, 211, 153, 0.3)' }
    case 'paused':
      return { label: 'PAUSED', bg: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', border: 'rgba(251, 191, 36, 0.3)' }
    case 'error':
      return { label: 'ERROR', bg: 'rgba(248, 113, 113, 0.15)', color: '#f87171', border: 'rgba(248, 113, 113, 0.3)' }
    default:
      return { label: 'RUNNING', bg: 'rgba(96, 165, 250, 0.15)', color: '#60a5fa', border: 'rgba(96, 165, 250, 0.3)' }
  }
}

/** A clock the wire sends as RFC 3339, as a short relative line. */
const ago = (at: string): string => {
  if (!at) return ''
  const then = Date.parse(at)
  if (Number.isNaN(then)) return ''
  const mins = Math.floor((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  return hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`
}

export const TaskQueueModal = () => {
  const { isOpen, tasks, activeTaskId, events, pending, fault, busy } = useTaskQueue()
  const [name, setName] = useState('')

  if (!isOpen) return null

  const activeTask = tasks.find((t) => t.id === activeTaskId) || tasks[0]

  return (
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
      onClick={() => taskQueueStore.close()}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 880,
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
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'linear-gradient(135deg, rgba(52, 211, 153, 0.25), rgba(96, 165, 250, 0.25))',
                border: '1px solid rgba(52, 211, 153, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#34d399',
              }}
            >
              <ListTodo size={18} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#ffffff' }}>
                Durable Task Queue & CI/CD Pipelines
              </div>
              <div style={{ fontSize: 11.5, color: 'rgba(255, 255, 255, 0.5)' }}>
                Persistent background task orchestration running against local Node, k3s, and Hanzo Cloud.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => taskQueueStore.close()}
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

        {/* Open a run, by name */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            void taskQueueStore.dispatchTask(name.trim())
            setName('')
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            backgroundColor: 'rgba(255, 255, 255, 0.01)',
          }}
        >
          <input
            type="text"
            placeholder="Name a run…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: 6,
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#ffffff',
              fontSize: 12,
              outline: 'none',
            }}
          />
          <button
            type="submit"
            className="tap"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 12px',
              borderRadius: 6,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#ffffff',
              fontSize: 11.5,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Play size={11} color="#34d399" />
            <span>Open</span>
          </button>
          {pending ? (
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>reading…</span>
          ) : null}
          {fault ? <span style={{ fontSize: 11, color: '#f87171' }}>{fault}</span> : null}
        </form>

        {/* Content Split: Left Task List, Right Task Details */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* Left Tasks List */}
          <div
            style={{
              width: 320,
              borderRight: '1px solid rgba(255, 255, 255, 0.08)',
              backgroundColor: 'rgba(255, 255, 255, 0.01)',
              padding: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              overflowY: 'auto',
            }}
          >
            {tasks.map((t: DurableTask) => {
              const badge = statusBadge(t.status)
              const isSelected = t.id === activeTask?.id

              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => taskQueueStore.selectTask(t.id)}
                  className="tap"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    padding: '9px 12px',
                    borderRadius: 8,
                    background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                    border: isSelected
                      ? '1px solid rgba(255, 255, 255, 0.12)'
                      : '1px solid transparent',
                    color: '#ffffff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    transition: 'all 0.12s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: badge.bg,
                          color: badge.color,
                          border: `1px solid ${badge.border}`,
                        }}
                      >
                        {badge.label}
                      </span>
                      <span style={{ fontSize: 11, color: '#a78bfa', fontWeight: 600 }}>
                        {t.agent}
                      </span>
                    </div>

                    <span style={{ fontSize: 10.5, color: 'rgba(255, 255, 255, 0.4)' }}>
                      {ago(t.startedAt)}
                    </span>
                  </div>

                  <div style={{ fontSize: 12, fontWeight: 600, color: '#ffffff', lineHeight: 1.35 }}>
                    {t.title}
                  </div>

                  {/* A bar only where there is a share to draw. A null pct is
                      "indeterminate", which an empty bar would read as zero. */}
                  {t.status === 'running' && t.progress.pct !== null ? (
                    <div
                      style={{
                        width: '100%',
                        height: 3,
                        borderRadius: 2,
                        background: 'rgba(255, 255, 255, 0.08)',
                        overflow: 'hidden',
                        marginTop: 2,
                      }}
                    >
                      <div
                        style={{
                          width: `${t.progress.pct}%`,
                          height: '100%',
                          // A model's guess is drawn differently from a run's
                          // own word, because they are different claims.
                          background: t.progress.estimated ? '#a78bfa' : '#34d399',
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                  ) : null}
                </button>
              )
            })}
          </div>

          {/* Right Task Details & Terminal Output */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              overflowY: 'auto',
            }}
          >
            {activeTask && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#ffffff' }}>
                      {activeTask.title}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11.5, color: 'rgba(255, 255, 255, 0.5)' }}>
                        Agent: <strong style={{ color: '#ffffff' }}>{activeTask.agent || '—'}</strong>
                      </span>
                      <span style={{ fontSize: 11.5, color: 'rgba(255, 255, 255, 0.5)' }}>
                        Phase: <strong style={{ color: '#34d399' }}>{activeTask.progress.phase}</strong>
                      </span>
                      {activeTask.progress.activity ? (
                        <span style={{ fontSize: 11.5, color: 'rgba(255, 255, 255, 0.5)' }}>
                          {activeTask.progress.activity}
                        </span>
                      ) : null}
                      {/* The server marks this a model estimate, and so does
                          the card: a guess shown as a measurement tells
                          somebody a stuck run is fine. */}
                      {activeTask.progress.estimated ? (
                        <span
                          title="A model read this off the run's transcript. It is not a measurement."
                          style={{ fontSize: 10.5, fontWeight: 700, color: '#a78bfa' }}
                        >
                          ESTIMATED
                        </span>
                      ) : null}
                      {activeTask.taskWorkflowId ? (
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#60a5fa' }}>
                          DURABLE
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6 }}>
                    {/* There is no retry: a done or error run cannot reopen,
                        so the steering that exists is pause and resume. */}
                    {activeTask.status === 'running' || activeTask.status === 'paused' ? (
                      <button
                        type="button"
                        disabled={busy === activeTask.id}
                        onClick={() =>
                          activeTask.status === 'paused'
                            ? taskQueueStore.resumeTask(activeTask.id)
                            : taskQueueStore.pauseTask(activeTask.id)
                        }
                        className="tap"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '6px 12px',
                          borderRadius: 6,
                          background: 'rgba(255, 255, 255, 0.06)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          color: '#ffffff',
                          fontSize: 11.5,
                          cursor: busy === activeTask.id ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <RotateCcw size={12} />
                        <span>{activeTask.status === 'paused' ? 'Resume' : 'Pause'}</span>
                      </button>
                    ) : null}

                    {activeTask.status === 'running' && (
                      <button
                        type="button"
                        title="Cancel task"
                        onClick={() => taskQueueStore.cancelTask(activeTask.id)}
                        className="tap"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '6px 12px',
                          borderRadius: 6,
                          background: 'rgba(239, 68, 68, 0.15)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#f87171',
                          fontSize: 11.5,
                          cursor: 'pointer',
                        }}
                      >
                        <X size={12} />
                        <span>Cancel</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Log Stream */}
                <div
                  style={{
                    flex: 1,
                    minHeight: 220,
                    backgroundColor: '#050507',
                    borderRadius: 10,
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    padding: 14,
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: 12,
                    lineHeight: 1.6,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  {events.length === 0 ? (
                    <div style={{ color: 'rgba(255,255,255,0.35)' }}>No turns recorded.</div>
                  ) : null}
                  {events.map((turn) => (
                    <div
                      key={turn.id}
                      style={{
                        color:
                          turn.kind === 'error'
                            ? '#f87171'
                            : turn.kind === 'tool-call'
                              ? '#60a5fa'
                              : turn.kind === 'tool-result'
                                ? '#34d399'
                                : 'rgba(255, 255, 255, 0.8)',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      <span style={{ color: 'rgba(255,255,255,0.3)' }}>
                        {String(turn.seq).padStart(3, ' ')} {turn.kind}
                      </span>{' '}
                      {/* A payload's shape belongs to whoever wrote the turn,
                          so it is shown as it arrived rather than interpreted. */}
                      {typeof turn.payload === 'string'
                        ? turn.payload
                        : JSON.stringify(turn.payload)}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
