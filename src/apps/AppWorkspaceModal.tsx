/**
 * The workspace suite.
 *
 * Notes are LOCAL — there is no note route at any depth, so they live in this
 * window and say so. The backlog, the call and the overlay network are reads.
 * What each panel no longer shows is recorded at the panel, because the removed
 * fields are the ones a reader will look for.
 */
import { CheckSquare, ExternalLink, FileText, ListTodo, Plus, Shield, Video, X, Zap } from '@hanzogui/lucide-icons-2'
import { useState } from 'react'
import { ago, useShown } from '@hanzo/chat/show'
import {
  useBacklog,
  useCall,
  useMoveIssue,
  useNotes,
  useOpenIssue,
  useOverlay,
  useWorkspace,
  workspaceAppsStore,
} from './store.ts'
import type { WorkspaceAppId } from './types.ts'

export const AppWorkspaceModal = () => {
  // Four products, four hooks. What they share is the tab strip, which is a
  // place — so only `useWorkspace` is about all of them.
  const { isOpen, activeApp } = useWorkspace()
  const { notes, activeNoteId, saved } = useNotes()
  const { todos, pending, fault } = useBacklog()
  const { meeting } = useCall()
  const { overlay } = useOverlay()
  const [newTodoText, setNewTodoText] = useState('')
  // An issue belongs to a board, and there is no inbox to drop one into, so the
  // board is asked for rather than guessed at.
  const [board, setBoard] = useState('')
  // Two writes, each with its own pending and its own refusal.
  const moving = useMoveIssue()
  const opening = useOpenIssue()
  // A backlog grows with the ORG. /v1/todo/issues takes a limit, and this
  // bounds what is DRAWN on top of it.
  const shown = useShown(todos, 80)

  if (!isOpen) return null

  const activeNote = notes.find((n) => n.id === activeNoteId) || notes[0]

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
      onClick={() => workspaceAppsStore.close()}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 980,
          height: 640,
          borderRadius: 16,
          border: '1px solid rgba(255, 255, 255, 0.12)',
          backgroundColor: '#0c0c0e',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8)',
          overflow: 'hidden',
          display: 'grid'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header & App Switcher Tabs */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 18px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          {/* Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {[
              { id: 'tasks', label: 'tasks.hanzo.ai', icon: ListTodo, color: '#34d399' },
              { id: 'notes', label: 'notes.hanzo.ai', icon: FileText, color: '#60a5fa' },
              { id: 'todo', label: 'todo.hanzo.ai', icon: CheckSquare, color: '#a78bfa' },
              { id: 'meet', label: 'meet.hanzo.ai', icon: Video, color: '#f87171' },
              { id: 'tunnel', label: 'zt.hanzo.ai (Zero-Trust)', icon: Shield, color: '#fbbf24' },
            ].map((tab) => {
              const Icon = tab.icon
              const isActive = activeApp === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => workspaceAppsStore.setActiveApp(tab.id as WorkspaceAppId)}
                  className="tap"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 11px',
                    borderRadius: 8,
                    background: isActive ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                    border: isActive
                      ? '1px solid rgba(255, 255, 255, 0.15)'
                      : '1px solid transparent',
                    color: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.6)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.12s ease',
                  }}
                >
                  <Icon size={13} color={isActive ? tab.color : 'rgba(255, 255, 255, 0.4)'} />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => workspaceAppsStore.close()}
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

        {/* Tab Content Panes */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          {/* 1. TASKS.HANZO.AI */}
          {activeApp === 'tasks' && (
            <div style={{ flex: 1, display: 'flex', padding: 18, gap: 16 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#ffffff' }}>
                      tasks.hanzo.ai — Distributed Workflow Engine
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.5)' }}>
                      Durable state machine, async agent background dispatch, and DAG task execution.
                    </div>
                  </div>
                  <a
                    href="https://tasks.hanzo.ai"
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      color: '#34d399',
                      fontSize: 12,
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    <span>Open Standalone</span>
                    <ExternalLink size={12} />
                  </a>
                </div>

                <div
                  style={{
                    flex: 1,
                    backgroundColor: '#050507',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    overflowY: 'auto',
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255, 255, 255, 0.4)', textTransform: 'uppercase' }}>
                    Active Workflow DAGs
                  </div>
                  {[
                    { name: 'CI/CD Multi-Target Compilation', status: 'Running', duration: '12s', agent: '@dev' },
                    { name: 'KMS Hardware Enclave Key Rotation', status: 'Passed', duration: '4s', agent: '@secops' },
                    { name: 'ZAP High-Throughput Stream Benchmark', status: 'Queued', duration: '--', agent: '@executor' },
                  ].map((dag) => (
                    <div
                      key={dag.name}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 8,
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Zap size={14} color="#34d399" />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>{dag.name}</div>
                          <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.4)' }}>
                            Assigned: <strong style={{ color: '#a78bfa' }}>{dag.agent}</strong> • Duration: {dag.duration}
                          </div>
                        </div>
                      </div>

                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background:
                            dag.status === 'Passed'
                              ? 'rgba(52, 211, 153, 0.15)'
                              : dag.status === 'Running'
                              ? 'rgba(96, 165, 250, 0.15)'
                              : 'rgba(255, 255, 255, 0.06)',
                          color:
                            dag.status === 'Passed'
                              ? '#34d399'
                              : dag.status === 'Running'
                              ? '#60a5fa'
                              : 'rgba(255, 255, 255, 0.5)',
                        }}
                      >
                        {dag.status.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 2. NOTES.HANZO.AI */}
          {activeApp === 'notes' && (
            <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
              {/* Notes Sidebar */}
              <div
                style={{
                  width: 240,
                  borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                  padding: 12,
                  display: 'grid',
                  gap: 8
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255, 255, 255, 0.4)', textTransform: 'uppercase' }}>
                    Notes ({notes.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => workspaceAppsStore.addNote()}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#ffffff',
                      cursor: 'pointer',
                    }}
                  >
                    <Plus size={12} />
                  </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {notes.map((note) => {
                    const isSelected = note.id === activeNote?.id
                    return (
                      <button
                        key={note.id}
                        type="button"
                        onClick={() => workspaceAppsStore.selectNote(note.id)}
                        className="tap"
                        style={{
                          display: 'grid',
                          gap: 4,
                          padding: '8px 10px',
                          borderRadius: 6,
                          background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                          border: isSelected ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid transparent',
                          color: '#ffffff',
                          cursor: 'pointer',
                          textAlign: 'left',
                          width: '100%'
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#ffffff' }}>{note.title}</div>
                        <div style={{ fontSize: 10.5, color: 'rgba(255, 255, 255, 0.4)' }}>
                          {ago(note.updatedAt)}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Note Editor */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, gap: 10 }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#ffffff' }}>
                    {activeNote?.title ?? 'No note'}
                  </div>
                  {/* Nothing co-authors these and nothing syncs them. The badge
                      here read "Live AI Co-Authoring Active". */}
                  {/* A note that is not being kept must say so while it is
                      being typed, not on the reload that loses it. */}
                  <span
                    style={{
                      fontSize: 11,
                      color: saved ? 'rgba(255,255,255,0.45)' : '#fbbf24',
                      background: saved ? 'rgba(255, 255, 255, 0.05)' : 'rgba(251,191,36,0.12)',
                      padding: '2px 8px',
                      borderRadius: 4,
                    }}
                  >
                    {saved ? 'local to this window' : 'not being saved — storage is full'}
                  </span>
                </div>

                <textarea
                  value={activeNote?.content || ''}
                  disabled={!activeNote}
                  placeholder={activeNote ? '' : 'Add a note to start.'}
                  onChange={(e) =>
                    activeNote && workspaceAppsStore.updateNoteContent(activeNote.id, e.target.value)
                  }
                  style={{
                    flex: 1,
                    width: '100%',
                    padding: 12,
                    borderRadius: 8,
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: '#ffffff',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: 12.5,
                    lineHeight: 1.6,
                    outline: 'none',
                    resize: 'none',
                  }}
                />
              </div>
            </div>
          )}

          {/* 3. The org's backlog, across every project */}
          {activeApp === 'todo' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 18, gap: 14 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#ffffff' }}>Backlog</div>
                <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.5)' }}>
                  Every open issue across the org's boards.
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  // Clear the box only on an issue that was actually opened.
                  void opening.run(board, newTodoText).then((ok) => ok && setNewTodoText(''))
                }}
                style={{ display: 'flex', gap: 8 }}
              >
                <input
                  type="text"
                  placeholder="board"
                  value={board}
                  onChange={(e) => setBoard(e.target.value)}
                  style={{
                    width: 130,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                    fontSize: 12.5,
                    outline: 'none',
                  }}
                />
                <input
                  type="text"
                  placeholder="Open an issue…"
                  value={newTodoText}
                  onChange={(e) => setNewTodoText(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                    fontSize: 12.5,
                    outline: 'none',
                  }}
                />
                <button
                  type="submit"
                  className="tap"
                  disabled={!board.trim() || !newTodoText.trim()}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    background: board.trim() && newTodoText.trim() ? '#ffffff' : 'rgba(255,255,255,0.25)',
                    border: 'none',
                    color: '#000000',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Open
                </button>
              </form>

              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {pending && todos.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Reading…</div>
                ) : null}
                {!pending && todos.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                    No open issues.
                  </div>
                ) : null}
                {shown.rows.map((todo) => {
                  const shut = todo.status === 'done' || todo.status === 'canceled'
                  return (
                    <div
                      key={todo.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        borderRadius: 10,
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                      }}
                    >
                      {/* A board has five columns, not a checkbox: 'done' and
                          'canceled' are different outcomes and a tick cannot
                          say which. */}
                      <select
                        value={todo.status}
                        onChange={(e) =>
                          void moving.run(todo, e.target.value as typeof todo.status)
                        }
                        style={{
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 6,
                          color: shut ? 'rgba(255,255,255,0.45)' : '#ffffff',
                          fontSize: 11,
                          padding: '3px 6px',
                          outline: 'none',
                        }}
                      >
                        <option value="backlog">backlog</option>
                        <option value="todo">todo</option>
                        <option value="in_progress">in progress</option>
                        <option value="done">done</option>
                        <option value="canceled">canceled</option>
                      </select>

                      <span
                        style={{
                          flex: 1,
                          fontSize: 12.5,
                          color: shut ? 'rgba(255, 255, 255, 0.4)' : '#ffffff',
                          textDecoration: shut ? 'line-through' : 'none',
                        }}
                      >
                        {todo.text}
                      </span>

                      <span
                        style={{
                          fontSize: 10.5,
                          color: 'rgba(255, 255, 255, 0.35)',
                          fontFamily: 'ui-monospace, monospace',
                        }}
                      >
                        {todo.id}
                      </span>

                      {todo.priority !== 'none' ? (
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            color: todo.priority === 'urgent' ? '#f87171' : '#fbbf24',
                          }}
                        >
                          {todo.priority}
                        </span>
                      ) : null}

                      {todo.assignee ? (
                        <span style={{ fontSize: 11, color: '#a78bfa' }}>{todo.assignee}</span>
                      ) : null}
                    </div>
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
              {fault || moving.fault || opening.fault ? (
                <div style={{ fontSize: 12, color: '#f87171' }}>
                  {fault || moving.fault || opening.fault}
                </div>
              ) : null}
            </div>
          )}

          {/* 4. Where a room's call happens */}
          {activeApp === 'meet' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 18, gap: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#ffffff' }}>Call</div>
                <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.5)' }}>
                  Resolved when a surface draws it, rather than stored anywhere.
                </div>
              </div>

              {/* THE ROSTER AND THE TRANSCRIPT ARE NOT HERE, and were literals:
                  four participants, six lines of speech and an `aiSummary`.
                  This route answers three facts and none of them is who is in
                  the room. */}
              {meeting === null ? (
                <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.45)' }}>
                  {pending ? 'Reading…' : 'This deployment resolves no call.'}
                </div>
              ) : (
                <div
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'grid',
                    gap: 10
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 9999,
                        background: meeting.ready ? '#34d399' : 'rgba(255,255,255,0.3)',
                      }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>
                      {meeting.name || 'no room'}
                    </span>
                    <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.45)' }}>
                      {meeting.ready ? 'can mint a join token' : 'cannot mint a join token'}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: 'rgba(255, 255, 255, 0.5)',
                      fontFamily: 'ui-monospace, monospace',
                      wordBreak: 'break-all',
                    }}
                  >
                    {meeting.ws || '—'}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 5. The org's overlay on the Zero Trust fabric */}
          {activeApp === 'tunnel' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 18, gap: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#ffffff' }}>Network</div>
                <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.5)' }}>
                  The org has at most one overlay, projected from its edge-routers.
                </div>
              </div>

              {/* THIS IS NOT A SHARED LOCALHOST. The fabric publishes a router
                  count and a status; the forwarding URL, the local port, the
                  connected-client count and the `enclaveKey` shown here before
                  were literals — the last of them shaped like key material. */}
              {overlay === null ? (
                <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.45)' }}>
                  {pending ? 'Reading…' : 'This org holds no overlay network.'}
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  <div
                    style={{
                      padding: 16,
                      borderRadius: 12,
                      backgroundColor: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 9999,
                        background: overlay.status === 'connected' ? '#34d399' : 'rgba(255,255,255,0.3)',
                      }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>
                      {overlay.name || overlay.id}
                    </span>
                    <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.45)' }}>
                      {overlay.status} · {overlay.nodes} router
                      {overlay.nodes === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gap: 8, overflowY: 'auto' }}>
                    {overlay.routers.map((r) => (
                      <div
                        key={r.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '9px 12px',
                          borderRadius: 10,
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 9999,
                            background:
                              r.status === 'online'
                                ? '#34d399'
                                : r.status === 'disabled'
                                  ? 'rgba(255,255,255,0.25)'
                                  : '#fbbf24',
                          }}
                        />
                        <span style={{ flex: 1, fontSize: 12.5, color: '#ffffff' }}>{r.name}</span>
                        {r.region ? (
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                            {r.region}
                          </span>
                        ) : null}
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                          {r.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
