# desktop2

Hanzo Desktop, rebuilt. Replaces `~/work/hanzo/desktop`, which is a fork of
Shinkai's Tauri app (`dcSpark/shinkai-local-ai-agents`) — that lineage is being
dropped, not ported. Seeded from `~/work/hanzo/chat2` with its history, so the
web client and the desktop are one source with two shells.

Vite 8 + React 19, entry `index.html` → `src/main.tsx`, presented through
`@hanzo/ui` on `@hanzo/gui`. No CSS pipeline, no tailwind, shadcn, radix or
base-ui, and no `cn()` — a hard rule inherited from chat2 and still true.

`pnpm build` is the web target. `src-tauri/` wraps that same `dist` for the
desktop; there is no second frontend and no workspace to keep in step.

## The one idea this repo adds to chat2

**An origin is a place that answers `/v1/models` and `/v1/chat/completions`.**
There are two — the estate at `api.hanzo.ai` under the visitor's IAM token, and
the engine on this machine — and they speak the SAME wire. Measured:

    POST 127.0.0.1:36900/v1/chat/completions
      {"model":"zenlm/zen-eco-4b-agent-gguf","messages":[…]}
    -> {"choices":[{"message":{"content":"Greetings!",…

So the desktop does NOT need hanzo-node's job protocol (`create_job` →
`job_message` → a WebSocket carrying `Stream` frames), which is what the old
desktop spoke. No pairing, no `api_v2_key`, no keychain that can lock the app
out of a node it spawned itself.

### Two node binaries, opposite route prefixes

This is the trap that reads as "the node is broken". The same handlers are
mounted under DIFFERENT prefixes by two builds, so a client that works against
one 404s against the other, health check included.

`hanzod` built from `~/work/hanzo/node` mounts them under `/v1/node`
(`node_api_router.rs:156`). Measured, with a bogus path as the control so the
404s mean something:

    :9450/v1/node/health_check   200
    :9450/v2/health_check        404
    :9450/bogus-control-xyz      404

The prebuilt `hanzo-node` the old desktop bundles is the mirror image: `/v2`
answers and `/v1/node` 404s. So the old desktop's `src/hanzo/node.ts`, its
CLAUDE.md, and `libs/hanzo-message-ts` are each correct about one binary and
wrong about the other — and which one you have is decided by whether the app
bundled it or you built it.

Nothing here depends on that, because chat goes to the engine's OpenAI surface.
The prefix only matters to the shell's health probe, which is why that lives in
`src-tauri/src/service.rs` next to the thing it starts.

A model's address is **`origin/model`**. Choosing a model chooses where it runs;
`compose/stream.ts` splits the address once and asks that origin's client.
Nothing else in the app knows there is more than one place.

    src/data/origin.ts    the table, and the client per origin. Start here.
    src/data/config.ts    /v1/models, asked once per origin
    src/settings/models.ts  the address's algebra, and the picker's catalog

An origin that does not answer contributes nothing and refuses nothing — the
engine is not always running, and a machine with no engine is a shorter menu,
not a broken screen. The machine is only declared in the Tauri shell
(`origin.shell()` reads `window.__TAURI_INTERNALS__`), so the web build never
makes a localhost request it cannot complete.

## Why the picker was empty (fixed here)

chat2's `catalog()` read `endpoints` and `specs`, from `/v1/chat/endpoints` and
`/v1/chat/config`. **Neither route exists.** Both call sites passed only
`models`, and `catalog` read that solely inside a `flatMap` over the always-empty
`endpoints` — so it returned `[]` on every call in the app. It is a pure
function, so this is provable in one line rather than argued:

    catalog({ models: { hanzo: ['zen5-flash'] } })   // was []  ->  now 1 entry

The vocabulary of those two dead routes (`Spec`, `Preset`, `Endpoint`,
`Endpoints`) is deleted. `Served` is what `/v1/models` actually answers, two
levels deep: origin, then the `owned_by` the route already carries.

Second half of the same bug: `shell/Chat.tsx` called `pick(address)` and put the
BARE model on the conversation, so the origin was thrown away before the turn
reached the wire. The address now travels whole and `run` is the one place it
comes apart.

`submit.ts` had `DEFAULT_MODEL = 'deepseek-chat'` as the fallback when a
conversation named none. A model the deployment does not serve is not a safer
answer than none, so the screen resolves the default from the catalog instead.

## The engine's key

The engine listens on `0.0.0.0:36900` and, started without a key, serves anyone
who can reach the port — which from that bind address is the whole network. So
the machine origin carries a credential like the estate does: the shell mints
one, starts the engine with it, and holds it in `settings/prefs.ts` (`key`).
Same shape, no special case, and the SDK needs a credential anyway —
`HttpClient.resolveToken()` throws `AuthError` when none is configured.

## Parity — what the old app ACTUALLY ships

Measured against `~/work/hanzo/desktop`, not read off its file tree, because the
file tree is misleading in one decisive way:

**Its router is never mounted.** `index.html` loads `src/main.tsx`, which is
`createRoot → <Gui> → <HanzoApp>`. `src/App.tsx` is the only file that mounts
`<Router><AppRoutes/></Router>`, and it has ZERO importers. So all 40 declared
routes, ~50 page files and ~4,300 Tailwind class sites never render — including
the wallet page, the mining dashboard, agents, tools, MCP, files, crons, and the
machines/containers/kubernetes trio.

Second, independent kill: `libs/hanzo-message-ts` asks `/v1/node/*` on **135**
call sites and `/v2/*` on 2 — and the node it BUNDLES answers `/v2/health_check`
200 and `/v1/node/health_check` 404, the mirror of `hanzod` above. So every
`hanzo-node-state` hook 404s even if the router were mounted. Fixing either
alone changes nothing.

What ships today is `src/hanzo/` — seven files, ~900 lines. That, and only that,
is the parity bar:

- [ ] Welcome / consent screen
- [ ] IAM OAuth + PKCE sign-in (`hanzo://oauth/<brand>` deep link — the one deep
      link that works)
- [ ] Conversation list and history
- [ ] Chat: stream, stop, retry
- [ ] Model selection
- [ ] Settings: node address, identity, version, status; open node manager;
      reset-and-pair
- [ ] Node manager window (logs, options, models, model tools)
- [ ] Tray: show, node manager, spotlight, quit
- [ ] Keychain-backed secret storage
- [ ] Local node spawn / kill / health on boot and exit

Everything else in that repo is backend with no reachable UI, or UI wired to an
API the node does not serve. Four defects worth not reproducing:

- 26 of 83 Tauri commands are never called from the frontend; 10 of those are
  `node_*` aliases of the `hanzo_node_*` originals — two names for one thing.
- `mining/claim.rs` `claim_all` has **zero callers**: 561 lines, and rewards
  accrue to a local JSON file that is never submitted anywhere. Mining also
  starts automatically at boot with no consent and pays a per-install dev
  wallet, because the re-home hook is dead too.
- Eight sidebar links have no matching route and silently redirect to
  `/terms-conditions`; five of them are the newest Hanzo features.
- `main.rs` registers `control+shift+*` accelerators that
  `global_shortcuts/mod.rs` only matches for `SUPER|SHIFT`, so on Linux and
  Windows both hotkeys are registered and inert.
- A successful sign-in does not advance the app — `startLogin` is
  fire-and-forget and nothing calls `onGetStarted()` — and onboarding is
  `useState(false)`, so Welcome reappears on every launch.

## Two traps inherited from chat2, still true

**`@hanzo/ui` needs `react-hook-form` even with no forms.** Declared an
*optional* peer, but `dist/index.js` re-exports `Form`, which imports it
statically. Any consumer of the barrel needs it installed or the build fails
four `MISSING_EXPORT` errors.

**`pnpm install` needs `--no-frozen-lockfile`,** and `CI=true` (the TTY check
aborts the modules purge otherwise).

## Remotes

`git.hanzo.ai/hanzoai/desktop2` is the git of record; GitHub is the mirror. The
forge repo **is not created yet** — its API answers 404 and push-to-create is
refused for organizations, so it needs making in the web UI.

A `url.https://git.hanzo.ai/hanzoai/.insteadof = https://github.com/hanzoai/`
rewrite is set globally, so a `https://github.com/hanzoai/…` remote reaches the
FORGE, not GitHub. Rewrites are applied once and do not chain, which is why the
`git@github.com:hanzoai/desktop2.git` form resolves to real GitHub: it matches
the OTHER rewrite (`url.https://github.com/.insteadof = git@github.com:`) and
the result is not rewritten again.

## Verifying

    npx tsc --noEmit                                  # noUnusedLocals: dead code fails
    node --test --experimental-strip-types 'src/**/*.test.ts'   # 22 assertions

`tsconfig.json` has `noUnusedLocals`/`noUnusedParameters`, so un-exporting a
symbol makes tsc name it if nothing uses it. That is the lever for pruning.
