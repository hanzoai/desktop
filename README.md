# Hanzo Desktop

The chat, as an application on your machine, and the things only a machine can
offer: a model that runs here, a secret kept in the operating system's own
store, and the local services that make both possible.

Tauri carries it. The interface is the same one the browser gets — `@hanzo/ui`
components on the `@hanzo/gui` runtime, `@hanzo/ai` for every call to a server —
so what is written below is only what the desktop adds.

## Where a model runs

Two places answer the same wire, so there is one client shape for both: the
estate at its own address under the visitor's IAM token, and the engine on this
machine under the key it was started with. A model's address is `origin/model`,
which means choosing a model chooses where it runs, and nothing downstream of
the picker knows there is more than one place.

The engine's key is not decoration. Started without one it serves any caller
that can reach the port, and that port is bound on every interface — so the
shell mints a key, starts the engine with it, and holds it. The estate and the
machine are then the same shape: an address, and a credential.

`src/data/origin.ts` is the whole of it. The machine is declared only in the
desktop, because the web build has no engine to ask and asking anyway costs a
failed request on every load.

## What the shell keeps alive

A service is a binary, its arguments, its environment, and the URL that answers
when it is serving. Three are declared in `src-tauri/src/service.rs`:

| service | what it is | answers on |
| --- | --- | --- |
| `engine` | the model that runs here | `127.0.0.1:36900` |
| `embedding` | the embedder beside it | `127.0.0.1:36901` |
| `node` | the chain node | `127.0.0.1:3690`, socket `3691`, peers `9552` |

The shell starts them, holds the handles, reports whether each answers, and
stops what it started. A second window shows that list, so what the machine is
running is visible without a chat window open, and the tray keeps the app
somewhere when no window is: show it, open that list, start a new chat, quit.

Secrets go to the operating system's store, one vault per installed app, keyed
by the bundle identifier — so two brands on one machine cannot read each
other's, and a development build cannot read a shipped one's.

## The bridge

There is no Tauri package in `package.json`, and that is deliberate. The shell
is reached through the IPC object Tauri stamps on `window` before the first
script runs, which is what lets `shell()` answer whether this is the desktop
without a request and without a dependency — the same source therefore builds
for the browser, where it simply knows the machine is not there. Every command
the app can name is registered in `src-tauri/src/main.rs`, and there are seven.

The other direction is a navigation: the shell says where the app should be by
rewriting the document's address, which is what a link does and needs nothing
from the bridge. Sign-in goes out to the system browser for the same reason —
an issuer's login screen inside an app's own webview is a credential prompt with
no address bar to check.

## Verifying

```sh
CI=true pnpm install --no-frozen-lockfile
pnpm dev            # the interface alone, in a browser, on localhost:3090
pnpm tauri dev      # the application, shell and all
pnpm typecheck
pnpm test           # 35 assertions, node --test, no framework
pnpm tauri build
```

`pnpm dev` is worth keeping in reach: everything except the machine works there,
`shell()` answers false, and the origin list is one entry long — which is also
the proof that the desktop's additions are additions and not a fork.
