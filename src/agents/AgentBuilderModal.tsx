/**
 * Defines an agent in the org.
 *
 * This form used to build an object and hand it to an optional `onSave` that
 * the one place mounting it never passed — so every agent anyone defined here
 * was discarded silently, and the five tool bindings it offered
 * ("PostgreSQL & pgvector", "Brave Web Search") were ids nothing serves.
 *
 * It calls `agents.create` now. `name` and `model` are what the wire requires,
 * so the model is CHOSEN rather than defaulted: picking one here on the
 * caller's behalf would define an agent against a model the org may not serve.
 */
import { Bot, Save, X } from '@hanzogui/lucide-icons-2'
import { SizableText, XStack, YStack } from '@hanzo/ui'
import { useState, type FormEvent } from 'react'

import { useTools } from '~/tools/store'
import { keys } from '~/data/keys'
import { client, ESTATE } from '~/data/origin'
import { useRead } from '~/data/query'
import { refresh } from './store'

export interface AgentBuilderProps {
  isOpen: boolean
  onClose: () => void
}

export const AgentBuilderModal = ({ isOpen, onClose }: AgentBuilderProps) => {
  const [handle, setHandle] = useState('')
  const [role, setRole] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [model, setModel] = useState('')
  const [selectedTools, setSelectedTools] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [fault, setFault] = useState<string | null>(null)

  // The tools an agent may be bound to are the ones an origin can dispatch —
  // the same read the composer's `/` uses, so the two cannot offer different
  // sets of one thing.
  const { data: tools } = useTools()
  const models = useRead(keys.models, () => client(ESTATE).models.list(), { fresh: 300_000 })

  if (!isOpen) return null

  const toggleTool = (toolId: string) => {
    setSelectedTools((held) =>
      held.includes(toolId) ? held.filter((t) => t !== toolId) : [...held, toolId],
    )
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    // The handle is the org-unique name; the leading @ is a rendering.
    const name = handle.trim().replace(/^@/, '')
    if (!name || !model || saving) return
    setSaving(true)
    setFault(null)
    try {
      await client(ESTATE).agents.create({
        name,
        model,
        description: role.trim() || undefined,
        instructions: systemPrompt.trim() || undefined,
        tools: selectedTools.length > 0 ? selectedTools : undefined,
      })
      // The roster is read from one place, so refreshing it is what makes the
      // new agent appear wherever it is named.
      refresh()
      onClose()
    } catch (err) {
      setFault(err instanceof Error ? err.message : 'the call failed')
    } finally {
      setSaving(false)
    }
  }

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
      onClick={onClose}
    >
      <YStack
        width="100%"
        maxWidth={680}
        maxHeight="90vh"
        borderRadius="$4"
        borderWidth={1}
        borderColor="rgba(255, 255, 255, 0.12)"
        backgroundColor="#0c0c0e"
        style={{
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8)',
          overflowY: 'auto',
        }}
        padding="$5"
        gap="$4"
        onClick={(e: any) => e.stopPropagation()}
      >
        {/* Header */}
        <XStack alignItems="center" justifyContent="space-between">
          <XStack alignItems="center" gap="$2.5">
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'linear-gradient(135deg, rgba(167, 139, 250, 0.25), rgba(52, 211, 153, 0.25))',
                border: '1px solid rgba(167, 139, 250, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#a78bfa',
              }}
            >
              <Bot size={18} />
            </div>
            <YStack gap="$0.5">
              <SizableText size="$3" fontWeight="700" color="$ink" style={{ color: '#ffffff' }}>
                Agent Builder & Studio
              </SizableText>
              <SizableText size="$1" color="$faint" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                Design custom agents, bind MCP tools, and deploy them to the active Swarm.
              </SizableText>
            </YStack>
          </XStack>

          <button
            type="button"
            onClick={onClose}
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

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Handle & Name Row */}
          <XStack gap="$3">
            <YStack flex={1} gap="$1.5">
              <SizableText size="$1" fontWeight="600" color="$ink">
                Agent Handle
              </SizableText>
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="@architect"
                required
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: 6,
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'rgba(255, 255, 255, 0.04)',
                  color: '#ffffff',
                  fontSize: 12.5,
                  outline: 'none',
                }}
              />
            </YStack>

            {/* There is ONE name. An agent's `name` is its org-unique handle,
                and the `@` a screen draws is a rendering — a second "display
                name" box beside it was two fields for one value. */}
          </XStack>

          {/* Role / Description */}
          <YStack gap="$1.5">
            <SizableText size="$1" fontWeight="600" color="$ink">
              Role & Purpose
            </SizableText>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="What does this agent specialize in?"
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: 6,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'rgba(255, 255, 255, 0.04)',
                color: '#ffffff',
                fontSize: 12.5,
                outline: 'none',
              }}
            />
          </YStack>

          {/* System Prompt */}
          <YStack gap="$1.5">
            <SizableText size="$1" fontWeight="600" color="$ink">
              System Instructions
            </SizableText>
            <textarea
              rows={4}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Define behavioral rules, style constraints, and expected tool usage..."
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'rgba(255, 255, 255, 0.04)',
                color: '#ffffff',
                fontSize: 12,
                fontFamily: 'var(--font-mono, monospace)',
                outline: 'none',
                resize: 'vertical',
              }}
            />
          </YStack>

          {/* Tool Bindings */}
          <YStack gap="$2">
            <SizableText size="$1" fontWeight="600" color="$ink">
              Model
            </SizableText>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              style={{
                padding: '7px 10px',
                borderRadius: 6,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'rgba(255, 255, 255, 0.04)',
                color: '#ffffff',
                fontSize: 12,
                outline: 'none',
              }}
            >
              <option value="">Pick a model…</option>
              {(models.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                </option>
              ))}
            </select>

            <SizableText size="$1" fontWeight="600" color="$ink">
              Tools it may call
            </SizableText>
            <XStack gap="$2" flexWrap="wrap">
              {(tools ?? []).length === 0 ? (
                <SizableText size="$1" color="rgba(255,255,255,0.4)">
                  No origin offers a dispatchable tool right now.
                </SizableText>
              ) : null}
              {(tools ?? []).map((t) => {
                const active = selectedTools.includes(t.name)
                return (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => toggleTool(t.name)}
                    className="tap"
                    title={t.description}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '5px 9px',
                      borderRadius: 6,
                      background: active ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                      border: active
                        ? '1px solid rgba(52, 211, 153, 0.35)'
                        : '1px solid rgba(255, 255, 255, 0.08)',
                      color: active ? '#34d399' : 'rgba(255, 255, 255, 0.65)',
                      fontSize: 11.5,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    <span>{t.name}</span>
                  </button>
                )
              })}
            </XStack>
            {fault ? (
              <SizableText size="$1" color="#f87171">
                {fault}
              </SizableText>
            ) : null}
          </YStack>

          {/* Actions Footer */}
          <XStack justifyContent="flex-end" gap="$2" paddingTop="$3">
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '7px 14px',
                borderRadius: 6,
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#ffffff',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="tap"
              disabled={saving || !handle.trim() || !model}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '7px 16px',
                borderRadius: 6,
                background: saving || !handle.trim() || !model ? 'rgba(255,255,255,0.25)' : '#ffffff',
                border: 'none',
                color: '#000000',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Save size={13} />
              <span>{saving ? 'Defining…' : 'Define agent'}</span>
            </button>
          </XStack>
        </form>
      </YStack>
    </div>
  )
}
