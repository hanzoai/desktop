/**
 * Swarm Bar — multi-agent selector and orchestration status.
 */
import {
  Bot,
  Brain,
  Code,
  Search,
  Shield,
  Zap,
} from '@hanzogui/lucide-icons-2'
import { SizableText, XStack } from '@hanzo/ui'
import { AGENT_ROSTER, type AgentDefinition } from './types'
import { swarmStore, useSwarm } from './store'

const iconFor = (iconName: string) => {
  switch (iconName) {
    case 'brain':
      return Brain
    case 'code':
      return Code
    case 'shield':
      return Shield
    case 'search':
      return Search
    case 'zap':
    default:
      return Zap
  }
}

export const SwarmBar = () => {
  const { activeAgentIds, swarmMode, isExecuting, activePhase } = useSwarm()

  return (
    <XStack
      alignItems="center"
      justifyContent="space-between"
      paddingHorizontal="$3"
      paddingVertical="$1.5"
      borderRadius="$3"
      borderWidth={1}
      borderColor="rgba(255, 255, 255, 0.08)"
      backgroundColor="rgba(255, 255, 255, 0.02)"
      style={{
        backdropFilter: 'blur(20px)',
        marginBottom: 6,
        width: '100%',
        maxWidth: 768,
        alignSelf: 'center',
      }}
    >
      {/* Left: Swarm Mode Toggle & Agents Roster */}
      <XStack alignItems="center" gap="$2" flexWrap="wrap" flex={1}>
        <button
          type="button"
          onClick={() => swarmStore.setSwarmMode(!swarmMode)}
          className="tap"
          title="Toggle Multi-Agent Swarm Mode"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '3px 9px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            background: swarmMode
              ? 'linear-gradient(135deg, rgba(129, 140, 248, 0.25), rgba(52, 211, 153, 0.25))'
              : 'rgba(255, 255, 255, 0.05)',
            border: swarmMode
              ? '1px solid rgba(129, 140, 248, 0.45)'
              : '1px solid rgba(255, 255, 255, 0.1)',
            color: swarmMode ? '#ffffff' : 'rgba(255, 255, 255, 0.65)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <Bot size={13} style={{ color: swarmMode ? '#34d399' : 'currentColor' }} />
          <span>{swarmMode ? 'Swarm Active' : 'Swarm Mode'}</span>
        </button>

        {/* Individual Agent Badges */}
        {AGENT_ROSTER.map((agent: AgentDefinition) => {
          const active = activeAgentIds.includes(agent.id)
          const Icon = iconFor(agent.iconName)

          return (
            <button
              key={agent.id}
              type="button"
              onClick={() => swarmStore.toggleAgent(agent.id)}
              className="tap"
              title={`${agent.name}: ${agent.role}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 7px',
                borderRadius: 5,
                fontSize: 10.5,
                fontWeight: 600,
                background: active ? `${agent.badgeColor}22` : 'transparent',
                border: active
                  ? `1px solid ${agent.badgeColor}55`
                  : '1px solid rgba(255, 255, 255, 0.06)',
                color: active ? agent.badgeColor : 'rgba(255, 255, 255, 0.4)',
                cursor: 'pointer',
                transition: 'all 0.12s ease',
              }}
            >
              <Icon size={11} />
              <span>{agent.handle}</span>
            </button>
          )
        })}
      </XStack>

      {/* Right: Active Swarm Phase Status */}
      {isExecuting && activePhase && (
        <XStack alignItems="center" gap="$1.5" flexShrink={0}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 9999,
              background: '#34d399',
              boxShadow: '0 0 8px #34d399',
            }}
          />
          <SizableText size="$1" color="$ink" style={{ fontSize: 11, color: '#34d399' }}>
            {activePhase}
          </SizableText>
        </XStack>
      )}
    </XStack>
  )
}
