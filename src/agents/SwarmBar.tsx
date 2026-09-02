/**
 * Which of the org's agents the composer is addressing.
 *
 * The tiles are the org's own agents. They used to be five literals with a
 * hand-picked icon and badge colour each; an agent carries an avatar or one
 * emoji, and neither means it is drawn as its initial — which is what a row
 * with neither gets here.
 */
import { Bot } from '@hanzogui/lucide-icons-2'
import { SizableText, XStack } from '@hanzo/ui'
import { tint } from '~/show'
import type { AgentDefinition } from './types'
import { swarmStore, useSwarm } from './store'

export const SwarmBar = () => {
  const { agents, activeAgentIds, swarmMode, isExecuting, activePhase } = useSwarm()

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

        {/* One tile per agent the org actually defines. */}
        {agents.map((agent: AgentDefinition) => {
          const active = activeAgentIds.includes(agent.id)
          const colour = tint(agent.id)

          return (
            <button
              key={agent.id}
              type="button"
              onClick={() => swarmStore.toggleAgent(agent.id)}
              className="tap"
              title={agent.description ? `${agent.name}: ${agent.description}` : agent.name}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 7px',
                borderRadius: 5,
                fontSize: 10.5,
                fontWeight: 600,
                background: active ? `${colour}22` : 'transparent',
                border: active ? `1px solid ${colour}55` : '1px solid rgba(255, 255, 255, 0.06)',
                color: active ? colour : 'rgba(255, 255, 255, 0.4)',
                cursor: 'pointer',
                transition: 'all 0.12s ease',
              }}
            >
              {agent.emoji ? (
                <span style={{ fontSize: 11 }}>{agent.emoji}</span>
              ) : (
                <Bot size={11} />
              )}
              <span>@{agent.name}</span>
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
