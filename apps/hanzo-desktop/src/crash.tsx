import { getBrand } from '@hanzo/desktop-brand-config';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';

/**
 * What "Copy details" puts on the clipboard: the error with its stack, the screen and the
 * version, through the app's one redactor (report.rs, hanzo-log-redact). Without it, nothing.
 */
export async function details(error: unknown, version: string): Promise<string> {
  const text = error instanceof Error ? `${error.name}: ${error.message}\n\n${error.stack ?? ''}` : String(error);
  return invoke<string>('report_redact', { text: `App version: ${version}\nScreen: ${window.location.pathname}\n\n${text}`.trim() });
}

/**
 * The main window's error screen. Plain elements and inline styles, not @hanzo/ui: what
 * crashed may be the component layer itself. The stack is only in the copied details.
 */
export function Crash({ error }: { error: unknown }) {
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  const copy = async () => {
    const version = await getVersion().catch(() => 'unknown');
    try {
      await navigator.clipboard.writeText(await details(error, version));
      setCopied('done');
    } catch {
      setCopied('failed');
    }
  };
  const button = {
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'transparent',
    color: 'inherit',
    font: 'inherit',
    cursor: 'pointer',
  } as const;
  return (
    <div
      role="alert"
      style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '48px 40px',
        boxSizing: 'border-box',
        background: '#0a0a0a',
        color: '#f5f5f5',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: 14,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 600 }}>Something went wrong.</div>
      <div style={{ opacity: 0.8, maxWidth: 420 }}>
        {getBrand().name} hit a problem it could not recover from. Reload to try again. If it keeps happening, copy the
        details to send with a report.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={{ ...button, background: '#f5f5f5', color: '#0a0a0a' }} onClick={() => window.location.reload()}>
          Reload
        </button>
        <button type="button" style={button} onClick={() => void copy()}>
          {copied === 'done' ? 'Copied' : 'Copy details'}
        </button>
      </div>
      {copied === 'failed' && <div style={{ opacity: 0.8 }}>The details could not be copied.</div>}
    </div>
  );
}
