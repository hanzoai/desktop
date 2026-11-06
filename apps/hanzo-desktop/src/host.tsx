import { useEffect, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { getBrand } from '@hanzo/desktop-brand-config';
import { ORG_KEY } from '@hanzo/event';
import { GuiProvider } from '@hanzo/gui';
import { IamProvider, useIam } from '@hanzo/iam/react';
import { configure, Look, Rooms, type Link, type Router } from '@hanzo/app';
import { App, type Bar } from '@hanzo/app/App';
import { useScheme } from '@hanzo/appearance';
import { openUrl } from '@tauri-apps/plugin-opener';
import { ErrorBoundary } from 'react-error-boundary';

import config from '../gui.config';
import { keychain, open as openKeychain, written } from './keychain';
import BenchmarkPage, { LSA_URL, ZEN_27B_TREE_PRESET } from './pages/benchmark';
import { Welcome } from './Welcome';
import { safeListen } from './utils/tauri-check';

// The main window is hanzo.ai's app: the same @hanzo/rooms `App` hanzo.ai draws
// at `/`, hosted here the way hanzo.ai and hanzo.team host the rooms. What is
// the desktop's own is only what a host owns: where the session lives (the OS
// keychain), how sign-in comes back (the brand's deep link), the router (the
// window's history), and links to other origins (the system browser).

const brand = getBrand();
// The site the app's links go to. A window hosts the app ITSELF, so its own
// hostname is the window (localhost, tauri.localhost), never a web address:
// reading it as one sent sign-up to a dev server that is not running. The
// marketing site's own pages are at hanzo.ai unless a build says otherwise.
const SITE = (import.meta.env.VITE_HANZO_SITE as string | undefined) ?? 'https://hanzo.ai';

// The gateway. A dev window asks its OWN origin: api.hanzo.ai does not answer
// localhost:1420's CORS preflight, and Vite forwards `/v1` to it
// (vite.config.ts). The shipped window asks the brand's gateway directly.
const API = import.meta.env.DEV ? window.location.origin : brand.cloudApi;

configure({
  site: SITE,
  home: '/home',
  signUp: `${SITE}/signup`,
  api: API,
  iam: brand.iam.baseUrl,
  brand: brand.name === 'Hanzo' ? undefined : brand.name,
  // Signed out, the rooms answer on the brand's publishable key, as the web
  // does for a guest: the free lane, never the caller's own.
  key: ORG_KEY[brand.brand],
  // The session is in the keychain, never the webview's localStorage: the rooms
  // read the token, its expiry and its claims there.
  session: keychain,
  // THE WINDOW IS THE APP, so there is no site behind it to send a guest to:
  // the rooms draw their one room (Chat's free lane) for a signed-out reader,
  // and sign-in is one control in the app rather than a wall in front of it.
  // Patched into @hanzo/app (patches/@hanzo__app@0.2.63.patch, Orgs.js).
  guest: true,
} as Parameters<typeof configure>[0]);

// THE WINDOW'S BAR IS THE APP'S. There is no browser around this window, so
// the app draws the bar a browser would: the sidebar toggle, Back and Forward
// through the router below. macOS paints its traffic lights over the page's
// top-left corner (tauri.conf.json: titleBarStyle Overlay), so the bar keeps
// 78px clear there; Windows and Linux keep their native title bar above the
// page and need none. The bar drags the window.
const BAR: Bar = {
  inset: /Mac/.test(navigator.userAgent) ? 78 : 0,
  drag: { 'data-tauri-drag-region': true },
};

const IAM = {
  serverUrl: API,
  proxyBaseUrl: API,
  clientId: brand.iam.clientId,
  redirectUri: brand.iam.redirectUri,
  organization: brand.iam.clientId.split('-')[0],
  storage: keychain,
};

// THE ROUTER IS HISTORY. The rooms move the app with `history.pushState`
// (lib/host `go`), so the window re-renders on every push and replace as well
// as on popstate. A push to another origin cannot happen in a webview; it opens
// in the browser instead.
const MOVED = 'hanzo:moved';
for (const name of ['pushState', 'replaceState'] as const) {
  const original = window.history[name].bind(window.history);
  window.history[name] = (...args: Parameters<History['pushState']>) => {
    original(...args);
    window.dispatchEvent(new Event(MOVED));
  };
}

function subscribe(changed: () => void): () => void {
  window.addEventListener('popstate', changed);
  window.addEventListener(MOVED, changed);
  return () => {
    window.removeEventListener('popstate', changed);
    window.removeEventListener(MOVED, changed);
  };
}

const address = () => `${window.location.pathname}${window.location.search}`;

/** An address on another origin, or null for one of this window's. */
function away(href: string): string | null {
  try {
    const url = new URL(href, window.location.href);
    return url.origin === window.location.origin ? null : url.href;
  } catch {
    return null;
  }
}

function move(href: string, replace = false): void {
  const out = away(href);
  if (out) void openUrl(out);
  else if (replace) window.history.replaceState(null, '', href);
  else window.history.pushState(null, '', href);
}

const router: Router = {
  push: (href) => move(href),
  replace: (href) => move(href, true),
  back: () => window.history.back(),
  forward: () => window.history.forward(),
};

const Anchor: Link = ({ href, prefetch: _prefetch, onClick, ...rest }) => (
  <a
    {...rest}
    href={href}
    onClick={(e: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e);
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      router.push(href);
    }}
  />
);

/** Any link to another origin opens in the system browser, whoever drew it. */
function outward(e: globalThis.MouseEvent): void {
  const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!a || e.defaultPrevented) return;
  const out = away(a.getAttribute('href') ?? '');
  if (!out) return;
  e.preventDefault();
  void openUrl(out);
}

// The rooms send a signed-out visitor who asks to sign in to /login (or /signup)
// on the host's own origin: here that is this window, so those two addresses
// draw the desktop's sign-in rather than a page of the app.
const DOORS = new Set(['/login', '/signup']);

// A visitor who chose "Not now" opens the app signed out from then on, as the
// web does for a guest; signing in is one click away in the app itself.
const GUEST = 'hanzo:guest';

function guest(): boolean {
  try {
    const isGuest =
      new URLSearchParams(window.location.search).get('guest') === '1' ||
      window.localStorage.getItem(GUEST) === '1';
    if (isGuest) {
      window.sessionStorage.setItem('hanzo.anon.try', '1');
      (window as any).__hanzoAnonChat = true;
    }
    return isGuest;
  } catch {
    return false;
  }
}

function stayGuest(): void {
  try {
    window.localStorage.setItem(GUEST, '1');
    window.sessionStorage.setItem('hanzo.anon.try', '1');
    (window as any).__hanzoAnonChat = true;
  } catch {
    // The choice is a convenience: without storage the next launch asks again.
  }
}

/** Where a sign-in started from /login?next= goes on to, on this origin only. */
function onward(): string {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/chat';
}

/**
 * Sign-in in the system browser, on the brand site's own page when it has one
 * (hanzo.ai/login), which finishes this app's authorize request; the code comes
 * back on the brand's deep link.
 */
async function signIn(sdk: ReturnType<typeof useIam>['sdk']): Promise<void> {
  const issuer = new URL(await sdk.getSigninUrl());
  const url = brand.iam.page ? `${brand.iam.page}${issuer.search}` : issuer.href;
  await new Promise<void>((resolve, reject) => {
    void safeListen<{ state: string; code: string }>(brand.iam.callbackEvent, (event) => {
      const back = new URL(brand.iam.redirectUri);
      back.searchParams.set('code', event.payload.code);
      back.searchParams.set('state', event.payload.state);
      sdk
        .handleCallback(back.href)
        .then(() => written())
        .then(() => resolve(), reject);
    }).then(() => openUrl(url), reject);
  });
  window.location.replace(onward());
}

function LoadingScreen({ message = 'Loading Hanzo…' }: { message?: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      width: '100vw',
      backgroundColor: '#050505',
      color: '#f5f5f5',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <div style={{
        width: '38px',
        height: '38px',
        border: '3px solid rgba(255,255,255,0.12)',
        borderTopColor: '#ffffff',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }} />
      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      <div style={{ marginTop: '16px', fontSize: '14px', fontWeight: 500, letterSpacing: '-0.2px', opacity: 0.88 }}>
        {message}
      </div>
    </div>
  );
}

const LOCAL_ENGINE_URL = 'http://localhost:36900';
const LOCAL_CONVERSATIONS_KEY = 'hanzo:local:conversations';

type StoredLocalConversation = {
  id: string;
  title: string;
  pinned?: boolean;
  archived?: boolean;
  updatedAt: string;
  createdAt: string;
  messages: Array<{ role: string; content: string }>;
};

function readLocalConversations(): StoredLocalConversation[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_CONVERSATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalConversations(items: StoredLocalConversation[]): void {
  try {
    window.localStorage.setItem(LOCAL_CONVERSATIONS_KEY, JSON.stringify(items));
  } catch {
    // ignore storage errors
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Install local-first fetch bridge for unauthenticated / guest desktop sessions
// so "Continue without login · Local AI" works with zero "Failed to fetch" errors
// and routes chat completions to the embedded local Hanzo Engine (:36900).
if (typeof window !== 'undefined' && !(window as any).__HANZO_LOCAL_FETCH_INSTALLED__) {
  (window as any).__HANZO_LOCAL_FETCH_INSTALLED__ = true;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    let parsed: URL | null = null;
    try {
      parsed = new URL(rawUrl, window.location.origin);
    } catch {
      parsed = null;
    }

    const isCloudApi =
      parsed &&
      (parsed.origin === brand.cloudApi ||
        parsed.hostname === 'api.hanzo.ai' ||
        parsed.hostname === 'api-dev.hanzo.ai');

    const hasToken = Boolean(keychain.getItem('hanzo_iam_access_token'));

    if (isCloudApi && parsed) {
      const path = parsed.pathname;
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();

      // 1. Local AI chat completions when continuing without login
      if (!hasToken && (path === '/v1/chat/public' || path === '/v1/chat/completions') && method === 'POST') {
        try {
          const bodyText = typeof init?.body === 'string' ? init.body : '{}';
          const payload = JSON.parse(bodyText);
          const localPayload = {
            ...payload,
            model: 'default',
          };
          return await nativeFetch(`${LOCAL_ENGINE_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(localPayload),
            signal: init?.signal,
          });
        } catch (err) {
          return jsonResponse(
            {
              error: {
                message:
                  err instanceof Error
                    ? `Local Hanzo Engine error: ${err.message}`
                    : 'Local Hanzo Engine unavailable on port 36900.',
              },
            },
            503,
          );
        }
      }

      // 2. Local model catalog when continuing without login
      if (!hasToken && path === '/v1/models' && method === 'GET') {
        return jsonResponse({
          object: 'list',
          data: [
            {
              id: 'enso-free',
              name: 'Zen 6 Local (D-LSA · CUDA)',
              object: 'model',
              created: 1793775303,
              owned_by: 'hanzo-local',
            },
            {
              id: 'zen-free',
              name: 'Zen 6 Local (D-LSA · CUDA)',
              object: 'model',
              created: 1793775303,
              owned_by: 'hanzo-local',
            },
            {
              id: 'default',
              name: 'Zen 6 Local (D-LSA · CUDA)',
              object: 'model',
              created: 1793775303,
              owned_by: 'hanzo-local',
            },
          ],
        });
      }

      // 3. Local conversation history store when continuing without login
      if (!hasToken && path.startsWith('/v1/agents/chat/conversations')) {
        const list = readLocalConversations();
        const subId = path.slice('/v1/agents/chat/conversations'.length).replace(/^\/+/, '');

        if (!subId && method === 'GET') {
          const wantArchived = parsed.searchParams.get('archived') === 'true';
          const filtered = list.filter((c) => Boolean(c.archived) === wantArchived);
          return jsonResponse({ conversations: filtered });
        }

        if (!subId && method === 'POST') {
          const bodyText = typeof init?.body === 'string' ? init.body : '{}';
          const payload = JSON.parse(bodyText || '{}');
          const incomingMessages = Array.isArray(payload.messages) ? payload.messages : [];
          const now = new Date().toISOString();
          const id = payload.conversationId || `local-${Date.now()}`;
          const existingIdx = list.findIndex((c) => c.id === id);
          if (existingIdx >= 0) {
            list[existingIdx] = {
              ...list[existingIdx],
              updatedAt: now,
              messages: [...list[existingIdx].messages, ...incomingMessages],
            };
          } else {
            const firstUser = incomingMessages.find((m: any) => m.role === 'user')?.content || 'Local AI Chat';
            const title = typeof firstUser === 'string' ? firstUser.slice(0, 60) : 'Local AI Chat';
            list.unshift({
              id,
              title,
              pinned: false,
              archived: false,
              createdAt: now,
              updatedAt: now,
              messages: incomingMessages,
            });
          }
          writeLocalConversations(list);
          return jsonResponse({ conversationId: id });
        }

        if (subId && method === 'GET') {
          const found = list.find((c) => c.id === decodeURIComponent(subId));
          return jsonResponse(found ?? { id: subId, messages: [] });
        }

        if (subId && method === 'PATCH') {
          const bodyText = typeof init?.body === 'string' ? init.body : '{}';
          const patch = JSON.parse(bodyText || '{}');
          const idx = list.findIndex((c) => c.id === decodeURIComponent(subId));
          if (idx >= 0) {
            list[idx] = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
            writeLocalConversations(list);
            return jsonResponse(list[idx]);
          }
          return jsonResponse({}, 404);
        }

        if (subId && method === 'DELETE') {
          const next = list.filter((c) => c.id !== decodeURIComponent(subId));
          writeLocalConversations(next);
          return jsonResponse({ ok: true });
        }
      }

      // 4. Cloud-only account/org endpoints when continuing without login
      if (!hasToken) {
        if (path === '/v1/agent/sessions/stream' || path === '/v1/agents/sessions/stream') {
          // A guest has no runs to hear about, so the stream stays open and quiet
          // until its reader aborts, as the real one does. A body that ended at
          // once was reopened twice a second, each time refetching the run list.
          const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
          const quiet = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(': local-mode\n\n'));
              signal?.addEventListener('abort', () => controller.error(signal.reason), { once: true });
            },
          });
          return new Response(quiet, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          });
        }
        if (path === '/v1/agent/sessions' || path === '/v1/agents/sessions') {
          return jsonResponse({ sessions: [] });
        }
        if (path === '/v1/agents') {
          return jsonResponse({ agents: [] });
        }
        if (path === '/v1/project') {
          return jsonResponse([]);
        }
        if (path === '/v1/pref' || path === '/v1/preferences') {
          return jsonResponse({});
        }
        if (path === '/v1/agents/targets') {
          return jsonResponse({ targets: [] });
        }
      }
    }

    try {
      return await nativeFetch(input, init);
    } catch (err) {
      // Graceful fallback if cloud endpoint is unreachable in desktop webview
      if (isCloudApi && parsed) {
        const path = parsed.pathname;
        if (path.startsWith('/v1/agents/chat/conversations')) {
          return jsonResponse({ conversations: readLocalConversations() });
        }
        if (path === '/v1/agent/sessions' || path === '/v1/agents/sessions') {
          return jsonResponse({ sessions: [] });
        }
        if (path === '/v1/agents') {
          return jsonResponse({ agents: [] });
        }
        if (path === '/v1/project') {
          return jsonResponse([]);
        }
        if (path === '/v1/pref' || path === '/v1/preferences') {
          return jsonResponse({});
        }
      }
      throw err;
    }
  };
}

if (typeof window !== 'undefined') {
  (window as any).__HANZO_BENCHMARK_COMPONENT__ = BenchmarkPage;
}

function Gate() {
  const { isLoading: iamLoading, isAuthenticated, sdk } = useIam();
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const here = useSyncExternalStore(subscribe, address);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const [visiting, setVisiting] = useState(guest);

  useEffect(() => {
    const timer = setTimeout(() => setLoadingTimedOut(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  // Ensure LSA is armed by default on the embedded engine
  useEffect(() => {
    fetch(LSA_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then(async (s) => {
        if (s && !s.enabled) {
          await fetch(LSA_URL, {
            body: JSON.stringify({ ...ZEN_27B_TREE_PRESET, min_seq_len: 1024, top_k: 512, top_p: 128 }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
          });
        }
      })
      .catch(() => {});
  }, []);

  const isLoading = iamLoading && !loadingTimedOut;
  // A bundled window starts on its own index (windows/mod.rs `main_url`); that
  // is the app's front door, not an address of its own.
  const raw = here.split('?')[0] || '/';
  const path = raw === '/' || raw === '/index.html' ? '/chat' : raw;
  const isBenchOrSettings = path === '/benchmark' || path === '/lsa' || path === '/settings' || path.startsWith('/settings/');

  if (isLoading && !isBenchOrSettings) return <LoadingScreen message="Loading Hanzo AI…" />;
  if (!isAuthenticated && !isBenchOrSettings && (DOORS.has(path) || !visiting)) {
    return (
      <Welcome
        busy={busy}
        error={error}
        onSignIn={() => {
          setBusy(true);
          setError(null);
          signIn(sdk).catch((err: unknown) => {
            setBusy(false);
            setError(err instanceof Error ? err : new Error(String(err)));
          });
        }}
        onSkip={() => {
          stayGuest();
          setBusy(false);
          setVisiting(true);
          window.history.replaceState(null, '', DOORS.has(path) || path === '/' ? onward() : here);
        }}
        onBenchmark={() => {
          stayGuest();
          setBusy(false);
          setVisiting(true);
          window.history.replaceState(null, '', '/benchmark');
        }}
      />
    );
  }
  if (isAuthenticated && DOORS.has(path)) {
    window.history.replaceState(null, '', onward());
    return null;
  }
  if (path === '/benchmark' || path === '/lsa') {
    return <BenchmarkPage />;
  }

  return (
    <Rooms router={router} path={path} route={path} Link={Anchor}>
      <App bar={BAR} />
    </Rooms>
  );
}

function Crash({ error }: { error: unknown }) {
  const text = error instanceof Error ? `${error.name}: ${error.message}\n\n${error.stack ?? ''}` : String(error);
  return (
    <div
      role="alert"
      style={{
        height: '100vh',
        width: '100vw',
        overflow: 'auto',
        padding: '48px 40px',
        background: '#0a0a0a',
        color: '#f5f5f5',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 12,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      <div style={{ color: '#ff6b6b', fontWeight: 600, marginBottom: 12 }}>
        Hanzo could not start
      </div>
      {text}
    </div>
  );
}

export function Host() {
  const rawScheme = useScheme();
  const [ready, setReady] = useState(false);

  // Default to dark theme unless the user explicitly chose light in appearance preferences
  const scheme = (() => {
    try {
      const saved = localStorage.getItem('hanzo.appearance');
      if (saved && saved.includes('"light"')) return 'light';
    } catch {}
    return rawScheme || 'dark';
  })();

  useEffect(() => {
    if (scheme === 'dark') {
      document.documentElement.classList.remove('light', 't_light');
      document.documentElement.classList.add('dark', 't_dark');
    }
  }, [scheme]);

  useEffect(() => {
    const fallback = setTimeout(() => setReady(true), 1200);
    void openKeychain()
      .then(() => {
        clearTimeout(fallback);
        setReady(true);
      })
      .catch(() => {
        clearTimeout(fallback);
        setReady(true);
      });
    document.addEventListener('click', outward, true);
    return () => {
      clearTimeout(fallback);
      document.removeEventListener('click', outward, true);
    };
  }, []);

  if (!ready) return <LoadingScreen message="Starting Hanzo Desktop…" />;
  return (
    <GuiProvider config={config} defaultTheme={scheme}>
      <IamProvider config={IAM}>
        <Look />
        <ErrorBoundary fallbackRender={({ error }) => <Crash error={error} />}>
          <Gate />
        </ErrorBoundary>
      </IamProvider>
    </GuiProvider>
  );
}
