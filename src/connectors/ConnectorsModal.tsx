/**
 * What this org has connected, and what it could.
 *
 * The two facts a card carries are independent, so the card draws them apart.
 * Whether the FLEET can connect a provider at all is `available`, and a card
 * that is not available offers no Connect button — the estate would answer 503,
 * and a button whose only outcome is a refusal is worse than no button, because
 * a person reads its presence as a promise. What it says instead is that this
 * deployment holds no credentials for it, which is the actual reason.
 *
 * Whether THIS ORG has connected it is `connected`, and that is what Disconnect
 * hangs off. Connect sends somebody out to consent and the provider calls the
 * estate back afterwards, so this panel cannot see the end of that trip and
 * does not pretend to: it says where the person was sent.
 */
import { Plug, Unplug } from '@hanzogui/lucide-icons-2'
import { useState } from 'react'

import { More, Sheet, State } from '../shell/Sheet'
import { ago, useShown } from '@hanzo/chat/show'
import { connectorsStore, useConnect, useConnectors, useDisconnect } from './store'

export const ConnectorsModal = () => {
  const { isOpen, providers, pending, fault } = useConnectors()
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const connect = useConnect()
  const disconnect = useDisconnect()

  const term = search.trim().toLowerCase()
  const matched = providers.filter((one) => {
    const kind =
      tab === 'all' ||
      (tab === 'connected' ? one.connected : tab === 'available' ? one.available : true)
    const hit =
      !term ||
      one.name.toLowerCase().includes(term) ||
      (one.description ?? '').toLowerCase().includes(term) ||
      (one.category ?? '').toLowerCase().includes(term)
    return kind && hit
  })
  const shown = useShown(matched, 60)

  if (!isOpen) return null

  return (
    <Sheet
      icon={<Plug size={18} color="#a78bfa" />}
      title="Connectors"
      note="Providers this org can connect. The credential lives in KMS, never here."
      onClose={() => connectorsStore.close()}
      tabs={[
        { id: 'all', label: 'All' },
        { id: 'connected', label: 'Connected' },
        { id: 'available', label: 'Available' },
      ]}
      tab={tab}
      onTab={setTab}
      search={search}
      onSearch={setSearch}
      hint="Search name or category..."
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 12,
        }}
      >
        <State fault={fault} pending={pending} empty={matched.length === 0} />
        {connect.fault || disconnect.fault ? (
          <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#f87171' }}>
            {connect.fault ?? disconnect.fault}
          </div>
        ) : null}

        {shown.rows.map((one) => (
          <div
            key={one.id}
            style={{
              padding: 14,
              borderRadius: 12,
              background: 'rgba(255, 255, 255, 0.03)',
              border: one.connected
                ? '1px solid rgba(52, 211, 153, 0.3)'
                : '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>{one.name}</span>
                {one.category ? (
                  <span style={{ fontSize: 10.5, color: 'rgba(255, 255, 255, 0.4)' }}>
                    {one.category}
                  </span>
                ) : null}
              </div>
              <div
                style={{ fontSize: 11.5, color: 'rgba(255, 255, 255, 0.6)', lineHeight: 1.4 }}
              >
                {one.description || '—'}
              </div>

              {/* The account, and what the credential may do. Both are on the
                  wire only once connected; the token never is. */}
              {one.connected ? (
                <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.45)' }}>
                  {one.account || 'connected'}
                  {one.connectedAt ? ` · ${ago(one.connectedAt)}` : ''}
                  {one.scopes.length > 0 ? ` · ${one.scopes.length} scopes` : ''}
                </div>
              ) : null}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: 6,
                borderTop: '1px solid rgba(255, 255, 255, 0.05)',
              }}
            >
              {one.connected ? (
                <button
                  type="button"
                  className="tap"
                  disabled={disconnect.pending}
                  onClick={() => void disconnect.run(one.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    background: 'none',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 6,
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: 11,
                    padding: '3px 8px',
                    cursor: disconnect.pending ? 'default' : 'pointer',
                  }}
                >
                  <Unplug size={12} /> Disconnect
                </button>
              ) : one.available ? (
                <button
                  type="button"
                  className="tap"
                  disabled={connect.pending}
                  onClick={() => void connect.run(one.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    background: 'rgba(167, 139, 250, 0.14)',
                    border: '1px solid rgba(167, 139, 250, 0.35)',
                    borderRadius: 6,
                    color: '#a78bfa',
                    fontSize: 11,
                    padding: '3px 8px',
                    cursor: connect.pending ? 'default' : 'pointer',
                  }}
                >
                  <Plug size={12} /> Connect
                </button>
              ) : (
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                  not configured here
                </span>
              )}

              <span
                style={{
                  fontSize: 11,
                  color: one.connected ? '#34d399' : 'rgba(255,255,255,0.35)',
                }}
              >
                {one.connected ? 'connected' : 'not connected'}
              </span>
            </div>
          </div>
        ))}

        <More more={shown.more} total={shown.total} grow={shown.grow} />
      </div>
    </Sheet>
  )
}
