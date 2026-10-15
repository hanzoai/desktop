import { useEffect, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { getBrand } from '@hanzo/desktop-brand-config';
import { GuiProvider } from '@hanzo/gui';
import { IamProvider, useIam } from '@hanzo/iam/react';
import { configure, Look, Rooms, type Link, type Router } from '@hanzo/rooms';
import { App } from '@hanzo/rooms/App';
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
const SITE = 'https://hanzo.ai';

configure({
  site: SITE,
  home: '/home',
  signUp: `${SITE}/signup`,
  api: brand.cloudApi,
  iam: brand.iam.baseUrl,
  brand: brand.name === 'Hanzo' ? undefined : brand.name,
});

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

/** Sign-in in the system browser; the code comes back on the brand's deep link. */
async function signIn(sdk: ReturnType<typeof useIam>['sdk']): Promise<void> {
  const url = await sdk.getSigninUrl();
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
  window.location.replace('/');
}

function Gate() {
  const { isLoading, isAuthenticated, sdk } = useIam();
  const here = useSyncExternalStore(subscribe, address);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);

  if (isLoading) return null;
  if (!isAuthenticated) {
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
      />
    );
  }

  const path = here.split('?')[0] || '/';
  return (
    <Rooms router={router} path={path} route={path} Link={Anchor}>
      <App />
    </Rooms>
  );
}

export function Host() {
  const scheme = useScheme();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void openKeychain().then(() => setReady(true));
    document.addEventListener('click', outward, true);
    return () => document.removeEventListener('click', outward, true);
  }, []);

  if (!ready) return null;
  return (
    <GuiProvider config={config} defaultTheme={scheme}>
      <IamProvider config={IAM}>
        <Look />
        <Gate />
      </IamProvider>
    </GuiProvider>
  );
}
