import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { getBrand } from '@hanzo/desktop-brand-config';
import { ORG_KEY } from '@hanzo/event';
import { GuiProvider, XStack } from '@hanzo/gui';
import { IamProvider, useIam } from '@hanzo/iam/react';
import { configure, Look, Rooms, type Link, type Router } from '@hanzo/app';
import { App, type Titlebar } from '@hanzo/app/App';
import { empty } from '@hanzo/app/open';
import { useScheme } from '@hanzo/appearance';
import { Button, Text } from '@hanzo/ui';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { ErrorBoundary } from 'react-error-boundary';

import config from '../gui.config';
import { Crash } from './crash';
import { DesktopSettings, windowKey } from './desktop-shortcuts';
import { adopt, share } from './identity';
import { keychain } from './keychain';
import {
  buildLocalModelsCatalogResponse,
  handleLocalChatCompletion,
  LocalAiManager,
  openLocalAiManager,
} from './local-ai';
import { Update } from './update';
import { Welcome } from './Welcome';
import { awaitCallback, type Callback, finishAttempt, SignInCancelled } from './lib/sign-in-attempt';
import { safeInvoke, safeListen } from './utils/tauri-check';

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
  // Dev's runtime is the Dev server on this computer (src-tauri local_dev.rs): the address it
  // published, and a one-time pairing credential its CLI issues for each session.
  runtime: async () => {
    const here = await invoke<{ id: string; origin: string } | null>('dev_local_runtime');
    return here
      ? {
          kind: 'machine',
          id: here.id,
          label: 'This computer',
          zap: here.origin,
          token: () => invoke<string>('dev_local_pairing'),
        }
      : null;
  },
});

// A release window has no native context menu: Hanzo's own (the app's row menu) is the only one.
// Text fields keep cut, copy and paste; Inspect Element is a dev build's alone.
if (!import.meta.env.DEV) {
  window.addEventListener(
    'contextmenu',
    (event) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('input, textarea, [contenteditable=""], [contenteditable="true"]')) event.preventDefault();
    },
    true,
  );
}

// THE WINDOW IS THE APP, so there is no site behind it to send a guest to: a
// signed-out reader who chose "Not now" gets Chat, answered by the local engine
// (the fetch bridge below), and sign-in is one control in the app rather than a
// wall in front of it. @hanzo/app's Gate lets a reader without a session into
// Chat when `__hanzoAnonChat` is set (`guest()`, `stayGuest()`) and the address
// is /chat. A bundled window opens on its own index (windows/mod.rs `main_url`),
// which is the app's front door, so that address is named for what it is.
if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
  window.history.replaceState(null, '', `/chat${window.location.search}${window.location.hash}`);
}

/** The bar's own control: the local models and node (local-ai.tsx), from any page. */
function LocalAi() {
  return (
    <Button
      size="xs"
      variant="outline"
      data-slot="header-local-ai"
      aria-label="Local AI & Node"
      height={24}
      px="$2.5"
      rounded="$3"
      onPress={() => openLocalAiManager('models')}
    >
      <Text fontSize="$1" fontWeight="600" color="$ink">
        Local AI
      </Text>
    </Button>
  );
}

// THE WINDOW'S BAR IS THE APP'S. There is no browser around this window, so
// the app draws the bar a browser would: the sidebar toggle, Back and Forward
// through the router below. macOS paints its traffic lights over the page's
// top-left corner (tauri.conf.json: titleBarStyle Overlay), so the bar keeps
// 78px clear there; Windows and Linux keep their native title bar above the
// page and need none. The bar drags the window. Its controls are the window's:
// Local AI, in place of the minimise, maximise and close a frameless window
// would draw, which the native title bar already has, and, when there is a newer
// version, the one quiet line that installs it (update.tsx).
const MAC = /Mac/.test(navigator.userAgent);
// The focused pages (Gate's sheets: organization, plan) carry their own header,
// whose wordmark starts at the page's gutter, under the traffic lights (app.css).
if (MAC) document.documentElement.dataset.mac = '';

const BAR: Titlebar = {
  inset: MAC ? 78 : 0,
  drag: { 'data-tauri-drag-region': true },
  controls: (
    <XStack items="center" gap="$2">
      <Update />
      <LocalAi />
    </XStack>
  ),
};

/** The composer's microphone, on whatever page draws it. */
const findMic = () => document.querySelector('button[data-state][aria-pressed]') as HTMLButtonElement | null;

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
//
// The app's own addresses this window has no page for (organization, billing,
// usage, keys, pricing) are hanzo.ai's: they open there, in the system browser, and the
// window stays where it was. One rule here, where every move passes: the router
// below and the rooms' own `go` alike.
const WEB = /^\/(billing|usage|keys|pricing)(\/|$)|^\/settings\/organization(\/|$)/;

/** The hanzo.ai page an address of this window's names, or null for one the window draws. */
export function onTheWeb(href: string): string | null {
  try {
    const url = new URL(href, window.location.href);
    return url.origin === window.location.origin && WEB.test(url.pathname) ? `${SITE}${url.pathname}${url.search}` : null;
  } catch {
    return null;
  }
}

const MOVED = 'hanzo:moved';
for (const name of ['pushState', 'replaceState'] as const) {
  const original = window.history[name].bind(window.history);
  window.history[name] = (...args: Parameters<History['pushState']>) => {
    const out = args[2] == null ? null : onTheWeb(String(args[2]));
    if (out) {
      void openUrl(out);
      return;
    }
    original(...args);
    window.dispatchEvent(new Event(MOVED));
  };
}

// A page load onto one of them (the guest Rail's "See plans and pricing" is
// `location.assign('/pricing')`, not a push) takes the same rule: it opens there,
// and the window shows Chat rather than an address it has no page for.
{
  const out = onTheWeb(window.location.href);
  if (out) {
    void openUrl(out);
    window.history.replaceState(null, '', '/chat');
  }
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

/** A signed-in window is nobody's guest: an old build's flag must not outlive a sign-in. */
function forgetGuest(): void {
  try {
    window.localStorage.removeItem(GUEST);
    window.sessionStorage.removeItem('hanzo.anon.try');
    (window as any).__hanzoAnonChat = false;
  } catch {
    // Without storage there is no flag to clear.
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

/** How long the loopback port waits for the browser: `PATIENCE` in loopback.rs. */
const SIGN_IN_WINDOW = 15 * 60 * 1000;

/**
 * Sign-in in the system browser, as the Hanzo CLI signs in: a loopback port the
 * system picks for this attempt is the redirect (RFC 8252 §7.3), and the page
 * the browser opens is the brand's own (hanzo.ai/login), which finishes this
 * app's authorize request. PKCE's verifier and the state stay in this window's
 * storage, where the callback is read.
 *
 * `signal` is the Welcome screen's Cancel; `ready` hands it "Open the sign-in
 * page again" once the page has been opened. The wait itself (the callback that
 * matches this attempt's state, the deadline, Cancel) is sign-in-attempt.ts.
 */
async function signIn(
  sdk: ReturnType<typeof useIam>['sdk'],
  { signal, ready }: { signal: AbortSignal; ready?: (reopen: () => void) => void },
): Promise<void> {
  // The browser's hand-back is emitted as the event this brand's window listens on.
  const port = await invoke<number>('iam_loopback', { event: brand.iam.callbackEvent });
  if (signal.aborted) throw new SignInCancelled();
  const redirect = `http://127.0.0.1:${port}/callback`;
  // The SDK sends the redirect its configuration names at the code exchange, so
  // it names this attempt's before the authorize request is built.
  (sdk as unknown as { config: { redirectUri: string } }).config.redirectUri = redirect;
  const issuer = new URL(await sdk.getSigninUrl());
  const url = brand.iam.page ? `${brand.iam.page}${issuer.search}` : issuer.href;
  const open = () => openUrl(url);
  const back = await awaitCallback({
    state: issuer.searchParams.get('state') ?? '',
    listen: (on) => safeListen<Callback>(brand.iam.callbackEvent, (event) => on(event.payload)),
    open: async () => {
      await open();
      ready?.(() => void open().catch(() => undefined));
    },
    windowMs: SIGN_IN_WINDOW,
    signal,
  });
  // The browser came back with this attempt's state: the exchange decides now.
  const callback = new URL(redirect);
  callback.searchParams.set('code', back.code);
  callback.searchParams.set('state', back.state);
  await finishAttempt(signal, {
    exchange: () => sdk.handleCallback(callback.href),
    forget: () => sdk.clearTokens(),
    then: [share, () => window.location.replace(onward())],
  });
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
// and routes chat completions to Hanzo's engine on this computer (local-ai.tsx).
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
        parsed.hostname === 'api-dev.hanzo.ai' ||
        (parsed.origin === window.location.origin && parsed.pathname.startsWith('/v1/')));

    const hasToken = Boolean(keychain.getItem('hanzo_iam_access_token'));

    if (isCloudApi && parsed) {
      const path = parsed.pathname;
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();

      // 1. Local AI chat completions when continuing without login
      if (!hasToken && (path === '/v1/chat/public' || path === '/v1/chat/completions') && method === 'POST') {
        return await handleLocalChatCompletion(nativeFetch, init);
      }

      // 2. Local model catalog when continuing without login
      if (!hasToken && path === '/v1/models' && method === 'GET') {
        const catalog = await buildLocalModelsCatalogResponse();
        return jsonResponse(catalog);
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

    // Signed in, every call is the cloud's, and offline it fails as itself: the
    // app says so with its own Try again. Nothing here stands in for the account.
    return nativeFetch(input, init);
  };
}

function Gate() {
  const { isLoading: iamLoading, isAuthenticated, sdk } = useIam();
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const here = useSyncExternalStore(subscribe, address);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const [visiting, setVisiting] = useState(guest);
  // The attempt in progress, so Cancel can stop it and a new press can replace
  // it; and "Open the sign-in page again", once its page has been opened.
  const attempt = useRef<AbortController | null>(null);
  const [reopen, setReopen] = useState<(() => void) | null>(null);

  const startSignIn = () => {
    attempt.current?.abort();
    const ctrl = new AbortController();
    attempt.current = ctrl;
    setBusy(true);
    setError(null);
    setReopen(null);
    signIn(sdk, {
      signal: ctrl.signal,
      ready: (again) => {
        if (attempt.current === ctrl) setReopen(() => again);
      },
    }).catch((err: unknown) => {
      // A cancelled or replaced attempt has already handed the screen back.
      if (attempt.current !== ctrl) return;
      attempt.current = null;
      setBusy(false);
      setReopen(null);
      if (!(err instanceof SignInCancelled)) setError(err instanceof Error ? err : new Error(String(err)));
    });
  };
  const cancelSignIn = () => {
    const ctrl = attempt.current;
    attempt.current = null;
    ctrl?.abort();
    setBusy(false);
    setReopen(null);
  };

  useEffect(() => {
    const timer = setTimeout(() => setLoadingTimedOut(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  // Signed out, opening Chat from outside Welcome is the same as "Not now" (a
  // guest). Signed in it changes nothing: a guest flag set then would make the
  // person a guest after a later sign-out without their choosing it.
  // While sign-in is still being read, nobody is known to be signed out yet.
  const signedIn = useRef(isAuthenticated);
  signedIn.current = isAuthenticated;
  const reading = useRef(iamLoading);
  reading.current = iamLoading;
  const visit = () => {
    if (signedIn.current || reading.current) return;
    stayGuest();
    setVisiting(true);
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    forgetGuest();
    setVisiting(false);
  }, [isAuthenticated]);

  // A new chat, from the global ⇧⌘I or the window's ⌘N: the composer, empty and focused.
  const startChat = () => {
    visit();
    empty();
    window.history.pushState(null, '', '/chat');
    requestAnimationFrame(() => {
      const field = document.querySelector('[data-slot="composer-field"], textarea') as HTMLElement | null;
      field?.focus?.();
    });
  };
  const started = useRef(startChat);
  started.current = startChat;

  // The window's own keys (desktop-shortcuts `windowKey`): ⌘N and ⌘⇧M.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const act = windowKey(e);
      if (act === 'new-chat') {
        e.preventDefault();
        started.current();
      } else if (act === 'voice') {
        const mic = findMic();
        if (!mic || mic.disabled) return;
        e.preventDefault();
        mic.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The system-wide ⇧⌘I (src-tauri global_shortcuts) arrives as 'create-chat'.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void safeListen('create-chat', () => started.current()).then((fn) => {
      unlisten = fn ?? undefined;
    });
    return () => unlisten?.();
  }, []);

  const isLoading = iamLoading && !loadingTimedOut;
  // A bundled window starts on its own index (windows/mod.rs `main_url`); that
  // is the app's front door, not an address of its own.
  const raw = here.split('?')[0] || '/';
  const path = raw === '/' || raw === '/index.html' ? '/chat' : raw;
  const isSettings = path === '/settings' || path.startsWith('/settings/');

  if (isLoading && !isSettings) return <LoadingScreen message="Loading Hanzo AI…" />;
  if (!isAuthenticated && !isSettings && (DOORS.has(path) || !visiting)) {
    return (
      <Welcome
        busy={busy}
        error={error}
        onSignIn={startSignIn}
        onCancel={cancelSignIn}
        onReopen={reopen ?? undefined}
        onSkip={() => {
          cancelSignIn();
          stayGuest();
          setVisiting(true);
          window.history.replaceState(null, '', DOORS.has(path) || path === '/' ? onward() : here);
        }}
      />
    );
  }
  if (isAuthenticated && DOORS.has(path)) {
    window.history.replaceState(null, '', onward());
    return null;
  }
  if (isSettings) {
    return (
      <DesktopSettings
        isAuthenticated={isAuthenticated}
        siteUrl={SITE}
        barInset={BAR.inset ?? 0}
        onSignIn={() => {
          // Signing in is the Welcome screen's job: it shows the attempt and its Cancel.
          window.history.pushState(null, '', '/login?next=/settings');
          startSignIn();
        }}
        onBack={() => {
          visit();
          window.history.pushState(null, '', '/chat');
        }}
      />
    );
  }

  return (
    <Rooms router={router} path={path} route={path} Link={Anchor}>
      <App bar={BAR} />
    </Rooms>
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
    void adopt()
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
          <LocalAiManager />
        </ErrorBoundary>
      </IamProvider>
    </GuiProvider>
  );
}
