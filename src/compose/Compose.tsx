/**
 * The composer with file upload, drag-and-drop, clipboard paste, and attachment previews.
 */
import { Paperclip, Plus, X } from '@hanzogui/lucide-icons-2'
import { SizableText, XStack, YStack } from '@hanzo/ui'
import { Composer } from '@hanzo/ui/chat'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { Insert, type Lane } from './Insert.tsx'
import { Starters, type Starter } from './Starters.tsx'
import { useDraft } from '@hanzo/chat/compose/draft'
import type { Handoff } from '@hanzo/chat/compose/link'
import { payload, type Conversation, type Draft, type Payload } from '@hanzo/chat/compose/submit'
import type { Attachment } from '../data/types.ts'

const COLUMN = 768
const CEILING = 240

export interface ComposeProps {
  conversation?: Conversation | null
  parent?: string | null
  busy?: boolean
  disabled?: boolean
  model?: ReactNode
  link?: Handoff | null
  empty?: boolean
  starters?: Starter[]
  onSend: (turn: Payload) => boolean | void
  onStop?: () => void
  onTrouble?: (say: string) => void
}

export const Compose = ({
  conversation = null,
  parent = null,
  busy = false,
  disabled = false,
  model,
  link = null,
  empty = false,
  starters,
  onSend,
  onStop,
  onTrouble: _onTrouble,
}: ComposeProps) => {
  const field = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  // What the insert menu is showing, or nothing. `query` is what was typed
  // after the trigger, so the list narrows as somebody keeps typing.
  const [insert, setInsert] = useState<{ lane: Lane; query: string } | null>(null)

  /**
   * Writes the draft, and reads its tail for a trigger.
   *
   * `/` opens the tools at the START of a word only — otherwise every URL and
   * every date in a sentence would open a menu over what somebody is writing.
   */
  const type = (text: string) => {
    write(text)
    const slash = /(?:^|\s)\/([^\s/]*)$/.exec(text)
    setInsert(slash ? { lane: 'tool', query: slash[1] } : null)
  }

  /** Puts the chosen name in, replacing the trigger that opened the menu. */
  const put = (chosen: string) => {
    const text = draft.text
    write(
      insert?.lane === 'tool'
        ? text.replace(/(?:^|\s)\/[^\s/]*$/, (m) => (m.startsWith('/') ? chosen : ` ${chosen}`))
        : `${text}${text && !text.endsWith(' ') ? ' ' : ''}${chosen}`,
    )
    setInsert(null)
    field.current?.focus()
  }

  const conversationId = conversation?.conversationId ?? null
  const { draft, write, addFiles, removeFile, clear } = useDraft(conversationId)

  const processFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const incoming: Attachment[] = []
      for (const f of Array.from(fileList)) {
        const isImg = f.type.startsWith('image/')
        let preview = ''
        let text = ''

        if (isImg) {
          preview = await new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.readAsDataURL(f)
          })
        } else {
          // Read text for code/markdown/json files if small
          if (f.size < 500000) {
            text = await new Promise<string>((resolve) => {
              const reader = new FileReader()
              reader.onload = () => resolve(reader.result as string)
              reader.readAsText(f)
            })
          }
        }

        incoming.push({
          file_id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          filename: f.name,
          filepath: preview || '',
          type: f.type || 'application/octet-stream',
          bytes: f.size,
          preview,
          text,
        })
      }

      if (incoming.length > 0) {
        addFiles(incoming)
      }
    },
    [addFiles],
  )

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void processFiles(e.target.files)
      e.target.value = ''
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
      e.preventDefault()
      void processFiles(e.clipboardData.files)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      void processFiles(e.dataTransfer.files)
    }
  }

  const fire = useCallback(
    (text: string) => {
      const going: Draft = { ...draft, text: text.trim() }
      const hasContent = going.text.length > 0 || (going.files && going.files.length > 0)
      if (!hasContent || busy || disabled) return
      const gone = onSend(payload({ draft: going, conversation, parent }))
      if (gone !== false) clear()
    },
    [draft, busy, disabled, conversation, parent, onSend, clear],
  )

  const send = useCallback(() => fire(draft.text), [fire, draft.text])

  const seeded = useRef<string | null>(null)
  const armed = useRef(false)
  useEffect(() => {
    if (!link || seeded.current === link.text) return
    seeded.current = link.text
    armed.current = link.send
    write(link.text)
  }, [link, write])
  useEffect(() => {
    if (!armed.current || draft.text !== seeded.current) return
    armed.current = false
    fire(draft.text)
  }, [draft.text, fire])

  const attachments = draft.files ?? []

  return (
    <YStack
      width="100%"
      maxWidth={COLUMN}
      alignSelf="center"
      gap="$3"
      data-testid="compose"
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Hidden file input */}
      <input
        ref={fileInput}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInput}
      />

      {/* Attachment Previews */}
      {attachments.length > 0 && (
        <XStack gap="$2" flexWrap="wrap" paddingHorizontal="$2" paddingBottom="$1">
          {attachments.map((file) => {
            const isImg = file.type.startsWith('image/')
            return (
              <XStack
                key={file.file_id}
                alignItems="center"
                gap="$2"
                paddingHorizontal="$2.5"
                paddingVertical="$1.5"
                borderRadius="$3"
                borderWidth={1}
                borderColor="rgba(255, 255, 255, 0.12)"
                backgroundColor="rgba(255, 255, 255, 0.05)"
                style={{ backdropFilter: 'blur(16px)' }}
              >
                {isImg && file.preview ? (
                  <img
                    src={file.preview}
                    alt={file.filename}
                    style={{ width: 20, height: 20, borderRadius: 4, objectFit: 'cover' }}
                  />
                ) : (
                  <Paperclip size={13} color="rgba(255, 255, 255, 0.7)" />
                )}
                <SizableText size="$1" color="$ink" numberOfLines={1} maxWidth={160}>
                  {file.filename}
                </SizableText>
                <button
                  type="button"
                  title="Remove attachment"
                  onClick={() => removeFile(file.file_id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'rgba(255, 255, 255, 0.5)',
                    cursor: 'pointer',
                  }}
                >
                  <X size={13} />
                </button>
              </XStack>
            )
          })}
        </XStack>
      )}

      {/* Main Composer Box */}
      <div
        style={{
          position: 'relative',
          borderRadius: 18,
          background: 'rgba(255, 255, 255, 0.03)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: dragOver
            ? '1px dashed #3b82f6'
            : '1px solid rgba(255, 255, 255, 0.09)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onPaste={handlePaste}
      >
        {insert && (
          <Insert lane={insert.lane} query={insert.query} onPick={put} onClose={() => setInsert(null)} />
        )}
        <Composer
          value={draft.text}
          onChange={type}
          onSend={send}
          onStop={onStop}
          busy={busy}
          disabled={disabled}
          rows={1}
          maxHeight={CEILING}
          label="Message"
          hint={busy ? 'Generating…' : 'Enter to send, Shift+Enter for a new line'}
          field={{ ref: field }}
        >
          <XStack alignItems="center" gap="$2">
            {/* Add an agent or a tool by name. */}
            <button
              type="button"
              title="Add an agent or a tool"
              disabled={busy || disabled}
              onClick={() => setInsert(insert ? null : { lane: 'all', query: '' })}
              className="tap"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: 6,
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: 'rgba(255, 255, 255, 0.7)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Plus size={14} />
            </button>

            {/* Paperclip upload button */}
            <button
              type="button"
              title="Attach files or images"
              disabled={busy || disabled}
              onClick={() => fileInput.current?.click()}
              className="tap"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: 6,
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: 'rgba(255, 255, 255, 0.7)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Paperclip size={14} />
            </button>

            {/* Model Selector */}
            {model}
          </XStack>
        </Composer>
      </div>

      {/* Examples / Starter Suggestion Cards Below Composer */}
      {empty && <Starters starters={starters} disabled={busy || disabled} onPick={fire} />}
    </YStack>
  )
}
