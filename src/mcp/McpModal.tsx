/**
 * MCP Skills & Connectors Modal.
 */
import {
  Blocks,
  Cloud,
  Database,
  Github,
  Globe,
  Power,
  Terminal,
  Wrench,
  X,
} from '@hanzogui/lucide-icons-2'
import { SizableText, XStack, YStack } from '@hanzo/ui'
import { mcpStore, useMcp } from './store'
import type { McpServer } from './types'

const iconFor = (iconName: string) => {
  switch (iconName) {
    case 'database':
      return Database
    case 'github':
      return Github
    case 'cloud':
      return Cloud
    case 'globe':
      return Globe
    case 'terminal':
    default:
      return Terminal
  }
}

export const McpModal = () => {
  const { isOpen, servers, activeServerId } = useMcp()

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
            {servers.map((s: McpServer) => {
              const Icon = iconFor(s.icon)
              const isSelected = s.id === activeServer.id
              const isConnected = s.status === 'connected'

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
                      <Icon size={13} />
                    </div>
                    <YStack flex={1} minWidth={0}>
                      <SizableText size="$1" fontWeight="600" color="$ink" numberOfLines={1}>
                        {s.name}
                      </SizableText>
                      <SizableText size="$1" color="$faint" style={{ fontSize: 10.5 }}>
                        {s.toolsCount} tools • v{s.version}
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
                {/* Title & Status Bar */}
                <XStack alignItems="center" justifyContent="space-between">
                  <YStack gap="$1">
                    <XStack alignItems="center" gap="$2">
                      <SizableText size="$4" fontWeight="700" color="$ink">
                        {activeServer.name}
                      </SizableText>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 600,
                          padding: '2px 7px',
                          borderRadius: 4,
                          background:
                            activeServer.status === 'connected'
                              ? 'rgba(52, 211, 153, 0.12)'
                              : 'rgba(255, 255, 255, 0.06)',
                          color: activeServer.status === 'connected' ? '#34d399' : 'rgba(255, 255, 255, 0.5)',
                          border:
                            activeServer.status === 'connected'
                              ? '1px solid rgba(52, 211, 153, 0.25)'
                              : '1px solid rgba(255, 255, 255, 0.1)',
                        }}
                      >
                        {activeServer.status === 'connected' ? 'CONNECTED' : 'DISABLED'}
                      </span>
                    </XStack>
                    <SizableText size="$1" color="$faint" style={{ fontSize: 12 }}>
                      {activeServer.description}
                    </SizableText>
                  </YStack>

                  <button
                    type="button"
                    onClick={() => mcpStore.toggleServerStatus(activeServer.id)}
                    className="tap"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: 6,
                      background:
                        activeServer.status === 'connected'
                          ? 'rgba(239, 68, 68, 0.15)'
                          : 'rgba(52, 211, 153, 0.15)',
                      border:
                        activeServer.status === 'connected'
                          ? '1px solid rgba(239, 68, 68, 0.3)'
                          : '1px solid rgba(52, 211, 153, 0.3)',
                      color: activeServer.status === 'connected' ? '#f87171' : '#34d399',
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <Power size={12} />
                    <span>{activeServer.status === 'connected' ? 'Disable MCP' : 'Enable MCP'}</span>
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
                          {t.description}
                        </SizableText>
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
