/**
 * What this estate mounts, and what this org wrote.
 *
 * It is not a marketplace and there is nothing to install: a subsystem is
 * switched on by an operator against the fleet, so this browses and does not
 * buy. The star rating, the download count, the version and the author were
 * literals in the store and are gone with it — and the title said "Marketplace"
 * for a while after they were, which is the same claim one level up.
 *
 * An authored plugin's `source` is its TypeScript. At most one is on screen,
 * for the reason the skills panel opens one body at a time: a program is not a
 * caption, and a grid of them is a document nothing can scroll.
 */
import { Blocks, Boxes, PenLine } from '@hanzogui/lucide-icons-2'
import { useState } from 'react'

import { More, Sheet, State } from '~/shell/Sheet'
import { ago, useShown } from '~/show'
import { pluginsStore, usePlugins } from './store'

export const PluginsModal = () => {
  const { isOpen, plugins, pending, fault } = usePlugins()
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [reading, setReading] = useState<string | null>(null)

  // A plugin's searchable text is its name and, for a mount, the prefixes it
  // answers at — which is what somebody looking for "who serves /v1/team" means.
  const term = search.trim().toLowerCase()
  const matched = plugins.filter((one) => {
    const kind = tab === 'all' || one.kind === tab
    const hit =
      !term ||
      one.name.toLowerCase().includes(term) ||
      one.prefixes.some((p) => p.toLowerCase().includes(term))
    return kind && hit
  })
  const shown = useShown(matched, 60)

  if (!isOpen) return null

  return (
    <Sheet
      icon={<Blocks size={18} color="#a78bfa" />}
      title="Plugins"
      note="Subsystems this deployment mounted, and the plugins this org built."
      onClose={() => pluginsStore.close()}
      tabs={[
        { id: 'all', label: 'All' },
        { id: 'mounted', label: 'Mounted' },
        { id: 'authored', label: 'Authored' },
      ]}
      tab={tab}
      onTab={setTab}
      search={search}
      onSearch={setSearch}
      hint="Search name or prefix..."
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 12,
        }}
      >
        <State fault={fault} pending={pending} empty={matched.length === 0} />

        {shown.rows.map((plugin) => (
          <div
            key={`${plugin.kind}:${plugin.id}`}
            style={{
              padding: 14,
              borderRadius: 12,
              background: 'rgba(255, 255, 255, 0.03)',
              border: plugin.enabled
                ? '1px solid rgba(167, 139, 250, 0.3)'
                : '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 10,
              gridColumn: reading === plugin.id ? '1 / -1' : undefined,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#a78bfa',
                    flexShrink: 0,
                  }}
                >
                  {plugin.kind === 'authored' ? <PenLine size={16} /> : <Boxes size={16} />}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>
                    {plugin.name}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'rgba(255, 255, 255, 0.4)' }}>
                    {plugin.kind === 'authored'
                      ? [plugin.provider, plugin.builtAt ? `built ${ago(plugin.builtAt)}` : '']
                          .filter(Boolean)
                          .join(' · ') || 'authored here'
                      : `${plugin.prefixes.length} prefix${plugin.prefixes.length === 1 ? '' : 'es'}`}
                  </div>
                </div>
              </div>

              {/* A mount states where it answers. An authored plugin's detail is
                  a whole program, so it is opened rather than printed. */}
              {plugin.kind === 'mounted' ? (
                <div
                  style={{
                    fontSize: 11.5,
                    color: 'rgba(255, 255, 255, 0.6)',
                    lineHeight: 1.4,
                    fontFamily: 'ui-monospace, monospace',
                    wordBreak: 'break-all',
                  }}
                >
                  {plugin.prefixes.join('  ') || '—'}
                </div>
              ) : plugin.source ? (
                <button
                  type="button"
                  className="tap"
                  onClick={() => setReading(reading === plugin.id ? null : plugin.id)}
                  style={{
                    alignSelf: 'flex-start',
                    background: 'none',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 6,
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: 11,
                    padding: '3px 8px',
                    cursor: 'pointer',
                  }}
                >
                  {reading === plugin.id ? 'Hide source' : 'Read source'}
                </button>
              ) : null}

              {reading === plugin.id && plugin.source ? (
                <pre
                  style={{
                    margin: 0,
                    padding: 10,
                    maxHeight: 300,
                    overflow: 'auto',
                    borderRadius: 8,
                    background: 'rgba(0, 0, 0, 0.4)',
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: 11.5,
                    lineHeight: 1.5,
                    color: 'rgba(255, 255, 255, 0.7)',
                  }}
                >
                  {plugin.source}
                </pre>
              ) : null}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: 6,
                borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                fontSize: 11,
                color: 'rgba(255, 255, 255, 0.4)',
              }}
            >
              <span>{plugin.kind}</span>
              <span style={{ color: plugin.enabled ? '#34d399' : 'rgba(255,255,255,0.35)' }}>
                {plugin.enabled ? 'on' : 'off'}
              </span>
            </div>
          </div>
        ))}

        <More more={shown.more} total={shown.total} grow={shown.grow} />
      </div>
    </Sheet>
  )
}
