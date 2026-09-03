/**
 * Artifacts & Interactive Sandbox Execution Canvas.
 *
 * Side-by-side (desktop) and sliding sheet (mobile) artifact viewer supporting
 * live code editing, browser previews, and execution in a leased sandbox — an
 * ORIGIN says where it runs and a RUNTIME says what isolates it.
 */
import {
  Check,
  Code2,
  Copy,
  Cpu,
  Download,
  Eye,
  Play,
  Square,
  Terminal,
  Trash2,
  X,
} from '@hanzogui/lucide-icons-2'
import { SizableText, XStack, YStack } from '@hanzo/ui'
import { useEffect, useRef, useState, type CSSProperties } from 'react'

import type { SandboxRuntime } from '@hanzo/ai'

import { origins } from '@hanzo/chat/data/origin'

/** Both pickers, so the two questions read as siblings rather than as ranks. */
const PICKER: CSSProperties = {
  background: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: 6,
  color: 'rgba(255, 255, 255, 0.85)',
  fontSize: 11.5,
  fontWeight: 500,
  padding: '3px 8px',
  outline: 'none',
  cursor: 'pointer',
}

import { artifactStore, useArtifact, useRunCode, useStopCode } from './store.ts'

const TAB_BUTTON_STYLE = (active: boolean): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 12px',
  borderRadius: 7,
  fontSize: 12,
  fontWeight: 600,
  color: active ? '#ffffff' : 'rgba(255, 255, 255, 0.55)',
  background: active ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
  border: active ? '1px solid rgba(255, 255, 255, 0.14)' : '1px solid transparent',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
})

const ACTION_BUTTON_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  borderRadius: 6,
  background: 'rgba(255, 255, 255, 0.04)',
  border: '1px solid rgba(255, 255, 255, 0.09)',
  color: 'rgba(255, 255, 255, 0.75)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
}

export const ArtifactPanel = () => {
  const artifact = useArtifact()
  // Two writes, each with its own pending and its own refusal.
  const running = useRunCode()
  const stopping = useStopCode()
  const isRunning = running.pending
  const [copied, setCopied] = useState(false)
  const terminalEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (artifact?.activeTab === 'terminal') {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [artifact?.logs.length, artifact?.activeTab])

  if (!artifact) return null

  const { title, language, code, where, runtime, activeTab, logs } = artifact

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // fallback
    }
  }

  const handleDownload = () => {
    const ext = language === 'typescript' || language === 'tsx' ? 'tsx' : language === 'html' ? 'html' : 'ts'
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Generate sandbox preview document
  const previewHtml = language === 'html'
    ? code
    : `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body {
        margin: 0;
        padding: 24px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #09090b;
        color: #f4f4f5;
      }
      .card {
        padding: 20px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.1);
      }
      pre {
        background: #000;
        padding: 12px;
        border-radius: 8px;
        overflow: auto;
        color: #10b981;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h3 style="margin-top: 0;">⚡ Sandbox Output: ${title}</h3>
      <p style="color: rgba(255, 255, 255, 0.6); font-size: 13px;">
        ${where} · <strong>${runtime}</strong> · Language: <strong>${language}</strong>
      </p>
      <pre><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
    </div>
  </body>
</html>
`

  return (
    <YStack
      width="100%"
      maxWidth={580}
      height="100%"
      borderLeftWidth={1}
      borderColor="rgba(255, 255, 255, 0.08)"
      backgroundColor="rgba(10, 10, 12, 0.96)"
      style={{
        backdropFilter: 'blur(32px) saturate(190%)',
        WebkitBackdropFilter: 'blur(32px)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 30,
      }}
    >
      {/* Header Bar */}
      <XStack
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal="$3"
        paddingVertical="$2.5"
        borderBottomWidth={1}
        borderColor="rgba(255, 255, 255, 0.07)"
        gap="$2"
      >
        <XStack alignItems="center" gap="$2" minWidth={0} flex={1}>
          <div
            style={{
              padding: '3px 8px',
              borderRadius: 6,
              background: 'rgba(255, 255, 255, 0.07)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              fontSize: 10.5,
              fontWeight: 600,
              color: '#ffffff',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
            }}
          >
            {language}
          </div>
          <SizableText
            size="$2"
            fontWeight="600"
            color="$ink"
            numberOfLines={1}
            style={{ color: '#ffffff' }}
          >
            {title || 'Artifact Canvas'}
          </SizableText>
        </XStack>

        {/* WHERE it runs, and WHAT isolates it — two questions, two controls.
            One picker offering "Local k3s / Hanzo Cloud / gVisor Enclave" made
            them look like three values of one. */}
        <XStack alignItems="center" gap="$1.5">
          <select
            value={where}
            onChange={(e) => artifactStore.setWhere(e.target.value)}
            style={PICKER}
          >
            {origins().map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>

          <select
            value={runtime}
            onChange={(e) => artifactStore.setRuntime(e.target.value as SandboxRuntime)}
            style={PICKER}
          >
            <option value="runc">runc</option>
            <option value="gvisor">gVisor</option>
            <option value="kata-clh">microVM · cloud-hypervisor</option>
            <option value="kata-fc">microVM · firecracker</option>
          </select>

          {isRunning ? (
            <button
              type="button"
              title="Stop execution"
              onClick={() => void stopping.run()}
              style={{
                ...ACTION_BUTTON_STYLE,
                background: 'rgba(239, 68, 68, 0.15)',
                borderColor: 'rgba(239, 68, 68, 0.3)',
                color: '#f87171',
              }}
            >
              <Square size={13} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              title="Run in Sandbox"
              onClick={() => void running.run()}
              style={{
                ...ACTION_BUTTON_STYLE,
                background: 'rgba(16, 185, 129, 0.15)',
                borderColor: 'rgba(16, 185, 129, 0.3)',
                color: '#34d399',
              }}
            >
              <Play size={13} fill="currentColor" />
            </button>
          )}

          <button
            type="button"
            title={copied ? 'Copied!' : 'Copy Code'}
            onClick={handleCopy}
            style={ACTION_BUTTON_STYLE}
          >
            {copied ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
          </button>

          <button
            type="button"
            title="Download file"
            onClick={handleDownload}
            style={ACTION_BUTTON_STYLE}
          >
            <Download size={13} />
          </button>

          <button
            type="button"
            title="Close Canvas"
            onClick={() => artifactStore.close()}
            style={ACTION_BUTTON_STYLE}
          >
            <X size={14} />
          </button>
        </XStack>
      </XStack>

      {/* Tab Controls */}
      <XStack
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal="$3"
        paddingVertical="$2"
        borderBottomWidth={1}
        borderColor="rgba(255, 255, 255, 0.05)"
      >
        <XStack gap="$1">
          <button
            type="button"
            onClick={() => artifactStore.setTab('code')}
            style={TAB_BUTTON_STYLE(activeTab === 'code')}
          >
            <Code2 size={13} />
            <span>Code</span>
          </button>

          <button
            type="button"
            onClick={() => artifactStore.setTab('preview')}
            style={TAB_BUTTON_STYLE(activeTab === 'preview')}
          >
            <Eye size={13} />
            <span>Preview</span>
          </button>

          <button
            type="button"
            onClick={() => artifactStore.setTab('terminal')}
            style={TAB_BUTTON_STYLE(activeTab === 'terminal')}
          >
            <Terminal size={13} />
            <span>Sandbox Log</span>
            {isRunning && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 9999,
                  background: '#10b981',
                  boxShadow: '0 0 6px #10b981',
                }}
              />
            )}
          </button>
        </XStack>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {activeTab === 'terminal' && (
            <button
              type="button"
              title="Clear Terminal Logs"
              onClick={() => artifactStore.clearLogs()}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.4)',
                cursor: 'pointer',
                padding: 2,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Trash2 size={12} />
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Cpu size={12} style={{ color: 'rgba(255, 255, 255, 0.4)' }} />
            {/* The isolation the sandbox ASKED for. What it GOT is on the
                lease and is printed to the log when the two differ. */}
            <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.4)', fontWeight: 500 }}>
              {runtime}
            </span>
          </div>
        </div>
      </XStack>

      {/* Main Content Area */}
      <YStack flex={1} minHeight={0} position="relative" overflow="hidden">
        {activeTab === 'code' && (
          <textarea
            value={code}
            onChange={(e) => artifactStore.updateCode(e.target.value)}
            spellCheck={false}
            style={{
              width: '100%',
              height: '100%',
              boxSizing: 'border-box',
              padding: '16px 18px',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              fontSize: 13,
              lineHeight: 1.6,
              color: '#e4e4e7',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              whiteSpace: 'pre',
              tabSize: 2,
            }}
          />
        )}

        {activeTab === 'preview' && (
          <iframe
            title={title}
            srcDoc={previewHtml}
            sandbox="allow-scripts allow-modals"
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              background: '#09090b',
            }}
          />
        )}

        {activeTab === 'terminal' && (
          <div
            style={{
              flex: 1,
              height: '100%',
              backgroundColor: '#050508',
              padding: '14px 16px',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              fontSize: 12,
              lineHeight: 1.6,
              overflowY: 'auto',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {logs.map((log, idx) => {
              const isCommand = log.startsWith('$') || log.startsWith('\n$')
              const isSuccess = log.includes('✓') || log.includes('online') || log.includes('ready') || log.includes('succeeded')
              const isWarn = log.includes('SIGTERM') || log.includes('terminated')
              const isError = log.includes('error') || log.includes('Error')
              const isHeader = log.startsWith('[sandbox]') || log.startsWith('[builder]') || log.startsWith('[compiler]') || log.startsWith('[runtime]') || log.startsWith('[zap]')
              return (
                <div
                  key={idx}
                  style={{
                    display: 'block',
                    minHeight: 18,
                    color: isCommand
                      ? '#60a5fa'
                      : isSuccess
                      ? '#34d399'
                      : isWarn
                      ? '#fbbf24'
                      : isError
                      ? '#f87171'
                      : isHeader
                      ? 'rgba(255, 255, 255, 0.85)'
                      : 'rgba(255, 255, 255, 0.65)',
                    wordBreak: 'break-all',
                    whiteSpace: 'pre-wrap',
                    fontWeight: isCommand || isSuccess ? 600 : 400,
                  }}
                >
                  {log}
                </div>
              )
            })}
            {isRunning && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981', paddingTop: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: 9999, background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
                <span style={{ fontSize: 11, fontStyle: 'italic' }}>Execution sandbox running...</span>
              </div>
            )}
            <div ref={terminalEndRef} />
          </div>
        )}
      </YStack>
    </YStack>
  )
}
