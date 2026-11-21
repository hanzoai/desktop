import { getBrand } from '@hanzo/desktop-brand-config';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { keychain, open as openKeychain } from '../../keychain';

interface FrontmostContext {
  appName: string;
  windowTitle: string | null;
  capturedAt: number;
}

interface SpotlightAppEntry {
  name: string;
  path: string;
  source: string;
}

interface SpotlightFileEntry {
  name: string;
  path: string;
  isDir: boolean;
}

interface SpotlightClipboardEntry {
  id: number;
  text: string;
  capturedAt: number;
}

interface SpotlightSystemAction {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  keywords: string[];
}

type ResultItem =
  | { kind: 'calc'; id: string; title: string; subtitle: string; value: string }
  | { kind: 'app'; id: string; title: string; subtitle: string; path: string }
  | { kind: 'action'; id: string; title: string; subtitle: string; category: string; actionId: string }
  | { kind: 'file'; id: string; title: string; subtitle: string; path: string; isDir: boolean }
  | { kind: 'clipboard'; id: string; title: string; subtitle: string; text: string }
  | { kind: 'ai'; id: string; title: string; subtitle: string; prompt: string };

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  0?: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

const LOCAL_ENGINE_CHAT_URL = 'http://127.0.0.1:36900/v1/chat/completions';
const CLOUD_API_ORIGIN = getBrand().cloudApi || 'https://api.hanzo.ai';

/** Safe arithmetic evaluator for Spotlight-style instant calculations (`24 * 365`, `(1920-120)/2`). */
function evaluateCalculator(input: string): string | null {
  const expr = input.trim().replace(/^=\s*/, '');
  if (!expr || !/^[\d\s.+\-*/()%^]+$/.test(expr) || !/[+\-*/%^]/.test(expr)) {
    return null;
  }
  const tokens = expr.match(/\d+(?:\.\d+)?|[+\-*/()%^]/g);
  if (!tokens || tokens.length < 3) return null;

  let pos = 0;
  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  const parseExpression = (): number => {
    let left = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = consume();
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  };

  const parseTerm = (): number => {
    let left = parsePower();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = consume();
      const right = parsePower();
      if (op === '*') left *= right;
      else if (op === '/') left /= right;
      else left %= right;
    }
    return left;
  };

  const parsePower = (): number => {
    let base = parseUnary();
    if (peek() === '^') {
      consume();
      base = Math.pow(base, parsePower());
    }
    return base;
  };

  const parseUnary = (): number => {
    if (peek() === '-') {
      consume();
      return -parseUnary();
    }
    if (peek() === '+') {
      consume();
      return parseUnary();
    }
    return parsePrimary();
  };

  const parsePrimary = (): number => {
    if (peek() === '(') {
      consume();
      const val = parseExpression();
      if (consume() !== ')') throw new Error('unbalanced');
      return val;
    }
    const num = Number(consume());
    if (!Number.isFinite(num)) throw new Error('nan');
    return num;
  };

  try {
    const result = parseExpression();
    if (pos !== tokens.length || !Number.isFinite(result)) return null;
    return Number.isInteger(result) ? result.toLocaleString() : Number(result.toFixed(6)).toString();
  } catch {
    return null;
  }
}

function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t === q) return 1000;
  if (t.startsWith(q)) return 800 - t.length;
  const idx = t.indexOf(q);
  if (idx !== -1) return 500 - idx * 3 - t.length;
  let qi = 0;
  let score = 0;
  for (let i = 0; i < t.length && qi < q.length; i += 1) {
    if (t[i] === q[qi]) {
      score += 10;
      qi += 1;
    }
  }
  return qi === q.length ? score : 0;
}

async function resolveAccessToken(): Promise<string | null> {
  await openKeychain().catch(() => undefined);
  const direct = keychain.getItem('hanzo_iam_access_token');
  if (direct) return direct;
  try {
    const adopted = await invoke<{ access_token?: string } | null>('identity_adopt');
    if (adopted?.access_token) return adopted.access_token;
  } catch {
    // Ignore when signed out.
  }
  return null;
}

export function HanzoCommandBar() {
  const [message, setMessage] = useState('');
  const [context, setContext] = useState<FrontmostContext>({
    appName: 'Desktop',
    windowTitle: null,
    capturedAt: Date.now(),
  });
  const [attachContext, setAttachContext] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [clipboardMode, setClipboardMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [sending, setSending] = useState(false);
  const [reply, setReply] = useState<string>('');
  const [replyError, setReplyError] = useState<string | null>(null);
  const [apps, setApps] = useState<SpotlightAppEntry[]>([]);
  const [actions, setActions] = useState<SpotlightSystemAction[]>([]);
  const [files, setFiles] = useState<SpotlightFileEntry[]>([]);
  const [clipboard, setClipboard] = useState<SpotlightClipboardEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const resizeHud = useCallback((height: number) => {
    void invoke('spotlight_resize_window', { height }).catch(() => undefined);
  }, []);

  const hideHud = useCallback(() => {
    abortRef.current?.abort();
    recognitionRef.current?.stop();
    setListening(false);
    setMenuOpen(false);
    setClipboardMode(false);
    void invoke('hide_spotlight_window_app').catch(() => undefined);
  }, []);

  // Load installed apps + macOS system actions once on mount (Sol parity)
  useEffect(() => {
    void invoke<SpotlightAppEntry[]>('spotlight_list_apps')
      .then((list) => {
        if (Array.isArray(list)) setApps(list);
      })
      .catch(() => undefined);
    void invoke<SpotlightSystemAction[]>('spotlight_list_system_actions')
      .then((list) => {
        if (Array.isArray(list)) setActions(list);
      })
      .catch(() => undefined);
  }, []);

  const refreshClipboard = useCallback(() => {
    void invoke<SpotlightClipboardEntry[]>('spotlight_get_clipboard_history')
      .then((list) => {
        if (Array.isArray(list)) setClipboard(list);
      })
      .catch(() => undefined);
  }, []);

  // Live debounced file search via macOS Spotlight index (mdfind)
  useEffect(() => {
    const q = message.trim();
    if (clipboardMode || q.length < 2 || q.includes('\n') || q.split(/\s+/).length > 4) {
      setFiles([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void invoke<SpotlightFileEntry[]>('spotlight_search_files', { query: q })
        .then((res) => setFiles(Array.isArray(res) ? res : []))
        .catch(() => setFiles([]));
    }, 160);
    return () => window.clearTimeout(timer);
  }, [clipboardMode, message]);

  useEffect(() => {
    void invoke<FrontmostContext>('desktop_get_frontmost_context')
      .then((ctx) => {
        if (ctx?.appName) setContext(ctx);
      })
      .catch(() => undefined);

    let unlisten: (() => void) | undefined;
    void listen<FrontmostContext>('spotlight:context', (event) => {
      if (event.payload?.appName) {
        setContext(event.payload);
      }
      setMenuOpen(false);
      setClipboardMode(false);
      refreshClipboard();
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }).then((fn) => {
      unlisten = fn;
    });

    const onFocus = () => {
      refreshClipboard();
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (clipboardMode) {
          setClipboardMode(false);
        } else {
          hideHud();
        }
      }
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('keydown', onKeyDown);
    refreshClipboard();
    requestAnimationFrame(() => inputRef.current?.focus());

    return () => {
      unlisten?.();
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [clipboardMode, hideHud, refreshClipboard]);

  const dispatchToMainApp = useCallback(
    async (mode: 'chat' | 'dev', overridePrompt?: string) => {
      const prompt = (overridePrompt ?? message).trim();
      setMessage('');
      setReply('');
      setReplyError(null);
      setMenuOpen(false);
      setClipboardMode(false);
      await invoke('spotlight_dispatch_prompt', {
        prompt,
        contextApp: attachContext ? context.appName : null,
        mode,
      }).catch(() => undefined);
    },
    [attachContext, context.appName, message],
  );

  const sendInline = useCallback(
    async (overridePrompt?: string) => {
      const trimmed = (overridePrompt ?? message).trim();
      if (!trimmed || sending) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setSending(true);
      setReply('');
      setReplyError(null);
      setMenuOpen(false);
      setClipboardMode(false);

      const systemContext = attachContext
        ? `The user invoked Hanzo Command while viewing "${context.appName}"${
            context.windowTitle ? ` (window: "${context.windowTitle}")` : ''
          }. Respond concisely and helpfully.`
        : 'Respond concisely and helpfully.';

      const token = await resolveAccessToken();
      const endpoints: Array<{ url: string; headers: Record<string, string>; model: string }> = token
        ? [
            {
              url: `${CLOUD_API_ORIGIN}/v1/chat/completions`,
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              model: 'zen-max',
            },
            {
              url: LOCAL_ENGINE_CHAT_URL,
              headers: { 'Content-Type': 'application/json' },
              model: 'local',
            },
          ]
        : [
            {
              url: LOCAL_ENGINE_CHAT_URL,
              headers: { 'Content-Type': 'application/json' },
              model: 'local',
            },
          ];

      let succeeded = false;
      for (const target of endpoints) {
        try {
          const resp = await fetch(target.url, {
            method: 'POST',
            headers: target.headers,
            signal: controller.signal,
            body: JSON.stringify({
              model: target.model,
              stream: true,
              messages: [
                { role: 'system', content: systemContext },
                { role: 'user', content: trimmed },
              ],
            }),
          });
          if (!resp.ok || !resp.body) continue;

          const reader = resp.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let accumulated = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
              const clean = line.trim();
              if (!clean.startsWith('data:')) continue;
              const data = clean.slice(5).trim();
              if (data === '[DONE]') break;
              try {
                const parsed = JSON.parse(data) as {
                  choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
                };
                const delta =
                  parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content ?? '';
                if (delta) {
                  accumulated += delta;
                  setReply(accumulated);
                }
              } catch {
                // Ignore keepalive chunks.
              }
            }
          }
          succeeded = true;
          break;
        } catch (err) {
          if ((err as Error)?.name === 'AbortError') {
            setSending(false);
            return;
          }
        }
      }

      setSending(false);
      if (!succeeded) {
        await dispatchToMainApp('chat', trimmed);
      }
    },
    [attachContext, context.appName, context.windowTitle, dispatchToMainApp, message, sending],
  );

  // Unified Sol-style Spotlight results + Ask Hanzo AI fallback
  const results = useMemo<ResultItem[]>(() => {
    const q = message.trim();
    if (sending || reply) return [];

    if (clipboardMode || q.toLowerCase() === 'clip' || q.toLowerCase() === 'clipboard') {
      const filter =
        q.toLowerCase() === 'clip' || q.toLowerCase() === 'clipboard' ? '' : q.toLowerCase();
      return clipboard
        .filter((entry) => !filter || entry.text.toLowerCase().includes(filter))
        .slice(0, 8)
        .map((entry) => ({
          kind: 'clipboard',
          id: `clip:${entry.id}`,
          title: entry.text.replace(/\s+/g, ' ').slice(0, 72),
          subtitle: 'Clipboard · press Enter to copy',
          text: entry.text,
        }));
    }

    if (!q) return [];

    const list: ResultItem[] = [];

    const calc = evaluateCalculator(q);
    if (calc !== null) {
      list.push({
        kind: 'calc',
        id: `calc:${q}`,
        title: `= ${calc}`,
        subtitle: 'Calculator · press Enter to copy result',
        value: calc.replace(/,/g, ''),
      });
    }

    const looksLikeSentence = q.split(/\s+/).length >= 4 || q.endsWith('?');

    if (!looksLikeSentence) {
      const matchedApps = apps
        .map((app) => ({ app, score: fuzzyScore(q, app.name) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);
      for (const { app } of matchedApps) {
        list.push({
          kind: 'app',
          id: `app:${app.path}`,
          title: app.name,
          subtitle: `Application · ${app.source}`,
          path: app.path,
        });
      }

      const matchedActions = actions
        .map((act) => ({
          act,
          score: Math.max(
            fuzzyScore(q, act.title),
            ...act.keywords.map((k) => fuzzyScore(q, k)),
          ),
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      for (const { act } of matchedActions) {
        list.push({
          kind: 'action',
          id: `action:${act.id}`,
          title: act.title,
          subtitle: `${act.category} · ${act.subtitle}`,
          category: act.category,
          actionId: act.id,
        });
      }

      for (const file of files.slice(0, 4)) {
        list.push({
          kind: 'file',
          id: `file:${file.path}`,
          title: file.name,
          subtitle: file.path.replace(/^\/Users\/[^/]+/, '~'),
          path: file.path,
          isDir: file.isDir,
        });
      }
    }

    // Always include Ask Hanzo AI — first when it's a natural-language question, or at bottom of Spotlight hits.
    const aiItem: ResultItem = {
      kind: 'ai',
      id: `ai:${q}`,
      title: `Ask Hanzo: "${q.slice(0, 56)}${q.length > 56 ? '…' : ''}"`,
      subtitle: attachContext ? `AI · with context from ${context.appName}` : 'AI · quick answer',
      prompt: q,
    };
    if (looksLikeSentence || list.length === 0) {
      list.unshift(aiItem);
    } else {
      list.push(aiItem);
    }

    return list.slice(0, 7);
  }, [actions, apps, attachContext, clipboard, clipboardMode, context.appName, files, message, reply, sending]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [message, clipboardMode]);

  useEffect(() => {
    if (reply || replyError || sending) {
      resizeHud(440);
    } else if (results.length > 0) {
      resizeHud(Math.min(500, 184 + results.length * 46));
    } else if (menuOpen) {
      resizeHud(240);
    } else {
      resizeHud(176);
    }
  }, [menuOpen, reply, replyError, resizeHud, results.length, sending]);

  const executeResult = useCallback(
    async (item: ResultItem) => {
      switch (item.kind) {
        case 'calc':
          setMessage('');
          await invoke('spotlight_copy_to_clipboard', { text: item.value }).catch(() => undefined);
          break;
        case 'app':
        case 'file':
          setMessage('');
          await invoke('spotlight_launch_app', { path: item.path }).catch(() => undefined);
          break;
        case 'action':
          setMessage('');
          await invoke('spotlight_run_system_action', { actionId: item.actionId }).catch(() => undefined);
          break;
        case 'clipboard':
          setMessage('');
          setClipboardMode(false);
          await invoke('spotlight_copy_to_clipboard', { text: item.text }).catch(() => undefined);
          break;
        case 'ai':
          await sendInline(item.prompt);
          break;
      }
    },
    [sendInline],
  );

  const toggleDictation = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SpeechRec =
      (
        window as unknown as {
          SpeechRecognition?: new () => SpeechRecognitionLike;
          webkitSpeechRecognition?: new () => SpeechRecognitionLike;
        }
      ).SpeechRecognition ??
      (
        window as unknown as {
          webkitSpeechRecognition?: new () => SpeechRecognitionLike;
        }
      ).webkitSpeechRecognition;

    if (!SpeechRec) {
      void invoke('desktop_open_system_settings', { pane: 'microphone' }).catch(() => undefined);
      return;
    }

    const rec = new SpeechRec();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-US';
    rec.onresult = (event) => {
      let text = '';
      for (let i = 0; i < event.results.length; i += 1) {
        text += event.results[i]?.[0]?.transcript ?? '';
      }
      if (text.trim()) setMessage(text.trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  }, [listening]);

  const canSend = message.trim().length > 0 && !sending;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '28px 14px 14px',
        background: 'transparent',
        userSelect: 'none',
      }}
    >
      <div style={{ position: 'relative', width: '100%', maxWidth: 612 }}>
        {/* Floating avatar badge overlapping the top edge of the command bar */}
        <div
          data-tauri-drag-region=""
          style={{
            position: 'absolute',
            top: -24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20,
            width: 44,
            height: 44,
            borderRadius: '9999px',
            overflow: 'hidden',
            border: '2px solid rgba(255, 255, 255, 0.22)',
            background: '#18181b',
            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.45)',
            cursor: 'grab',
          }}
        >
          <img
            src="/agents/dev.png"
            alt="Hanzo"
            draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>

        {/* Floating frosted command card */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            borderRadius: 24,
            background: 'rgba(14, 14, 16, 0.94)',
            backdropFilter: 'blur(28px) saturate(140%)',
            WebkitBackdropFilter: 'blur(28px) saturate(140%)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 20px 48px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
            padding: '14px 16px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {/* Viewing <Active App> context pill */}
          <div
            data-tauri-drag-region=""
            style={{
              display: 'flex',
              justifyContent: 'center',
              paddingTop: 6,
            }}
          >
            <button
              type="button"
              onClick={() => setAttachContext((prev) => !prev)}
              title={
                attachContext
                  ? 'Active app context attached — click to disable'
                  : 'Active app context off — click to attach'
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '5px 13px',
                borderRadius: 999,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: attachContext ? 'rgba(26, 26, 30, 0.78)' : 'rgba(26, 26, 30, 0.35)',
                color: attachContext ? 'rgba(244, 244, 245, 0.92)' : 'rgba(161, 161, 170, 0.65)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
                transition: 'opacity 120ms ease, background 120ms ease',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="4.5" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.4" />
                <circle cx="11.5" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.4" />
                <circle cx="4.5" cy="11.5" r="2" stroke="currentColor" strokeWidth="1.4" />
                <circle cx="11.5" cy="11.5" r="2" stroke="currentColor" strokeWidth="1.4" />
              </svg>
              <span>{clipboardMode ? 'Clipboard History' : `Viewing ${context.appName}`}</span>
            </button>
          </div>

          {/* Message / Spotlight search input */}
          <textarea
            ref={inputRef}
            rows={1}
            value={message}
            onChange={(event) => {
              setReply('');
              setReplyError(null);
              setMessage(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' && results.length > 0) {
                event.preventDefault();
                setSelectedIndex((i) => (i + 1) % results.length);
              } else if (event.key === 'ArrowUp' && results.length > 0) {
                event.preventDefault();
                setSelectedIndex((i) => (i - 1 + results.length) % results.length);
              } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void dispatchToMainApp('chat');
              } else if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                const picked = results[selectedIndex];
                if (picked) {
                  void executeResult(picked);
                } else {
                  void sendInline();
                }
              }
            }}
            placeholder={clipboardMode ? 'Search clipboard history…' : 'Message, launch app, search files, or calculate…'}
            style={{
              width: '100%',
              resize: 'none',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: '#f4f4f5',
              fontSize: 17,
              lineHeight: '24px',
              padding: '2px 4px',
              fontFamily: 'inherit',
            }}
          />

          {/* Bottom action row: + on left, Mic & Send on right */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 2,
            }}
          >
            <button
              type="button"
              aria-label="More actions"
              onClick={() => setMenuOpen((prev) => !prev)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                border: 'none',
                background: menuOpen ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                color: 'rgba(244, 244, 245, 0.85)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                aria-label={listening ? 'Stop dictation' : 'Start dictation'}
                onClick={toggleDictation}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  border: 'none',
                  background: listening ? 'rgba(239, 68, 68, 0.25)' : 'transparent',
                  color: listening ? '#f87171' : 'rgba(244, 244, 245, 0.85)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
                  <path d="M12 18v3" strokeLinecap="round" />
                </svg>
              </button>

              <button
                type="button"
                aria-label="Send"
                disabled={!canSend}
                onClick={() => void sendInline()}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  border: 'none',
                  background: canSend ? '#fafafa' : 'rgba(255, 255, 255, 0.16)',
                  color: canSend ? '#09090b' : 'rgba(255, 255, 255, 0.45)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: canSend ? 'pointer' : 'default',
                  transition: 'background 120ms ease',
                }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>

          {/* Sol-style Spotlight results list */}
          {results.length > 0 ? (
            <div
              style={{
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                paddingTop: 6,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                maxHeight: 300,
                overflowY: 'auto',
              }}
            >
              {results.map((item, idx) => {
                const active = idx === selectedIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => void executeResult(item)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      padding: '7px 10px',
                      borderRadius: 10,
                      border: 'none',
                      background: active ? 'rgba(255, 255, 255, 0.11)' : 'transparent',
                      color: '#f4f4f5',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 13.5,
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.title}
                      </div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: 'rgba(244, 244, 245, 0.55)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.subtitle}
                      </div>
                    </div>
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 10.5,
                        padding: '2px 7px',
                        borderRadius: 999,
                        background: 'rgba(255, 255, 255, 0.08)',
                        color: 'rgba(244, 244, 245, 0.7)',
                        textTransform: 'uppercase',
                        letterSpacing: 0.4,
                      }}
                    >
                      {item.kind === 'ai'
                        ? 'AI'
                        : item.kind === 'app'
                          ? 'App'
                          : item.kind === 'calc'
                            ? 'Calc'
                            : item.kind === 'file'
                              ? 'File'
                              : item.kind === 'clipboard'
                                ? 'Copy'
                                : 'Run'}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* Quick action menu */}
          {menuOpen && results.length === 0 ? (
            <div
              style={{
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                paddingTop: 10,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  refreshClipboard();
                  setClipboardMode((prev) => !prev);
                  setMenuOpen(false);
                }}
                style={pillActionStyle}
              >
                Clipboard History
              </button>
              <button
                type="button"
                onClick={() => void dispatchToMainApp('chat')}
                style={pillActionStyle}
              >
                Open in Hanzo Chat ↗
              </button>
              <button
                type="button"
                onClick={() => void dispatchToMainApp('dev')}
                style={pillActionStyle}
              >
                Open in Hanzo Dev ↗
              </button>
              <button
                type="button"
                onClick={() => {
                  hideHud();
                  void invoke('open_main_window_with_path_app', { path: '/settings' });
                }}
                style={pillActionStyle}
              >
                Permissions &amp; Hotkey…
              </button>
            </div>
          ) : null}

          {/* Inline streaming reply panel */}
          {sending || reply || replyError ? (
            <div
              style={{
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                paddingTop: 10,
                maxHeight: 220,
                overflowY: 'auto',
                color: '#e4e4e7',
                fontSize: 13.5,
                lineHeight: 1.55,
                userSelect: 'text',
              }}
            >
              {replyError ? (
                <div style={{ color: '#f87171' }}>{replyError}</div>
              ) : (
                <div style={{ whiteSpace: 'pre-wrap' }}>{reply || 'Thinking…'}</div>
              )}
              {!sending && reply ? (
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => void dispatchToMainApp('chat', `${message}\n\n${reply}`.trim())}
                    style={pillActionStyle}
                  >
                    Continue in Hanzo ↗
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const pillActionStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 999,
  border: '1px solid rgba(255, 255, 255, 0.12)',
  background: 'rgba(255, 255, 255, 0.06)',
  color: '#f4f4f5',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
};
