/**
 * The org's board.
 *
 * Five columns and the wire's own words. There is no "Review" column — that was
 * this app's invention, and moving a card into it moved nothing anywhere.
 */
import { ArrowRight, GitBranch, Kanban, Play, Plus, X } from '@hanzogui/lucide-icons-2'
import { useState, type FormEvent } from 'react'
import { boardStore, useBoard, useMoveCard, useOpenCard, type BoardCard } from './store'
import { useRunAgent } from '~/agents/store'

const COLUMNS: { id: BoardCard['column']; title: string; color: string }[] = [
  { id: 'backlog', title: 'Backlog', color: 'rgba(255, 255, 255, 0.4)' },
  { id: 'todo', title: 'Todo', color: '#fbbf24' },
  { id: 'in_progress', title: 'In Progress', color: '#60a5fa' },
  { id: 'done', title: 'Done', color: '#34d399' },
  { id: 'canceled', title: 'Canceled', color: 'rgba(255, 255, 255, 0.25)' },
]

/** The next column a card moves to, or nothing when it is at the end. */
const onward: Partial<Record<BoardCard['column'], BoardCard['column']>> = {
  backlog: 'todo',
  todo: 'in_progress',
  in_progress: 'done',
}

export const BoardModal = () => {
  const { isOpen, cards, key, pending, fault } = useBoard()
  const [newTitle, setNewTitle] = useState('')
  // A card belongs to a repository. Left empty the board is the ORG's whole
  // board, which can be read and cannot be added to.
  const [newKey, setNewKey] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  // Two writes, each with its own pending and its own refusal.
  const moving = useMoveCard()
  const opening = useOpenCard()
  // Running a card asks the agent it names, which is the agents plane's verb.
  const dispatching = useRunAgent()

  if (!isOpen) return null

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim() || !newKey.trim()) return
    // Close the drawer only on a card that was actually opened.
    if (await opening.run(newKey.trim(), newTitle.trim())) {
      setNewTitle('')
      setIsAdding(false)
    }
  }

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
      onClick={() => boardStore.close()}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 980,
          height: 620,
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
                background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.25), rgba(129, 140, 248, 0.25))',
                border: '1px solid rgba(251, 191, 36, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fbbf24',
              }}
            >
              <Kanban size={18} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#ffffff' }}>
                Sprint Boards & Agent Task Automation
              </div>
              <div style={{ fontSize: 11.5, color: 'rgba(255, 255, 255, 0.5)' }}>
                Track issues and assign tasks directly to autonomous Swarm agents.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => setIsAdding(!isAdding)}
              className="tap"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 12px',
                borderRadius: 6,
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#ffffff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Plus size={13} />
              <span>New Task</span>
            </button>

            <button
              type="button"
              onClick={() => boardStore.close()}
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
        </div>

        {/* WHICH board, and what the read is doing. Empty is the org's whole
            board, which is what the route answers when nothing is bound. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <input
            type="text"
            placeholder="every board"
            value={key}
            onChange={(e) => boardStore.setKey(e.target.value)}
            style={{
              width: 180,
              padding: '5px 10px',
              borderRadius: 6,
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#ffffff',
              fontSize: 12,
              outline: 'none',
            }}
          />
          {pending ? (
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>reading…</span>
          ) : null}
          {dispatching.pending ? (
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>running…</span>
          ) : null}
          {fault || moving.fault || opening.fault || dispatching.fault ? (
            <span style={{ fontSize: 11, color: '#f87171' }}>
              {fault || moving.fault || opening.fault || dispatching.fault}
            </span>
          ) : null}
        </div>

        {/* Add Task Drawer */}
        {isAdding && (
          <form
            onSubmit={(e) => void handleAdd(e)}
            style={{
              padding: '10px 16px',
              background: 'rgba(255, 255, 255, 0.03)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <input
              type="text"
              placeholder="Task title..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              autoFocus
              style={{
                flex: 1,
                padding: '6px 10px',
                borderRadius: 6,
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#ffffff',
                fontSize: 12,
                outline: 'none',
              }}
            />
            {/* The board a card opens on. The four agent handles that stood
                here were this app's own, and a create sends no assignee. */}
            <input
              type="text"
              placeholder="board"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              style={{
                width: 130,
                padding: '6px 10px',
                borderRadius: 6,
                background: 'rgba(255, 255, 255, 0.05)',
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
                padding: '6px 14px',
                borderRadius: 6,
                background: '#ffffff',
                border: 'none',
                color: '#000000',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Create
            </button>
          </form>
        )}

        {/* 4-Column Kanban Board */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            gap: 12,
            padding: 16,
            overflowX: 'auto',
            minHeight: 0,
          }}
        >
          {COLUMNS.map((col) => {
            const columnCards = cards.filter((c) => c.column === col.id)

            return (
              <div
                key={col.id}
                style={{
                  flex: 1,
                  minWidth: 210,
                  borderRadius: 12,
                  border: '1px solid rgba(255, 255, 255, 0.07)',
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                {/* Column Title */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingBottom: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 9999,
                        background: col.color,
                      }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>
                      {col.title}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'rgba(255, 255, 255, 0.4)',
                      fontWeight: 600,
                    }}
                  >
                    {columnCards.length}
                  </span>
                </div>

                {/* Column Cards */}
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  {columnCards.map((card) => (
                    <div
                      key={card.id}
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        border: '1px solid rgba(255, 255, 255, 0.09)',
                        backgroundColor: 'rgba(255, 255, 255, 0.04)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        backdropFilter: 'blur(12px)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background:
                              card.priority === 'urgent'
                                ? 'rgba(239, 68, 68, 0.2)'
                                : 'rgba(255, 255, 255, 0.08)',
                            color: card.priority === 'urgent' ? '#f87171' : 'rgba(255, 255, 255, 0.7)',
                          }}
                        >
                          {card.priority}
                        </span>

                        <span style={{ fontSize: 11, color: '#a78bfa', fontWeight: 600 }}>
                          {card.assignee}
                        </span>
                      </div>

                      <div style={{ fontSize: 12.5, fontWeight: 600, color: '#ffffff', lineHeight: 1.4 }}>
                        {card.title}
                      </div>

                      {/* The repository the item is BOUND to, which the row
                          carries. A branch name is not on the wire and the one
                          shown here was invented per card. */}
                      {card.repo ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <GitBranch size={11} color="rgba(255, 255, 255, 0.4)" />
                          <span
                            style={{
                              fontSize: 10.5,
                              color: 'rgba(255, 255, 255, 0.5)',
                              fontFamily: 'monospace',
                            }}
                          >
                            {card.repo}
                          </span>
                        </div>
                      ) : null}

                      {/* Card Actions */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingTop: 4,
                          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                        }}
                      >
                        {card.assignee && card.column !== 'done' ? (
                          /* The card's own words go to the agent it names. A
                             card nobody holds names nobody to ask, so it has
                             no button rather than a button with no addressee. */
                          <button
                            type="button"
                            onClick={() =>
                              void dispatching.run(card.assignee, card.description || card.title)
                            }
                            className="tap"
                            title={`Run ${card.assignee} on this card`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '4px 8px',
                              borderRadius: 5,
                              background: 'rgba(52, 211, 153, 0.15)',
                              border: '1px solid rgba(52, 211, 153, 0.3)',
                              color: '#34d399',
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            <Play size={10} />
                            <span>Auto-Run</span>
                          </button>
                        ) : null}

                        {/* One button off one table, rather than a branch per
                            column — which is how a column came to move a card
                            into "review", a column the board does not have. */}
                        {onward[card.column] ? (
                          <button
                            type="button"
                            title={`Move to ${onward[card.column]}`}
                            onClick={() => void moving.run(card, onward[card.column]!)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'rgba(255, 255, 255, 0.5)',
                              cursor: 'pointer',
                              padding: 2,
                            }}
                          >
                            <ArrowRight size={13} />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
