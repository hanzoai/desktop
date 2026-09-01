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
    subtitle: 'Fullstack App Blueprint',
    text: 'Write a production-ready Next.js 16 app with React 19, @hanzo/ui design system, and pgvector semantic search.',
    icon: Code,
  },
  {
    label: 'Autonomous Commerce',
    subtitle: 'Luxury Storefront & Checkout',
    text: 'Scaffold a luxury commerce storefront with @hanzo/ui, zero-fee multi-currency checkout, and pgvector search.',
    icon: ShoppingBag,
  },
  {
    label: 'Agent Swarm Swarm',
    subtitle: 'Planner, Dev & SecOps',
    text: 'Orchestrate an autonomous agent swarm to plan, refactor, and verify code with isolated worktrees.',
    icon: Bot,
  },
  {
    label: 'ZAP Binary Protocol',
    subtitle: '0.18ms Microservices',
    text: 'Design a high-throughput microservice architecture using the ZAP zero-allocation binary protocol and NATS messaging.',
    icon: Zap,
  },
  {
    label: 'Zero-Trust KMS Enclave',
    subtitle: 'gVisor & Hardware Secrets',
    text: 'Configure hardware enclave KMS envelope encryption, zero-trust IAM policies, and 42ms gVisor sandboxes.',
    icon: Server,
  },
  {
    label: 'Vector Search & AI',
    subtitle: 'pgvector & Embedding Index',
    text: 'Implement PostgreSQL pgvector semantic search with AST symbol indexing and RAG memory retrieval.',
    icon: Database,
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
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
