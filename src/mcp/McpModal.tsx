/**
 * MCP Skills & Connectors Modal.
 */
import {
  Blocks,
  Power,
  Wrench,
  X,
} from '@hanzogui/lucide-icons-2'
import { SizableText, XStack, YStack } from '@hanzo/ui'
import { invalidate } from '~/data/query'
import { keys } from '~/data/keys'
import { mcpStore, useMcp, useToggleTool } from './store'
import type { Connected } from './types'

export const McpModal = () => {
  const { isOpen, servers, activeServerId } = useMcp()
  // One write, with its own pending and its own refusal.
  const flipping = useToggleTool()

  if (!isOpen) return null

  const activeServer = servers.find((s) => s.id === activeServerId) || servers[0]

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
      onClick={() => mcpStore.close()}
    >
      <YStack
        width="100%"
        maxWidth={780}
        height={560}
        borderRadius="$4"
        borderWidth={1}
        borderColor="rgba(255, 255, 255, 0.12)"
        backgroundColor="#0c0c0e"
        style={{
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e: any) => e.stopPropagation()}
      >
        {/* Header */}
        <XStack
          alignItems="center"
          justifyContent="space-between"
          paddingHorizontal="$4"
          paddingVertical="$3"
          borderBottomWidth={1}
          borderColor="rgba(255, 255, 255, 0.08)"
        >
          <XStack alignItems="center" gap="$2.5">
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#34d399',
              }}
            >
              <Blocks size={18} />
            </div>
            <YStack gap="$0.5">
              <SizableText size="$3" fontWeight="700" color="$ink" style={{ color: '#ffffff' }}>
                MCP Skills & Server Connectors
              </SizableText>
              <SizableText size="$1" color="$faint" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                Equip Hanzo agents with live local tools, databases, Git repos, and cloud sandboxes.
              </SizableText>
            </YStack>
          </XStack>

          <button
            type="button"
            onClick={() => mcpStore.close()}
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
        </XStack>

        {/* Content Split: Left server list, Right details */}
        <XStack flex={1} minHeight={0}>
          {/* Left Server List */}
          <YStack
            width={280}
            borderRightWidth={1}
            borderColor="rgba(255, 255, 255, 0.08)"
            backgroundColor="rgba(255, 255, 255, 0.01)"
            padding="$2.5"
            gap="$1.5"
            style={{ overflowY: 'auto' }}
          >
            {servers.map((s: Connected) => {
              const isSelected = s.id === activeServer.id
              // Every server in this list IS connected — that is what the list
              // is. The dot says whether any of its tools are switched on, which
              // is the fact that decides whether an agent can use it.
              const isConnected = s.tools.some((t) => t.activated)

              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => mcpStore.selectServer(s.id)}
                  className="tap"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
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
                  <XStack alignItems="center" gap="$2.5" flex={1} minWidth={0}>
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        background: 'rgba(255, 255, 255, 0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isConnected ? '#34d399' : 'rgba(255, 255, 255, 0.4)',
                        flexShrink: 0,
                      }}
                    >
                      <Wrench size={13} />
                    </div>
                    <YStack flex={1} minWidth={0}>
                      <SizableText size="$1" fontWeight="600" color="$ink" numberOfLines={1}>
                        {s.name}
                      </SizableText>
                      <SizableText size="$1" color="$faint" style={{ fontSize: 10.5 }}>
                        {s.tools.length} tools • {s.tools.filter((t) => t.activated).length} on
                      </SizableText>
                    </YStack>
                  </XStack>

                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 9999,
                      background: isConnected ? '#34d399' : 'rgba(255, 255, 255, 0.2)',
                      boxShadow: isConnected ? '0 0 6px #34d399' : 'none',
                    }}
                  />
                </button>
              )
            })}
          </YStack>

          {/* Right Server Tools & Inspector */}
          <YStack flex={1} minHeight={0} padding="$4" gap="$4" style={{ overflowY: 'auto' }}>
            {activeServer && (
              <>
                {/* What the estate actually knows: a name, where it was
                    connected, and that a credential is held — never what it is.
                    No version, no category, and no per-server switch, because
                    activation is per tool and lives on the rows below. */}
                <XStack alignItems="center" justifyContent="space-between">
                  <YStack gap="$1" flex={1} minWidth={0}>
                    <SizableText size="$4" fontWeight="700" color="$ink">
                      {activeServer.name}
                    </SizableText>
                    <SizableText size="$1" color="$faint" style={{ fontSize: 12 }} numberOfLines={1}>
                      {activeServer.url ?? 'No address recorded'}
                      {activeServer.hasSecret ? ' · credential stored' : ''}
                    </SizableText>
                  </YStack>

                  <button
                    type="button"
                    onClick={() => invalidate(keys.servers)}
                    className="tap"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: 6,
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: 'rgba(255, 255, 255, 0.75)',
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <Power size={12} />
                    <span>Refresh</span>
                  </button>
                </XStack>

                {/* Available Tools List */}
                <YStack gap="$2">
                  <SizableText size="$1" fontWeight="700" color="$faint" style={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10 }}>
                    Exposed Skills & Tool Declarations ({activeServer.tools.length})
                  </SizableText>

                  <YStack gap="$2">
                    {activeServer.tools.map((t) => (
                      <YStack
                        key={t.name}
                        padding="$3"
                        borderRadius="$3"
                        borderWidth={1}
                        borderColor="rgba(255, 255, 255, 0.08)"
                        backgroundColor="rgba(255, 255, 255, 0.02)"
                        gap="$1"
                      >
                        <XStack alignItems="center" gap="$2">
                          <Wrench size={12} color="#34d399" />
                          <code
                            style={{
                              fontFamily: 'var(--font-mono, monospace)',
                              fontSize: 12,
                              fontWeight: 600,
                              color: '#60a5fa',
                            }}
                          >
                            {t.name}()
                          </code>
                        </XStack>
                        <SizableText size="$1" color="$faint" style={{ fontSize: 11.5, color: 'rgba(255, 255, 255, 0.7)' }}>
                          {t.description ?? 'No description published.'}
                        </SizableText>
                        <button
                          type="button"
                          onClick={() => void void flipping.run(t.name)}
                          className="tap"
                          style={{
                            alignSelf: 'flex-start',
                            padding: '3px 9px',
                            borderRadius: 5,
                            fontSize: 10.5,
                            fontWeight: 600,
                            background: t.activated
                              ? 'rgba(52, 211, 153, 0.14)'
                              : 'rgba(255, 255, 255, 0.05)',
                            border: t.activated
                              ? '1px solid rgba(52, 211, 153, 0.3)'
                              : '1px solid rgba(255, 255, 255, 0.1)',
                            color: t.activated ? '#34d399' : 'rgba(255, 255, 255, 0.6)',
                            cursor: 'pointer',
                          }}
                        >
                          {t.activated ? 'On' : 'Off'}
                        </button>
                      </YStack>
                    ))}
                  </YStack>
                </YStack>
              </>
            )}
          </YStack>
        </XStack>
      </YStack>
    </div>
  )
}
