/**
 * What a message can name: an agent, or a tool.
 *
 * One list with two ways in, because they are the same act — putting a name in
 * the draft — and two menus would be two places for that to drift. `+` opens it
 * whole; typing `/` opens it at the tools, which is the convention a person
 * already has from every other composer.
 *
 * An agent inserts `@handle`, a tool inserts `/name`. The text is the message;
 * nothing here holds state the draft does not. A SKILL is not here and cannot
 * be: the estate registers every skill non-dispatchable, so it is a thing an
 * agent knows rather than a thing a turn calls.
 */
import { SizableText, XStack, YStack } from '@hanzo/ui'
import type { CSSProperties } from 'react'

import { useAgents } from '~/agents/store'
import { useTools } from '~/tools/store'

/** Which half of the list a trigger opens at. */
export type Lane = 'all' | 'tool'

export interface InsertProps {
  lane: Lane
  /** What has been typed after the trigger, used to narrow the list. */
  query: string
  onPick: (text: string) => void
  onClose: () => void
}

const SHEET: CSSProperties = {
  position: 'absolute',
  bottom: 'calc(100% + 8px)',
  left: 0,
  right: 0,
  maxHeight: 320,
  overflowY: 'auto',
  borderRadius: 14,
  background: 'rgba(16, 16, 18, 0.98)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  boxShadow: '0 16px 48px rgba(0, 0, 0, 0.5)',
  padding: 6,
  zIndex: 60,
}

const ROW: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  width: '100%',
  padding: '7px 10px',
  borderRadius: 8,
  background: 'transparent',
  border: 'none',
  color: 'inherit',
  cursor: 'pointer',
  textAlign: 'left',
}

const hit = (query: string, ...fields: string[]) => {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return fields.some((f) => f.toLowerCase().includes(q))
}

export const Insert = ({ lane, query, onPick, onClose }: InsertProps) => {
  const { data: served, pending } = useTools()
  // The org's own agents, from the one store that reads them — never a second
  // roster, which is how two lists of one thing come to disagree.
  const { data: roster = [] } = useAgents()

  const agents =
    lane === 'tool' ? [] : roster.filter((a) => hit(query, `@${a.name}`, a.name, a.description))

  const tools = (served ?? []).filter((t) => hit(query, t.name, t.description ?? '', t.source ?? ''))

  if (agents.length === 0 && tools.length === 0) {
    return (
      <div style={SHEET}>
        <YStack padding="$2">
          <SizableText size="$1" color="rgba(255,255,255,0.45)">
            {pending
              ? 'Asking what this origin can run…'
              : lane === 'tool'
                ? 'No tool matches that.'
                : 'Nothing matches that.'}
          </SizableText>
        </YStack>
      </div>
    )
  }

  return (
    <div style={SHEET} onMouseLeave={onClose}>
      {agents.length > 0 && (
        <YStack gap="$0.5" paddingBottom="$1">
          <SizableText size="$1" color="rgba(255,255,255,0.35)" paddingHorizontal="$2" paddingTop="$1">
            Agents
          </SizableText>
          {agents.map((a) => (
            <button key={a.id} type="button" style={ROW} onClick={() => onPick(`@${a.name} `)}>
              <XStack gap="$2" alignItems="baseline" flex={1}>
                <SizableText size="$2" color="#ffffff">
                  @{a.name}
                </SizableText>
                <SizableText size="$1" color="rgba(255,255,255,0.45)" numberOfLines={1}>
                  {a.description || a.model}
                </SizableText>
              </XStack>
            </button>
          ))}
        </YStack>
      )}

      {tools.length > 0 && (
        <YStack gap="$0.5">
          <SizableText size="$1" color="rgba(255,255,255,0.35)" paddingHorizontal="$2" paddingTop="$1">
            Tools
          </SizableText>
          {tools.map((t) => (
            <button
              key={t.name}
              type="button"
              style={ROW}
              onClick={() => onPick(`/${t.name} `)}
            >
              <XStack gap="$2" alignItems="baseline" flex={1}>
                <SizableText size="$2" color="#ffffff">
                  /{t.name}
                </SizableText>
                <SizableText size="$1" color="rgba(255,255,255,0.45)" numberOfLines={1}>
                  {t.description ?? t.source ?? ''}
                </SizableText>
              </XStack>
            </button>
          ))}
        </YStack>
      )}
    </div>
  )
}
