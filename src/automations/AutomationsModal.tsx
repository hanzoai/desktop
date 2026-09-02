/**
 * The org's automations.
 *
 * A card shows what the flow row and its latest version actually carry — the
 * status, the trigger that starts it, whether the builder considers it valid,
 * and when it last changed. The schedule, the agent and the run count it used
 * to show were literals; a cron line belongs to an armed polling trigger inside
 * the step tree, and this surface does not read the tree.
 */
import { Clock, GitBranch, Play, Plus, X } from '@hanzogui/lucide-icons-2'
import { useState } from 'react'
import { automationsStore, useAutomations } from './store'

export const AutomationsModal = () => {
  const { isOpen, jobs, runs, pending, fault, busy } = useAutomations()
  const [newJobName, setNewJobName] = useState('')

  if (!isOpen) return null

  // A flow is opened by NAME and nothing else. `createFlowReq` carries a
  // displayName, an externalId, a folderId and a trigger — no description, so
  // the description box that stood here wrote to nothing; and a trigger
  // invented here would arm something nobody asked for. A new flow starts
  // empty and is armed in the builder.
  const handleCreateJob = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newJobName.trim()) return
    void automationsStore.create(newJobName.trim())
    setNewJobName('')
  }

  /** When each flow last ran, from the run history rather than from a guess. */
  const lastRun = new Map<string, number>()
  for (const run of runs) {
    const at = run.finishTime || run.startTime
    if (at && at > (lastRun.get(run.flowId) ?? 0)) lastRun.set(run.flowId, at)
  }

  const ago = (ms: number): string => {
    if (!ms) return 'never'
    const mins = Math.floor((Date.now() - ms) / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    return hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`
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
      onClick={() => automationsStore.close()}
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
        {/* Header Bar */}
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
            <Clock size={18} color="#34d399" />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#ffffff' }}>
                Scheduled Tasks & Automations
              </div>
              <div style={{ fontSize: 11.5, color: 'rgba(255, 255, 255, 0.5)' }}>
                Flows this org owns, and what each one is armed to start on.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => automationsStore.close()}
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

        {/* Content Area */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 18, gap: 14 }}>
          {/* Create Job Form */}
          <form onSubmit={handleCreateJob} style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Name a new automation…"
              value={newJobName}
              onChange={(e) => setNewJobName(e.target.value)}
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
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                background: '#ffffff',
                border: 'none',
                color: '#000000',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Plus size={14} />
              <span>New flow</span>
            </button>
          </form>

          {/* Jobs List */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {fault ? (
              <div style={{ fontSize: 12, color: '#f87171' }}>{fault}</div>
            ) : null}
            {!fault && pending && jobs.length === 0 ? (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Reading…</div>
            ) : null}
            {!fault && !pending && jobs.length === 0 ? (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                No automations yet.
              </div>
            ) : null}
            {jobs.map((job) => {
              const armed = job.status === 'ENABLED'
              const working = busy === job.id
              return (
                <div
                  key={job.id}
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: working
                      ? '1px solid rgba(52, 211, 153, 0.4)'
                      : '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: 'rgba(255, 255, 255, 0.06)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: job.trigger === 'piece' ? '#34d399' : 'rgba(255,255,255,0.35)',
                        flexShrink: 0,
                      }}
                    >
                      {job.trigger === 'piece' ? <Clock size={16} /> : <GitBranch size={16} />}
                    </div>

                    <div
                      style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: '#ffffff' }}>
                          {job.name}
                        </span>
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: armed
                              ? 'rgba(96, 165, 250, 0.15)'
                              : 'rgba(255, 255, 255, 0.08)',
                            color: armed ? '#60a5fa' : 'rgba(255, 255, 255, 0.4)',
                          }}
                        >
                          {job.status || 'UNKNOWN'}
                        </span>
                        {/* The builder's own verdict. An invalid flow is armed
                            and cannot run, which is worth seeing before a run. */}
                        {!job.valid ? (
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#fbbf24' }}>
                            INVALID
                          </span>
                        ) : null}
                      </div>

                      <span
                        style={{
                          fontSize: 11.5,
                          color: 'rgba(255, 255, 255, 0.55)',
                          lineHeight: 1.3,
                        }}
                      >
                        {job.triggerName || 'no trigger'}
                      </span>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 14,
                          fontSize: 11,
                          color: 'rgba(255, 255, 255, 0.4)',
                          paddingTop: 2,
                        }}
                      >
                        <span>
                          Last run:{' '}
                          <strong style={{ color: '#ffffff' }}>
                            {ago(lastRun.get(job.id) ?? 0)}
                          </strong>
                        </span>
                        <span>
                          Updated: <strong style={{ color: '#ffffff' }}>{ago(job.updated)}</strong>
                        </span>
                        {job.publishedVersionId ? <span>pinned</span> : null}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => automationsStore.runNow(job.id)}
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
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: working ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <Play size={11} fill="currentColor" />
                      <span>{working ? 'Starting…' : 'Run Now'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={working}
                      onClick={() => automationsStore.toggleStatus(job.id)}
                      className="tap"
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        background: armed
                          ? 'rgba(52, 211, 153, 0.15)'
                          : 'rgba(255, 255, 255, 0.06)',
                        border: armed
                          ? '1px solid rgba(52, 211, 153, 0.3)'
                          : '1px solid rgba(255, 255, 255, 0.1)',
                        color: armed ? '#34d399' : 'rgba(255, 255, 255, 0.5)',
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: working ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {armed ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
