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
import { ago, fromStamp, useShown } from '~/show'
import { Progressing } from '~/progress/Bar'
import { Subtasks } from '~/progress/Subtasks'
import { useLiveRuns, useTree } from '~/progress/store'
import { pin, usePinned } from '~/progress/pinned'
import { Pin } from '@hanzogui/lucide-icons-2'
import { taskQueueStore, useOpenRun, useSteerRun, useTaskQueue } from './store'
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

export const TaskQueueModal = () => {
  const { isOpen, tasks, activeTaskId, transcript, pending, fault } = useTaskQueue()
  // Two writes, each with its own pending and its own refusal.
  const opening = useOpenRun()
  const steering = useSteerRun()
  // Bars fill from the live feed while the queue is open: a `progress` turn an
  // agent appends moves the row server-side and arrives here as a frame, so
  // nothing polls.
  useLiveRuns(isOpen)
  const { tree } = useTree(activeTaskId ?? '')
  // Which runs this window is following. A pin is local; see progress/pinned.
  const { ids: watching } = usePinned()
  const [name, setName] = useState('')
  // A run list grows with the ORG, not with the screen, and /v1/agents/sessions
  // takes a limit of 50 — so this bounds what is DRAWN and says what it holds
  // back rather than cutting the list silently.
  const shown = useShown(tasks, 60)

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
                Runs
              </div>
              <div style={{ fontSize: 11.5, color: 'rgba(255, 255, 255, 0.5)' }}>
                The org's live agent sessions, and what each one is doing.
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
            // Clear the box only on a run that was actually opened.
            void opening.run(name.trim()).then((ok) => ok && setName(''))
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
          {fault || opening.fault || steering.fault ? (
            <span style={{ fontSize: 11, color: '#f87171' }}>
              {fault || opening.fault || steering.fault}
            </span>
          ) : null}
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
            {shown.rows.map((t: DurableTask) => {
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

                    <span
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
                    >
                      <span style={{ fontSize: 10.5, color: 'rgba(255, 255, 255, 0.4)' }}>
                        {ago(fromStamp(t.startedAt))}
                      </span>
                      {/* Pinning puts this run's bar on the board. It is a
                          <span> because the row is already a button. */}
                      <span
                        role="button"
                        tabIndex={0}
                        title={watching.includes(t.id) ? 'Stop watching' : 'Watch on the board'}
                        onClick={(e) => {
                          e.stopPropagation()
                          pin.toggle(t.id)
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter' && e.key !== ' ') return
                          e.stopPropagation()
                          e.preventDefault()
                          pin.toggle(t.id)
                        }}
                        style={{
                          display: 'inline-flex',
                          cursor: 'pointer',
                          color: watching.includes(t.id) ? '#60a5fa' : 'rgba(255,255,255,0.25)',
                        }}
                      >
                        <Pin size={11} />
                      </span>
                    </span>
                  </div>

                  <div style={{ fontSize: 12, fontWeight: 600, color: '#ffffff', lineHeight: 1.35 }}>
                    {t.title}
                  </div>

                  {/* Every OPEN run gets a bar, including one whose share is
                      unknown — that draws indeterminate rather than empty, and
                      the two mean opposite things. A finished run does not need
                      one; its status already says so. */}
                  {t.status === 'running' || t.status === 'paused' ? (
                    <Progressing of={t.progress} />
                  ) : null}
                </button>
              )
            })}
            {shown.more > 0 ? (
              <button
                type="button"
                onClick={shown.grow}
                className="tap"
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.6)',
                  fontSize: 11.5,
                  cursor: 'pointer',
                }}
              >
                {shown.more} more of {shown.total}
              </button>
            ) : null}
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

                    {/* The selected run's own bar, full width, above its tree. */}
                    <div style={{ paddingTop: 6 }}>
                      <Progressing of={activeTask.progress} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6 }}>
                    {/* There is no retry: a done or error run cannot reopen,
                        so the steering that exists is pause and resume. */}
                    {activeTask.status === 'running' || activeTask.status === 'paused' ? (
                      <button
                        type="button"
                        disabled={steering.pending}
                        onClick={() =>
                          void steering.run(
                            activeTask.id,
                            activeTask.status === 'paused' ? 'resume' : 'pause',
                          )
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
                          cursor: steering.pending ? 'not-allowed' : 'pointer',
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
                        onClick={() =>
                          void steering.run(
                            activeTask.id,
                            'stop',
                            'cancelled from the desktop queue',
                          )
                        }
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

                {/* THE SUBTASKS, each with its own bar.
                    Only drawn where a run actually fanned out — a leaf run
                    would otherwise get a tree of one, restating its own bar. */}
                {tree && tree.children.length > 0 ? (
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: 0.5,
                        color: 'rgba(255,255,255,0.35)',
                        paddingBottom: 8,
                      }}
                    >
                      SUBTASKS
                    </div>
                    <Subtasks tree={tree} />
                  </div>
                ) : null}

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
                  {transcript.fault ? (
                    <div style={{ color: '#f87171' }}>{transcript.fault}</div>
                  ) : !transcript.events || transcript.pending ? (
                    <div style={{ color: 'rgba(255,255,255,0.35)' }}>Reading the turns…</div>
                  ) : transcript.events.length === 0 ? (
                    <div style={{ color: 'rgba(255,255,255,0.35)' }}>No turns recorded.</div>
                  ) : null}
                  {transcript.events?.map((turn) => (
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
