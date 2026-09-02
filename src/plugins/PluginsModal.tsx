/**
 * What this estate mounts, and what this org wrote.
 *
 * It is not a marketplace and there is nothing to install: a subsystem is
 * switched on by an operator against the fleet, so this browses and does not
 * buy. The star rating, the download count, the version and the author were
 * literals in the store and are gone with it.
 */
import { Blocks, Boxes, PenLine, Search, X } from '@hanzogui/lucide-icons-2'
import { useState } from 'react'
import { pluginsStore, usePlugins } from './store'

export const PluginsModal = () => {
  const { isOpen, plugins, pending, fault } = usePlugins()
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  if (!isOpen) return null

  // A plugin's searchable text is its name and, for a mount, the prefixes it
  // answers at — which is what somebody looking for "who serves /v1/team" means.
  const filtered = plugins.filter((one) => {
    const kind = filter === 'all' || one.kind === filter
    const term = search.trim().toLowerCase()
    const hit =
      !term ||
      one.name.toLowerCase().includes(term) ||
      one.prefixes.some((p) => p.toLowerCase().includes(term))
    return kind && hit
  })

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
      onClick={() => pluginsStore.close()}
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
            <Blocks size={18} color="#a78bfa" />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#ffffff' }}>
                Plugins & Extensions Marketplace
              </div>
              <div style={{ fontSize: 11.5, color: 'rgba(255, 255, 255, 0.5)' }}>
                Extend chat agents with CI/CD hooks, database indexes, and cloud runtime tools.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => pluginsStore.close()}
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

        {/* Toolbar & Filter Pills */}
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
          {/* Category Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {[
              { id: 'all', label: 'All' },
              { id: 'mounted', label: 'Mounted' },
              { id: 'authored', label: 'Authored' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className="tap"
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  background: filter === tab.id ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                  border: filter === tab.id ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid transparent',
                  color: filter === tab.id ? '#ffffff' : 'rgba(255, 255, 255, 0.6)',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
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
              placeholder="Search name or prefix..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
        </div>

        {/* Plugins Grid */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 18,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 12,
          }}
        >
          {fault ? (
            <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#f87171' }}>{fault}</div>
          ) : null}
          {!fault && pending && plugins.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
              Reading…
            </div>
          ) : null}
          {!fault && !pending && filtered.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
              Nothing here.
            </div>
          ) : null}
          {filtered.map((plugin) => (
            <div
              key={plugin.id}
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
                        ? plugin.provider || 'authored here'
                        : `${plugin.prefixes.length} prefix${plugin.prefixes.length === 1 ? '' : 'es'}`}
                    </div>
                  </div>
                </div>

                {/* What it answers at, or where it was built from. Both are on
                    the wire; a description is not. */}
                <div
                  style={{
                    fontSize: 11.5,
                    color: 'rgba(255, 255, 255, 0.6)',
                    lineHeight: 1.4,
                    fontFamily:
                      plugin.kind === 'mounted' ? 'ui-monospace, monospace' : undefined,
                    wordBreak: 'break-all',
                  }}
                >
                  {plugin.kind === 'authored'
                    ? plugin.source || '—'
                    : plugin.prefixes.join('  ') || '—'}
                </div>
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
        </div>
      </div>
    </div>
  )
}
