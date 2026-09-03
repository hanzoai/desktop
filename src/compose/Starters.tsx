/**
 * Openings — starter suggestions when entering a conversation.
 * Rendered below the centered composer in the ChatGPT/lux.chat style.
 */
import { Bot, Code, Database, Server, ShoppingBag, Sparkles, Zap } from '@hanzogui/lucide-icons-2'
import type { CSSProperties } from 'react'

export interface Starter {
  label: string
  subtitle?: string
  text: string
  icon?: typeof Code
}

const HOUSE: Starter[] = [
  {
    label: 'Next.js 16 + React 19',
    subtitle: 'Fullstack app blueprint',
    text: 'Write a production-ready Next.js 16 app with React 19, the @hanzo/ui design system, and pgvector semantic search.',
    icon: Code,
  },
  {
    label: 'Run it in a sandbox',
    subtitle: 'A leased computer, gVisor or microVM',
    text: 'Lease a sandbox, install the dependencies for this project, run the test suite, and show me only what failed.',
    icon: Server,
  },
  {
    label: 'Agent swarm',
    subtitle: 'Planner, dev and secops',
    text: 'Orchestrate an agent swarm to plan, refactor and verify a change across isolated git worktrees.',
    icon: Bot,
  },
  {
    label: 'Autonomous commerce',
    subtitle: 'Storefront and checkout',
    text: 'Scaffold a commerce storefront with @hanzo/ui, multi-currency checkout, and vector product search.',
    icon: ShoppingBag,
  },
  {
    label: 'Read this codebase',
    subtitle: 'Structure before changes',
    text: 'Map this repository: entry points, where state lives, what talks to the network, and the three files worth reading first.',
    icon: Sparkles,
  },
  {
    label: 'Vector search',
    subtitle: 'pgvector and an embedding index',
    text: 'Implement PostgreSQL pgvector semantic search with AST symbol indexing and retrieval for long-context memory.',
    icon: Database,
  },
  {
    label: 'ZAP binary protocol',
    subtitle: 'Zero-allocation services',
    text: 'Design a high-throughput service on the ZAP zero-allocation binary protocol, and say where it beats JSON over HTTP and where it does not.',
    icon: Zap,
  },
  {
    label: 'Zero-trust secrets',
    subtitle: 'KMS envelopes and sandboxes',
    text: 'Configure KMS envelope encryption, zero-trust IAM policy, and a sandbox that can hold a secret without printing it.',
    icon: Server,
  },
]

export const filled = (text: string, at = new Date()): string => {
  const day = at.getDay()
  return text
    .replace(/\{\{current_date\}\}/gi, `${at.toLocaleDateString('sv')} (${day})`)
    .replace(/\{\{current_datetime\}\}/gi, `${at.toLocaleString('sv')} (${day})`)
    .replace(/\{\{iso_datetime\}\}/gi, at.toISOString())
}

export interface StartersProps {
  starters?: Starter[]
  disabled?: boolean
  onPick: (text: string) => void
}

const CARD_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 14px',
  borderRadius: 12,
  fontSize: 12.5,
  fontWeight: 600,
  color: 'rgba(255, 255, 255, 0.85)',
  background: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'all 0.16s ease',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
}

export const Starters = ({ starters, disabled = false, onPick }: StartersProps) => {
  const items = (starters ?? HOUSE).slice(0, 4)
  if (items.length === 0) return null

  return (
    <div
      data-testid="starters"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 10,
        width: '100%',
        paddingTop: 12,
      }}
    >
      {items.map(({ label, subtitle, text, icon: Icon = Sparkles }) => (
        <button
          key={label}
          type="button"
          disabled={disabled}
          title={label}
          onClick={() => onPick(filled(text))}
          className="tap"
          style={CARD_STYLE}
        >
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
              flexShrink: 0,
            }}
          >
            <Icon size={16} color="rgba(255, 255, 255, 0.85)" />
          </div>
          <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {label}
            </span>
            {subtitle && (
              <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.45)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {subtitle}
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}
