/**
 * What this org's agents know how to do.
 *
 * A skill is not a tool and the switch says so: activating one puts it in front
 * of an agent to READ, and nothing here dispatches anything. Two facts per row
 * and they are independent — whether it is switched on, and whether this org
 * wrote it — so they are drawn as two marks rather than one status.
 *
 * A body is 256 KiB at the outside, so at most ONE is on screen: opening a
 * skill closes the last. A list that expanded every row would put a megabyte of
 * markdown in the document to show three lines of it.
 */
import { GraduationCap, PenLine } from '@hanzogui/lucide-icons-2'
import { useState } from 'react'

import { More, Sheet, State } from '../shell/Sheet.tsx'
import { ago } from '@hanzo/chat/show'
import { useShown } from '@hanzo/chat/show'
import { useToggleTool } from '../tools/store.ts'
import { skillsStore, useSkills } from './store.ts'

export const SkillsModal = () => {
  const { isOpen, skills, pending, fault } = useSkills()
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [reading, setReading] = useState<string | null>(null)
  const flipping = useToggleTool()

  const term = search.trim().toLowerCase()
  const matched = skills.filter((one) => {
    const kind =
      tab === 'all' || (tab === 'authored' ? one.authored : tab === 'on' ? one.activated : true)
    const hit =
      !term ||
      one.name.toLowerCase().includes(term) ||
      (one.description ?? '').toLowerCase().includes(term)
    return kind && hit
  })
  const shown = useShown(matched, 60)

  if (!isOpen) return null

  return (
    <Sheet
      icon={<GraduationCap size={18} color="#a78bfa" />}
      title="Skills"
      note="What this org's agents can discover. A skill is read, never called."
      onClose={() => skillsStore.close()}
      tabs={[
        { id: 'all', label: 'All' },
        { id: 'on', label: 'Activated' },
        { id: 'authored', label: 'Authored' },
      ]}
      tab={tab}
      onTab={setTab}
      search={search}
      onSearch={setSearch}
      hint="Search name or summary..."
    >
      <div style={{ display: 'grid', gap: 8 }}>
        <State fault={fault} pending={pending} empty={matched.length === 0} />
        {flipping.fault ? (
          <div style={{ fontSize: 12, color: '#f87171' }}>{flipping.fault}</div>
        ) : null}

        {shown.rows.map((skill) => (
          <div
            key={skill.id}
            style={{
              borderRadius: 10,
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>
                    {skill.name}
                  </span>
                  {skill.authored ? (
                    <PenLine size={12} color="rgba(255,255,255,0.4)" />
                  ) : null}
                </div>
                <div style={{ fontSize: 11.5, color: 'rgba(255, 255, 255, 0.55)' }}>
                  {skill.description || '—'}
                </div>
              </div>

              {/* Reading it is only offered where there is a body: the registry
                  view carries none, so a brand skill has nothing to open. */}
              {skill.content ? (
                <button
                  type="button"
                  className="tap"
                  onClick={() => setReading(reading === skill.id ? null : skill.id)}
                  style={{
                    background: 'none',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 6,
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: 11,
                    padding: '3px 8px',
                    cursor: 'pointer',
                  }}
                >
                  {reading === skill.id ? 'Hide' : 'Read'}
                </button>
              ) : null}

              <button
                type="button"
                className="tap"
                disabled={flipping.pending}
                onClick={() => void flipping.run(skill.id)}
                style={{
                  background: skill.activated ? 'rgba(52, 211, 153, 0.14)' : 'transparent',
                  border: skill.activated
                    ? '1px solid rgba(52, 211, 153, 0.35)'
                    : '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 6,
                  color: skill.activated ? '#34d399' : 'rgba(255,255,255,0.5)',
                  fontSize: 11,
                  padding: '3px 8px',
                  cursor: flipping.pending ? 'default' : 'pointer',
                  minWidth: 44,
                }}
              >
                {skill.activated ? 'on' : 'off'}
              </button>
            </div>

            {reading === skill.id ? (
              <pre
                style={{
                  margin: 0,
                  padding: 12,
                  maxHeight: 260,
                  overflow: 'auto',
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: 11.5,
                  lineHeight: 1.5,
                  color: 'rgba(255,255,255,0.7)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {skill.content}
              </pre>
            ) : null}

            {skill.writtenAt ? (
              <div
                style={{
                  padding: '0 12px 8px',
                  fontSize: 10.5,
                  color: 'rgba(255,255,255,0.35)',
                }}
              >
                written {ago(skill.writtenAt)}
              </div>
            ) : null}
          </div>
        ))}

        <More more={shown.more} total={shown.total} grow={shown.grow} />
      </div>
    </Sheet>
  )
}
