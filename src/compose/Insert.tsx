/**
 * What a message can name: an agent, or a skill.
 *
 * One list with two ways in, because they are the same act — putting a name in
 * the draft — and two menus would be two places for that to drift. `+` opens it
 * whole; typing `/` opens it at the skills, which is the convention a person
 * already has from every other composer.
 *
 * An agent inserts `@handle`, a skill inserts `/tool`. The text is the message;
 * nothing here holds state the draft does not.
 */
import { SizableText, XStack, YStack } from '@hanzo/ui'
import type { CSSProperties } from 'react'

import { AGENT_ROSTER } from '~/agents/types'
import { useSkills } from '~/compose/skills'

/** Which half of the list a trigger opens at. */
export type Lane = 'all' | 'skill'

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
  const { data: served, pending } = useSkills()

  const agents = lane === 'skill' ? [] : AGENT_ROSTER.filter((a) => hit(query, a.handle, a.name, a.role))

  const skills = (served ?? []).filter((t) => hit(query, t.name, t.description ?? '', t.source ?? ''))

  if (agents.length === 0 && skills.length === 0) {
    return (
      <div style={SHEET}>
        <YStack padding="$2">
          <SizableText size="$1" color="rgba(255,255,255,0.45)">
            {pending
              ? 'Asking what this origin can run…'
              : lane === 'skill'
                ? 'No skill matches that.'
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
            <button key={a.id} type="button" style={ROW} onClick={() => onPick(`${a.handle} `)}>
              <XStack gap="$2" alignItems="baseline" flex={1}>
                <SizableText size="$2" color="#ffffff">
                  {a.handle}
                </SizableText>
                <SizableText size="$1" color="rgba(255,255,255,0.45)" numberOfLines={1}>
                  {a.name}
                </SizableText>
              </XStack>
            </button>
          ))}
        </YStack>
      )}

      {skills.length > 0 && (
        <YStack gap="$0.5">
          <SizableText size="$1" color="rgba(255,255,255,0.35)" paddingHorizontal="$2" paddingTop="$1">
            Skills
          </SizableText>
          {skills.map((t) => (
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
