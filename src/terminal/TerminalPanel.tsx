/**
 * The sandbox panel: a leased computer, and what it printed.
 *
 * Two controls, because there are two questions (see `./store`): WHERE it runs
 * is an origin, and WHAT isolates it is a runtime. A microVM is one of the
 * runtimes, so it is in that menu rather than standing beside the origin as if
 * "cloud microVM" were a third place.
 *
 * Tabs is a workspace that opens against whichever origin is selected, so it is
 * a destination rather than a peer of the two controls.
 */
import {
  Check,
  Copy,
  ExternalLink,
  Layers,
  Square,
  Trash2,
  X,
} from '@hanzogui/lucide-icons-2'
import { SizableText, XStack, YStack } from '@hanzo/ui'
import { useState, type CSSProperties, type FormEvent } from 'react'

import { origins } from '~/data/origin'
import { terminalStore, useEnd, useRun, useTerminal, type Kind } from './store'

/** Where the Tabs workspace lives. It is a destination, not an origin. */
const TABS = 'https://tabs.hanzo.ai/app'

const PICK = (active: boolean): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  borderRadius: 7,
  fontSize: 12,
  fontWeight: 600,
  color: active ? '#ffffff' : 'rgba(255, 255, 255, 0.55)',
  background: active ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
  border: active ? '1px solid rgba(255, 255, 255, 0.14)' : '1px solid transparent',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
})

const ACTION: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 26,
  height: 26,
  borderRadius: 6,
  background: 'rgba(255, 255, 255, 0.04)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  color: 'rgba(255, 255, 255, 0.7)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
}

const SELECT: CSSProperties = {
  appearance: 'none',
  padding: '5px 10px',
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 600,
  color: 'rgba(255, 255, 255, 0.75)',
  background: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid rgba(255, 255, 255, 0.09)',
  cursor: 'pointer',
}

/** The isolation a sandbox can be asked for. A microVM is two of these. */
const RUNTIMES: { id: 'runc' | 'gvisor' | 'kata-clh' | 'kata-fc'; label: string }[] = [
  { id: 'runc', label: 'runc — shared kernel' },
  { id: 'gvisor', label: 'gVisor — user-space kernel' },
  { id: 'kata-clh', label: 'microVM (cloud-hypervisor)' },
  { id: 'kata-fc', label: 'microVM (firecracker)' },
]

const INK: Record<Kind, string> = {
  command: '#ffffff',
  out: 'rgba(255, 255, 255, 0.78)',
  err: '#f87171',
  note: 'rgba(255, 255, 255, 0.42)',
}

export const TerminalPanel = () => {
  const { isOpen, where, runtime, box, lines } = useTerminal()
  // Two writes, each with its own pending and its own refusal.
  const running = useRun()
  const ending = useEnd()
  const busy = running.pending || ending.pending
  const fault = running.fault ?? ending.fault
  const [typed, setTyped] = useState('')
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const places = origins()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const line = typed
    setTyped('')
    void running.run(line)
  }

  const copy = () => {
    void navigator.clipboard.writeText(lines.map((l) => l.text).join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <YStack
      width="100%"
      maxWidth={620}
      height="100%"
      borderLeftWidth={1}
      borderColor="rgba(255, 255, 255, 0.08)"
      backgroundColor="rgba(8, 8, 10, 0.96)"
      style={{
        backdropFilter: 'blur(32px) saturate(190%)',
        WebkitBackdropFilter: 'blur(32px)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 35,
      }}
    >
      <XStack
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal="$3"
        paddingVertical="$2"
        borderBottomWidth={1}
        borderColor="rgba(255, 255, 255, 0.07)"
      >
        {/* WHERE it runs. One button per origin this build can reach — the
            machine only appears in the desktop shell, so this is one option in
            the browser and two in the app. */}
        <XStack gap="$1.5" flexWrap="wrap" flex={1}>
          {places.map((place) => (
            <button
              key={place.id}
              type="button"
              onClick={() => terminalStore.setWhere(place.id)}
              style={PICK(where === place.id)}
            >
              <span>{place.label}</span>
            </button>
          ))}
        </XStack>

        <XStack alignItems="center" gap="$1.5">
          <button
            type="button"
            title="Open Tabs against this origin"
            onClick={() => window.open(TABS, '_blank', 'noopener,noreferrer')}
            style={ACTION}
          >
            <Layers size={13} />
          </button>
          <button type="button" title="Copy output" onClick={copy} style={ACTION}>
            {copied ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
          </button>
          <button
            type="button"
            title="Clear output"
            onClick={() => terminalStore.clear()}
            style={ACTION}
          >
            <Trash2 size={13} />
          </button>
          {box && (
            <button
              type="button"
              title="End the lease"
              onClick={() => void ending.run()}
              style={ACTION}
            >
              <Square size={12} />
            </button>
          )}
          <button
            type="button"
            title="Close"
            onClick={() => terminalStore.close()}
            style={ACTION}
          >
            <X size={14} />
          </button>
        </XStack>
      </XStack>

      {/* WHAT isolates it, and what is actually held. The lease's own runtime is
          shown rather than the one asked for: the fleet may refuse a
          combination, and `Leased.runtime` is the field that says what happened. */}
      <XStack
        alignItems="center"
        gap="$2"
        paddingHorizontal="$3"
        paddingVertical="$2"
        borderBottomWidth={1}
        borderColor="rgba(255, 255, 255, 0.06)"
      >
        <select
          value={runtime}
          onChange={(e) => terminalStore.setRuntime(e.target.value as typeof runtime)}
          style={SELECT}
        >
          {RUNTIMES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>

        <SizableText size="$1" color="rgba(255,255,255,0.45)">
          {busy
            ? 'working…'
            : box
              ? `${box.id} · ${box.runtime ?? 'runtime unstated'}`
              : 'no sandbox — a command leases one'}
        </SizableText>

        {fault && (
          <SizableText size="$1" color="#f87171" numberOfLines={1}>
            {fault}
          </SizableText>
        )}
      </XStack>

      <YStack
        flex={1}
        paddingHorizontal="$3"
        paddingVertical="$2"
        gap="$0.5"
        style={{ overflowY: 'auto', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
      >
        {lines.length === 0 ? (
          <SizableText size="$1" color="rgba(255,255,255,0.35)">
            Nothing has run yet. A command leases a sandbox from the selected origin.
          </SizableText>
        ) : (
          lines.map((line, i) => (
            <div key={i} style={{ color: INK[line.kind], whiteSpace: 'pre-wrap' }}>
              {line.kind === 'command' ? `$ ${line.text}` : line.text}
            </div>
          ))
        )}
      </YStack>

      <form onSubmit={submit}>
        <XStack
          alignItems="center"
          gap="$2"
          paddingHorizontal="$3"
          paddingVertical="$2"
          borderTopWidth={1}
          borderColor="rgba(255, 255, 255, 0.07)"
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={busy ? 'working…' : 'Run a command in the sandbox'}
            disabled={busy}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#ffffff',
              fontFamily: 'ui-monospace, monospace',
              fontSize: 12,
            }}
          />
          <button type="submit" disabled={busy || !typed.trim()} style={ACTION}>
            <ExternalLink size={13} />
          </button>
        </XStack>
      </form>
    </YStack>
  )
}

export default TerminalPanel
