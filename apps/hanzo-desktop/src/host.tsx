import { useEffect, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { getBrand } from '@hanzo/desktop-brand-config';
import { ORG_KEY } from '@hanzo/event';
import { GuiProvider } from '@hanzo/gui';
import { IamProvider, useIam } from '@hanzo/iam/react';
import { configure, Look, Rooms, type Link, type Router } from '@hanzo/rooms';
import { App, type Bar } from '@hanzo/rooms/App';
import { useScheme } from '@hanzo/appearance';
import { openUrl } from '@tauri-apps/plugin-opener';

import config from '../gui.config';
import { keychain, open as openKeychain, written } from './keychain';
import { Welcome } from './Welcome';
import { safeListen } from './utils/tauri-check';

// The main window is hanzo.ai's app: the same @hanzo/rooms `App` hanzo.ai draws
// at `/`, hosted here the way hanzo.ai and hanzo.team host the rooms. What is
// the desktop's own is only what a host owns: where the session lives (the OS
// keychain), how sign-in comes back (the brand's deep link), the router (the
// window's history), and links to other origins (the system browser).

const brand = getBrand();
const SITE = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3000'
  : 'https://hanzo.ai';

configure({
  site: SITE,
  home: '/home',
  signUp: `${SITE}/signup`,
  api: brand.cloudApi,
  iam: brand.iam.baseUrl,
  brand: brand.name === 'Hanzo' ? undefined : brand.name,
  // Signed out, the rooms answer on the brand's publishable key, as the web
  // does for a guest: the free lane, never the caller's own.
  key: ORG_KEY[brand.brand],
  // The session is in the keychain, never the webview's localStorage: the rooms
  // read the token, its expiry and its claims there.
  session: keychain,
});

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
  serverUrl: brand.cloudApi,
  proxyBaseUrl: brand.cloudApi,
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
    return window.localStorage.getItem(GUEST) === '1';
  } catch {
    return false;
  }
}

function stayGuest(): void {
  try {
    window.localStorage.setItem(GUEST, '1');
  } catch {
    // The choice is a convenience: without storage the next launch asks again.
  }
}

/** Where a sign-in started from /login?next= goes on to, on this origin only. */
function onward(): string {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
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

  const isLoading = iamLoading && !loadingTimedOut;

  if (isLoading) return <LoadingScreen message="Loading Hanzo AI…" />;
  const path = here.split('?')[0] || '/';
  if (!isAuthenticated && (DOORS.has(path) || !visiting)) {
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
          if (DOORS.has(path)) window.history.replaceState(null, '', onward());
        }}
      />
    );
  }
  if (isAuthenticated && DOORS.has(path)) {
    window.history.replaceState(null, '', onward());
    return null;
  }

  return (
    <Rooms router={router} path={path} route={path} Link={Anchor}>
      <App bar={BAR} />
    </Rooms>
  );
}

export function Host() {
  const scheme = useScheme();
  const [ready, setReady] = useState(false);

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
        <Gate />
      </IamProvider>
    </GuiProvider>
  );
}
