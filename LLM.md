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

### The API is `/v1`. There is no `/v2`

One version, and it never moves. Where `/v2` appears below it is naming a
retired prefix to say it is gone, not offering a second surface.

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
(`data/shell.ts` `shell()` reads `window.__TAURI_INTERNALS__`), so the web build
never makes a localhost request it cannot complete.

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

## The free lane is this machine, not a free cloud model

Measured against api.hanzo.ai on 2026-09-01, with a bogus key as the control:

    GET  /v1/models              no auth 200 · pk- 200 · bogus pk- 200
    POST /v1/chat/completions    no auth 401 · pk- 403

The 403 says it outright: *"Publishable keys (pk-) can only access read-only
endpoints (/v1/models, /v1/embeddings, /health). Use a secret key (sk-)."* So a
`pk-` can never buy a turn — that is the design, not a version gap, and chat2's
note that publishable keys would open anonymous chat is wrong.

There is also **no `enso-free`**. The live catalogue is 22 models, none named
enso, none priced at zero; the enso tier names were replaced by real model
names. Nothing in the catalogue is free.

What IS free is the engine on this machine: no account, no metering, and it
answers. That is the signed-out product, and it is the reason the desktop
exists. Two consequences in the code:

* **The menu is not gated on a session.** `/v1/models` answers 200 with no
  credential, so an empty picker for a visitor was THIS client declining to ask.
  `useModels()` takes no `enabled` any more.
* **The sign-in gate stands aside when the machine can answer.** It was
  deliberately undismissable — Escape refused, no cancel — on the reasoning that
  a refusal has nothing behind it. With a local origin that is false, so the
  gate offers "Not now" exactly when `origins()` includes the machine, and is
  the wall it was when it does not.

## Pointing at a local cloud

`hanzo up` stands the whole estate up on this machine. Two variables move the
app onto it, and they move together:

    VITE_HANZO_API=http://127.0.0.1:18080   # where the API is
    VITE_HANZO_IAM=http://127.0.0.1:18080   # where identity is

Measured against a local cloud on 2026-09-01: `/v1/health` 200, `/v1/models`
200 with **86 models** — more than production's 22. **Its 200s prove nothing on
their own**: `GET /bogus-control-xyz` also answers 200, serving the SPA
fallback, so compare the BODY against a bogus-path control every time.

Chat there is refused the same way as production — `POST /v1/chat/completions`
with no bearer is 401 — so a local cloud still needs a local sign-in.

**On the web the redirect URI is `window.location.origin`, always.** It used to
be the literal `http://localhost:3000/auth/callback` whenever the hostname was
loopback, with the client swapped to `hanzo-app` to match. That is correct for
exactly one dev server and silently wrong for every other: a session started on
5173 came back to a page on 3000 that was not running. A round trip returns to
the document that began it, so the origin serving it is the only answer a page
can give. What that moves onto the ISSUER is registering the loopback origins
it will serve — which is a registration, in one place, rather than a literal
compiled into the client.

The desktop is the one place that answer does not apply, because its document
has no address an issuer can reach. It goes out to the browser and comes back
through `hanzo://oauth/<brand>`; `data/iam.ts` `back()` makes that one decision,
and the parity section below has the measurements.

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

- [x] Welcome / consent screen — `shell/Welcome.tsx`, shown by `app.tsx`'s
      `Entry` in the desktop until `prefs.consent` is set
- [x] IAM OAuth + PKCE sign-in (`hanzo://oauth/<brand>` deep link — the one deep
      link that works) — `data/iam.ts` `back()`, `data/session.tsx` `leave()`,
      `shell/Root.tsx` hears `url`
- [x] Conversation list and history — `data/convos.ts`, `data/messages.ts`,
      `rail/List.tsx`
- [x] Chat: stream, stop, retry — `compose/stream.ts:61` and `:95`,
      `shell/Chat.tsx` `retry`
- [x] Model selection — `settings/Model.tsx`, in the composer and in General
- [x] Settings: node address, identity, version, status; open node manager —
      `settings/Node.tsx`. Reset-and-pair has no counterpart: see below
- [x] Node manager window — `machine/Services.tsx` in its own document, all
      three services with their logs. Options and model tools are node-protocol
      surfaces this app does not speak
- [x] Tray: show, services, new chat, quit — `src-tauri/src/tray.rs`
- [x] Keychain-backed secret storage — `src-tauri/src/secret.rs`, holding the
      session (`data/vault.ts`)
- [x] Local node spawn / kill / health on boot and exit — `service::boot` at
      setup, `Registry::clear` on `RunEvent::Exit`

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

### The shell speaks one way in each direction

`data/shell.ts` is the whole bridge: `call` asks the shell to do something, `on`
hears about something it did, and both ride the IPC object Tauri stamps on
`window` before the first script runs — which is also what makes `shell()`
answerable without a request. Nothing else in the app invokes a command, and
`origin.ts` reads `shell()` from here rather than testing `window` a second time.

The Rust side registers seven commands and no more: `manage`, `keep`, `secret`,
`logs`, `spawn`, `status`, `stop`. The old app registered 83, of which 26 had no
caller — so the rule here is that a command with no caller is deleted, and
`forget` was, on the day the keychain facade turned out to clear itself through
`removeItem`.

### The desktop is a different OAuth client, and this is measured

`clientId` is `<org>-app` in the shell and `<org>-chat` on the web, because a
different redirect, a different distribution and a different consent screen make
a different APPLICATION rather than a second copy of one. Which registrations
exist is a fact about the issuer, so it is probed rather than assumed — against
hanzo.id, with an unknown client and an unregistered redirect as the two
controls:

    hanzo-app  + hanzo://oauth/hanzo               302
    hanzo-chat + https://hanzo.chat/auth/callback  302
    hanzo-chat + hanzo://oauth/hanzo               400
    hanzo-chat + hanzo://bogus-control-xyz         400
    bogus-client-xyz + hanzo://oauth/hanzo         400

So `hanzo://oauth/hanzo` is registered on `hanzo-app` and nowhere else, and
`hanzo-desktop` is not a client at all — 400 on every redirect. A better name
for that registration is an issuer change, not a client one.

The round trip goes OUT to the system browser (`data/shell.ts` `open`, over the
opener plugin) because the webview has no address an issuer can return to and
because a login screen inside an app's own webview is a credential prompt with
no address bar to check. It comes back as a deep link the operating system hands
to the process, which `main.rs` emits whole and `Root` completes with
`land(url)` — the same `handleCallback` the web callback route runs, one
optional argument apart.

Signing out in the desktop clears the token THIS app holds and stops. The
issuer's session lives in the browser, which has its own tabs, and ending it
from here would sign somebody out everywhere because they signed out of a chat
window.

### Three things the old app had that have nothing to be here

**Reset-and-pair.** It existed because the node minted an `api_v2_key` on
`initial_registration`, the app kept it, and a machine with no keyring lost it
on restart — locking the app out of a node it had started itself. Chat does not
go through the node here, so there is no key to mint and nothing to lose. The
verb on the Node screen is Restart, and restart is stop-then-start because the
shell ADOPTS a service that is already serving, so a start on its own would find
the old one and do nothing.

**Spotlight.** A second always-on-top window with its own composer, summoned by
a global accelerator. The tray item is "New chat", which raises the one window
and announces `ask`; `Root` starts a fresh conversation. What the old app got
for the extra window was a second surface and the register-versus-match bug
above — four accelerators registered, two matched.

**A keyring fallback.** `secure_storage.rs` falls back to a process-local
`HashMap` when `Entry::new` fails, which answers every call and forgets on exit
— a working keychain right up to the restart that loses the secret. `secret.rs`
refuses instead, and `data/vault.ts` reads that refusal as "this machine has no
better store than the browser's" and hands the SDK no `storage` at all, so it
uses the one the web build already uses. A rung down, named, rather than a
pretence.

### Two documents, because two windows

`index.html` and `services.html`, both declared in `vite.config.ts` — naming one
input turns the default off, so both are named. The services window is a
document rather than a route because it outlives wherever the main window
happens to be, and it holds no session and no router: what a process on this
machine is doing is a question with no account and no address.

Everything it shows is the shell's own answer. `status` reports each service's
name, whether it answers, whether this app started it, and WHERE — so the port
is stated once, in `service.rs`, and `settings/Node.tsx` shows the origin it was
given rather than a number written down twice. Logs are files the services write
beside their storage, read when they are looked at: nothing streams and nothing
polls, and a log that is a file is still there after the crash that makes it
worth reading.

## Rooms come from `/v1/team/rooms`, and three things do not exist

The rail's rooms were nine literals — `#general`, `#dev-swarm`, DMs with agents,
each with an invented last message, an invented unread count, and a `lastActivity`
that was the STRING "Just now". The MCP servers beside them were five more, with
fixed versions and `status: 'connected'` written into the source.

Measured on a local cloud, with `/v1/bogus-control-xyz` as the control (404), so
the codes mean something:

    GET  /v1/team/rooms            403   exists, wants a principal
    POST /v1/team/rooms            403   so does create — see below
    GET  /v1/team/rooms/x/messages 403   and messages
    GET  /v1/channels              403   exists — but it is NOT this
    GET  /v1/presence              404   does not exist
    GET  /v1/bogus-control-xyz     404   the control

`teamRoom` carries `id, name, topic, workspace, direct, private, archived,
members, bindings, life`. So a room already knows whether it is private, whether
it is a DM, and which workspace it belongs to. There is no `team` resource on the
SDK client, so the read goes through `client.http.collection('rooms', …)` — the
transport the SDK exposes for exactly this, and the unwrap for the `{rooms: […]}`
envelope the route answers with.

**`/v1/channels` is a different product and must not be confused with this.** It
is the messaging TRANSPORTS an org has connected — Slack, Discord, Teams,
Telegram — and `/v1/channels/inbox` is what arrived on them. The SDK says it
plainly: inbound only, no send route, and `rooms()` there is arithmetic on a page
you already hold rather than a request. Wiring the rail to it would put somebody
else's Slack ids in a sidebar that is meant to show this org's rooms.

### What the server does not do, and what each would take

Nothing below is stubbed in the client. A client that pretends is how the nine
literals happened.

- **Creation EXISTS, and reading the document said otherwise.** A local cloud's
  `/v1/openapi.json` listed `GET` alone on `/v1/team/rooms`, so a first pass
  deleted the create modal as unreachable. PROBING THE ROUTE says the opposite:
  `POST /v1/team/rooms` answers **403** on production and on that same local
  cloud, against a `/v1/bogus-control-xyz` that answers 404 — and `apps/team`
  registers it at `room.go:122`, with `/rooms/{id}/messages` beside it. The
  document was stale, the route was not. Probe the route; a spec is an artifact
  with its own release lag.

  What create takes is `teamRoomNew`: a name is the whole required request, and
  public is the DEFAULT because "a room nobody can find is the more surprising of
  the two". `space` is deliberately not sent by this client — an org with one has
  no choice to make, and an org with several must be asked rather than guessed
  for. There is no `direct` field, so a DM is not something the route opens.

- **No cross-org anything.** The route's own summary is "every room of the
  CALLER'S org, across the workspaces it owns". Public channels that everyone can
  see and join, and browsing other orgs' public channels, therefore need TWO
  routes that do not exist: a listing that spans orgs and filters on `private ==
  false`, and a join that adds the caller to a room their org does not own. The
  second is the one carrying the real decision — membership today is an org-scoped
  list, and a joiner from elsewhere is a principal the room's own tenant boundary
  currently has no way to admit.

- **No unread.** Nothing on the wire says what has been read, so no count is
  shown. A zero is a claim, and an invented number is what was there before.

## Activation is per TOOL, not per server

The MCP modal had an "Enable MCP" button per server. The estate has no such
switch: `tools.activation()` answers which TOOLS are on and `tools.activate()`
sets them, so the switch belongs on the tool rows and that is where it went.

`activate` takes the WHOLE set — the SDK is explicit that a name absent from
`enabled` is off afterwards — so a toggle reads the live set, changes one name,
and sends all of it. Sending only the name somebody clicked turns off the rest.

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
    node --test --experimental-strip-types 'src/**/*.test.ts'   # 27 assertions

`tsconfig.json` has `noUnusedLocals`/`noUnusedParameters`, so un-exporting a
symbol makes tsc name it if nothing uses it. That is the lever for pruning.


## Every store reads. The eleven that did not, and what they claimed

Eleven surfaces held literal tables and rendered them as measurements. Each is
now a read, and what could not be read was DELETED rather than defaulted — the
rule throughout being that an invented number is worse than a missing one,
because a screen gives no sign which it is showing.

| surface | reads | what was invented |
|---|---|---|
| plugins | `/v1/tools/plugins` + `/authored` | a marketplace: version, author, download count, star rating |
| automations | `/v1/auto/flows`, `/runs` | a cron line, an agent, a run count; `runNow` faked the result on a timer |
| tasks | `/v1/agents/sessions` | hand-written logs, artifact lists, a progress number |
| projects | `/v1/iam/{organizations,projects}` | org tiers, member counts, two stock people, runtime targets |
| agents | `client.agents.list()` | five personas with prompts, capabilities and dead avatar URLs |
| workspace | `/v1/todo`, `/v1/meet/call`, `/v1/network` | a meeting roster, a transcript, an `aiSummary`, a tunnel URL and an `enclaveKey` |
| artifact | `client.sandboxes` | a boot sequence, a compile time, an ingress URL, a 0.18ms p99 |
| boards | `/v1/todo/board` | four cards with branches and agents; a "review" column that does not exist |
| intelligence | `/v1/ai/memory/list`, `/v1/code/search` | confidence scores; a symbol index at fixed line numbers |
| channels | `/v1/team/rooms` | nine rooms with unread counts and a "Just now" that was a string |
| presence | `people.list` | three people with a `status` of online or idle |

### What the exercise taught, beyond the counts

**A store that writes nothing is the loudest kind of lie, and it is silent.**
`AgentBuilderModal` built an object and handed it to an optional `onSave` that
the one place mounting it never passed, so every agent anyone defined there was
discarded without a word. `boardStore.moveCard` and `taskQueueStore.retryTask`
were the same shape one level down: they edited an array, the screen updated,
and nothing left the process.

**Read the source before writing a body.** `POST /v1/ai/memory/remember` is
behind ai's wildcard, so the document names the route and declares no body. The
shape came out of the pinned module (`controllers/memory.go`: `{id, name,
content, kind, metadata}`, and identity is force-set server-side and never read
from the body). Guessing would have stored an empty memory and reported success,
which is the failure `apps/captable` records for the same reason.

**Two schemas can spell one column differently, and one of them is right.**
`issueView`, `issueHit`, `issueEdit` and `newIssue` all say `canceled`, one L. A
`cancelled` written from memory would have been refused with a 400 by a select
option that looked correct.

**Null is not zero, and the wire keeps them apart on purpose.**
`sessionProgress.pct` is ABSENT rather than 0 when a run's progress is
indeterminate, so `pct` is `number | null` here and a null draws NO BAR — an
empty one reads as "nothing has happened yet", which is the one thing it does
not mean. The same route marks its answer `estimated` when a model produced it,
and the card says so: an estimate rendered as a measurement tells somebody a
stuck run is fine.

**A dead host answers everything, including a control.** The five agent avatars
pointed at `cdn.hanzo.ai/avatars/<id>.png`, which answers 525 — as does
`cdn.hanzo.ai/bogus-control-xyz.png`. Without the control the 525 reads as five
missing files rather than a host that does not work.

**A crossed axis shows up as three options where there are two questions.** The
artifact panel offered "Local k3s / Hanzo Cloud / gVisor Enclave" as one picker,
which is a place, a place and an isolation. It is two controls now, the same
split `~/terminal` already made: WHERE it runs is an origin, WHAT isolates it is
a runtime, and a microVM is a runtime.

**Collapse a branch-per-column into a table and the wrong column cannot exist.**
The board had three hand-written "move forward" buttons, and the middle one
moved a card to `review` — a column the board does not have. One button over one
`onward` map made that unrepresentable.


## One way to hold state, and it is two questions

A value is either THIS WINDOW'S or THE SERVER'S, and the two have different
primitives because they have different failure modes. There is no third.

| the question | the primitive | where |
|---|---|---|
| what this window owns — is the panel open, which tab, which origin, the draft | `atom` + `useAtom` | `data/store.ts` |
| what the server owns — the rooms, the board, the roster | `useRead(key, read)` | `data/query.ts` |
| a change to the server | `useSend(call, [keys…])` | `data/query.ts` |
| that is no longer true | `invalidate(key)` | `data/query.ts` |

Both read through `useSyncExternalStore`, so a component reading a cached answer
and one reading a live atom behave identically under a concurrent render. There
is no provider to mount, which is why `invalidate()` can be reached from a
callback route with no hook.

**Thirteen stores each hand-rolled all of it**, and the header of `store.ts` had
said "nothing else in the app subscribes to anything by hand" the whole time —
so the rule was written down and thirteen files falsified it. What that cost,
measured before deleting it: 13 listener sets, 12 character-identical copies of
one error helper, 12 `put` reducers, 3 copies of `ago` and 2 of `tint`. 2456
lines of store became 1922.

`query.ts` was itself part of the problem: it named FOUR verbs and shipped two.
`usePages` was never written and `useSend` was named while every store rolled
its own. **A verb a doc promises and a file does not define is worse than a
missing one, because the next author writes their own rather than looking.**

### Three things the move bought that the old shape could not express

**A filter belongs in the KEY.** The board's narrowing and the projects org are
part of `keys.board(key)` and `keys.projects(owner)`, so switching either is a
different cache entry rather than a re-read of one. The previous answer stays on
screen while the next arrives, and going back costs nothing. A `state.key` field
plus one reader can do neither.

**A key expresses what does NOT get read.** A session's transcript is
`keys.session(id)`, read only for the run on screen — which is how "a list of
fifty runs does not need fifty transcripts" becomes a fact about the code rather
than a flag somebody must remember.

**A stale-key list beats calling your own reader.** Every hand-rolled write ended
`await read()`. Naming the keys instead (`useSend(call, [keys.flows])`) says what
the write CHANGED, which is a different statement from what this panel happens to
show — and only the first one stays true when a second panel shows the same rows.

### The exception, and why it is not a third way

`terminal` and `artifact` hold a LEASE, and a lease is a handle this window
HOLDS rather than a value it fetched: re-reading it would rent a second computer
and dropping it from a cache would strand the first. The accumulated output is
the same shape one level down — no key can be invalidated to recover a log. Both
are atoms plus `useSend`, never `useRead`. The test for the next one: **if
fetching it twice would create two of something, it is not a read.**

### Time is unix milliseconds inside this app

The estate sends three spellings — RFC 3339 on a session, unix SECONDS on a
board issue, unix MILLISECONDS on a flow — so `show.ts` converts at the boundary
where a store folds the wire (`fromStamp`, `fromSeconds`) and every clock past
that point is one number. `ago` therefore takes a number and nothing else: given
all three it could not tell which it was handed, and `1_700_000_000` is a
plausible answer in either unit and fifty-four years apart between them.

## Everything talks to the unified API, and that is checked rather than assumed

Audited across the whole tree: **30 of 30 calls resolve to a path in
`api.hanzo.ai`'s own OpenAPI document**, including the five whose leaf is
computed (`/sessions/{id}/{pause|resume|stop}`,
`/flows/{id}/{enable|disable}`) — expanded to every value the code can produce
and checked one at a time, since a regex reads those as missing.

- **One data host.** `client(ESTATE)` is the SDK's default base, overridable by
  `VITE_HANZO_API` for a local cloud; `client(MACHINE)` is the engine on
  `127.0.0.1:36900`. Nothing else is dialled.
- **No `/api/` prefix anywhere**, and every data path is `/v1/*`.
- **Auth is Hanzo IAM**, per brand (`hanzo.id`, `lux.id`, `zoolabs.id`). No
  second auth, no bespoke session.
- `tasks.hanzo.ai` and `tabs.hanzo.ai` appear ONLY inside `window.open` and an
  `<a href>` — destinations a person clicks, not endpoints. Re-check with
  `grep -rn "https://" src` before believing a new host is a call.

Re-run the audit by extracting every `path:` literal and matching it against
`GET /v1/openapi.json`, normalising `${…}` to `{x}`. A path that does not match
is either a typo or a route the fleet does not serve, and both are worth failing.


## What holds at scale, and the one thing that does not

Audited for what breaks when an org is large and a session is long. Everything
below was measured, and the client-side half is fixed.

**Nothing polls.** There is not one `setInterval` in the app. Every read happens
because a panel opened or a key was invalidated, and a failed read is NOT
retried — `useRead`'s freshness window covers a failed entry too, deliberately,
so a fleet having a bad minute does not get a retry storm from every desktop at
once. `invalidate()` is what re-reads, and that only happens after a write this
client made. This is the single best scale property the app has; do not add a
poll without a reason that survives being multiplied by every customer.

### Four things grew without limit, and all four are bounded now

| what | was | now |
|---|---|---|
| the query cache | `invalidate` was the ONLY thing that removed an entry — one entry, one reader CLOSURE and one era counter per key ever read | bounded at 256 settled entries; a watched, in-flight or pending entry is never evicted |
| the terminal scrollback | every line for the life of the window | 2000, oldest dropped |
| the artifact log | the same | the same |
| the DOM | one node per row, for whatever the server sent | `useShown`, which reports what it withholds |

The cache one was the sharpest because `keys.symbols(query)` mints a key per
KEYSTROKE, so a long search typed a leak one character at a time and nothing
failed — a leak is a screen that keeps working. `useSettled` fixed the cause
(the key lags the typing, the box does not) and the bound fixed the class.

**`data/query.test.ts` proves the bound and was mutation-checked**: with
`reclaim` disabled, two tests fail. It also says in as many words which arm it
CANNOT reach — the three eviction protections need a renderer, and `node --test`
has none. A test file that looks complete and covers two of five branches is
worse than one that names the gap.

### A truncated list must say so

`useShown` reports `total` and `more` and that is the load-bearing half, not the
slice. **A list silently cut at thirty is the silent-empty failure one level
over**: a person concludes their org has thirty rooms when it has three thousand,
and nothing on the screen distinguishes those. Never render `shown.rows` without
rendering `shown.more`.

The same rule caught a real one in the notepad: `localStorage` is a few megabytes
and notes are unbounded, so `setItem` eventually throws — and the catch swallowed
it, which made the newest note look saved and lose it on the next reload. It is a
value now and the editor says "not being saved" while somebody is typing, rather
than on the reload that loses the work.

### THE REMAINING SCALE BLOCKER IS SERVER-SIDE, and it is most of the API

Measured against `api.hanzo.ai`'s own document: of the **505 GETs that answer a
list** (counting enveloped ones, not just bare arrays), **432 — 85% — accept no
bound at all.** No `limit`, no `cursor`, no `page`. They answer with everything
the org has.

Worst by product: `ai` 46, `o11y` 37, `iam` 26, `platform` 14, `billing` 14,
`pricing` 14, `visor` 13. Eight of the twelve this app reads are among them —
`/v1/team/rooms`, `/v1/todo/board`, `/v1/iam/projects`, `/v1/ai/memory/list`,
`/v1/agents`, `/v1/network`, `/v1/network/routers`, `/v1/tools/plugins`.

**No client flag fixes this.** `useShown` bounds the DOM, which stops the app
freezing; it does not stop the server assembling and serialising ten thousand
rows, or the wire carrying them, or the client parsing them. An org with ten
thousand rooms gets a ten-thousand-room JSON body on every rail read. That is a
cloud change — a `limit`/`cursor` on those routes — and it is the one thing
standing between this and an org of any size.

Re-measure it rather than trusting the number: fetch `/v1/openapi.json`, keep
every GET whose 200 carries an array at any depth (an envelope counts), and
report those whose parameters name none of limit/cursor/page/offset/after.
**Check membership by NAME, not by absence from a filtered list** — the first
version of this measurement classified `/v1/ai/memory/list` as bounded because
its enveloped response was never classified as a list at all, so it fell out of
the candidate set and its absence from the naked list read as success.


## The tool plane serves three views, and this app now reads all three

`apps/tools` says it plainly: the plane also serves the CALLER's own tools — its
connectors, skills, agents and external MCP servers — and its three views
"skills, plugins and the org's external MCP servers" are the SAME registry
narrowed, over rows this app opens and no other does. Two of the three were
here; skills was not, and finding it took reading the route table rather than
guessing a path.

**Skills are not at `/v1/skills`, and they are not only at `/.well-known`.**
`/.well-known/agent-skills/index.json` answers 200 unauthenticated and is real —
it is the estate's PUBLISHED catalogue of its own products, generated by
`plugin/gen-skills`, listing a skill count per product and the MCP address. It
is documentation of the fleet, not this org's rows, and nothing here reads it:
the authenticated view is a superset of it and carries the two things the
document cannot, which are this org's own skills and the activation flag. One
way, and it is the one that answers per caller.

| view | route | envelope |
|---|---|---|
| the registry, narrowed to one source | `/v1/tools/skills` | `{source, tools: […]}` |
| the editable half, with bodies | `/v1/tools/skills/authored` | `{skills: […]}` |
| what this deployment mounted | `/v1/tools/plugins?all=true` | `{plugins: […]}` |
| what this org built | `/v1/tools/plugins/authored` | `{plugins: […]}` |
| the provider catalogue | `/v1/integrations` | `{providers: […]}` |

**The skills envelope is `tools`, not `skills`.** It is the tool registry viewed
through one source, so it keeps the registry's envelope, and unwrapping the key
the route is named after would answer `[]` — an empty org, reported as success,
which is the failure this file already records twice.

### Four things measured that a guess gets wrong

**`/v1/tools/plugins` answers only what is RUNNING unless `all=true`.** The card
draws an on/off mark and tints its border by `enabled`, and every row came back
enabled, so the off state was unreachable: a mark that looks like it reports a
fact and reports a constant. One query parameter is the difference between an
inventory and a list of whatever happened to answer.

**An authored plugin's `source` is its TypeScript.** The type here said "where
it was built from" and the card rendered it as one line of provenance with
`wordBreak: 'break-all'` — so a plugin with a program in it would have put the
whole program in a caption. It is opened, one at a time, like a skill's body.

**The registry prefixes a skill and the authored view does not**: `triage` is
registered `skill_triage`, by BOTH providers, and that prefixed name is what
activation is sent under. So a skill carries two names and both matter — join on
the bare one, activate with the other. `skills/fold.ts` is pure so this is
provable rather than argued, and `fold.test.ts` is mutation-checked: breaking
the prefix strip fails three of its four assertions.

**`available` and `connected` are independent.** Available is whether THIS
DEPLOYMENT holds the provider's app credentials, so `connect` can succeed at
all; connected is whether this org has a live connection. Folding them into one
status offers Connect on a provider whose connect answers 503, and a button
whose only outcome is a refusal is worse than no button because its presence
reads as a promise. The card says "not configured here", which is the reason.

### Connect leaves and does not come back

`POST /v1/integrations/{provider}/connect` picks its credential path by the
PRESENCE of a `token` key: absent starts three-legged OAuth and answers with a
consent URL, present seals a customer's own API token. This client never sends
one — a credential prompt inside an app's own window is what sign-in already
refuses to be — so a provider offering only the token path answers with the
sentence saying so, and the card shows that sentence.

The consent trip redirects to the CONSOLE, not here, so `useConnect` names no
stale key: nothing has changed yet, and claiming the catalogue is stale would
re-read it for the same answer and flicker as though something had happened.
Disconnect is the opposite — it finishes on the estate, it is idempotent, and it
names `keys.connectors`.

### The composer's `/` menu was called Skills and can never contain one

`compose/skills.ts` read `tools.list({activated: true})` and dropped everything
with `dispatchable === false`. Both skill providers register EVERY entry
`Dispatchable: false`, because a skill is discovery metadata an agent reads
rather than something a turn calls — so the filter excluded, by construction,
the entire category the file was named after. It is `tools/store.ts` now, the
menu says Tools, and `keys.skills` belongs to the thing that is skills.

Activation moved there with it. It is ONE set on the estate that the MCP panel
and the skills panel both change, and `activate` takes the WHOLE set, so a
writer per panel is two statements of one fact and the second one switches off
what the first turned on. The stale list names every view of that set rather
than the panel that clicked.

### One frame, and nine panels that still hand-roll it

`shell/Sheet.tsx` is the scrim, the frame, the title, the kind tabs and the
search box, plus `State` (the fault/reading/empty decision, which is one
decision and was three conditions per panel) and `More` (what `useShown` is
withholding). Plugins, skills and connectors draw in it. The other nine modals
predate it and still carry their own copy; converting them is a diff nobody
needs today, but nothing should be written a tenth time.

## What the cloud serves and nothing here calls

Measured off `/v1/openapi.json`, GETs only, webhooks and OAuth callbacks removed
because those are the provider calling us and no client should ever hold them.
Route counts are readable surfaces, not verbs.

The sharpest gap is not a route, it is a PRODUCT: **the money.** `billing` 28,
`pricing` 25, `plan` 14 — balance, credits, ledger, invoices, usage, usage
rollup, tier, subscriptions, entitlements — and this app spends credits on every
turn while showing none of it. A person cannot see what a conversation cost,
what is left, or which plan they are on.

Then, by size: `o11y` 172, `ai` 104 (of which this reads memory alone), `iam` 54
(three routes read), `commerce` 51, `platform` 20, `git` 20, `visor` 18.

Adjacent to what was just built, and small enough to finish:

- **The user-scoped connector plane is untouched — nine routes.**
  `/v1/integrations/connectors`, `/connectors/providers`, `/connectors/{id}`,
  `/{id}/refresh`, `/{id}/token`, `/{provider}/credential`, `/{provider}/device`
  and its poll. It is a PERSON's own credentials where `/v1/integrations` is the
  ORG's, and the two must not be drawn as one list — `connectorProviderView`
  carries `methods`, which is how a card could finally say whether a provider
  takes OAuth or a token, a thing the org catalogue does not report.
- **A third connector plane**, `/v1/knowledge/connectors` and its catalog, for
  knowledge sources. No client anywhere.
- **`/v1/tools/catalog`** and `/catalog/{id}` — the fleet's tool catalogue.
- **Authoring has no client on either side.** `POST /v1/tools/skills` and
  `DELETE /v1/tools/skills/{id}`; `POST /v1/tools/plugins/build` and
  `DELETE /v1/tools/plugins/authored/{id}`. Reading and activating are here
  deliberately: a destructive verb with no way to create is a trap, so the pair
  arrives together or not at all.
- **`/v1/integrations/{provider}/verify`**, which re-checks a stored credential
  and reports `active:false` with a reason as a 200 rather than an error —
  written for a console to render, and nothing renders it.
- **The provider-specific surfaces**: `/v1/integrations/github/{installations,
  repos,search,fork}`, `/linear/*`, `/gitlab/projects`. Connecting GitHub works;
  nothing then reads a repository.

`/v1/tools/call` is served and has no client here on purpose — a turn dispatches
through the chat completion, and a second way to call a tool is a second way.


## Type by the producer, not by the reader

Two types here declared fields their own producer could not fill, and both were
found the same way: read the fold, and see what it writes a placeholder for.

`AutomationJob` declared `name`, `trigger`, `triggerName` and `valid`, and the
list read filled them with `''`, `'empty'` and `valid: false` — that last one
asserting *the builder rejected this flow* about every flow the org has, because
`GET /v1/auto/flows` carries no version and has no populate parameter. It is
`Flow` (the row) and `Version` (the per-flow read) now, and the second is
returned as `Version | null` so "not read yet" and "read, and it has no trigger"
stay different answers.

`PluginExtension` was one record with optional halves, so the fold wrote
`prefixes: []` and `enabled: true` for an authored plugin — which has neither
concept. As a discriminated union the wrong access does not compile, **and the
compiler immediately found five live ones**: a filter searching prefixes on an
authored row, a card border drawn from a switch that kind does not have, two
source reads on a mount, and a footer that drew every authored plugin as
permanently "on".

**A type whose producer must lie to satisfy it is describing two things.** The
test is mechanical: `grep` the folds for a field set to a constant, and ask
whether that constant is a fact or a filler.

## A hook that reads two things is usually a place, not a value

`useWorkspaceApps` returned seventeen fields covering the notepad, the backlog,
the call and the overlay network. `useIntelligence` read memories and the code
index. `useProjects` read orgs, projects and people. In every case what the
parts shared was a MODAL — a place — so a note being typed re-rendered on a
network read, and one `fault` field held two unrelated failures.

Split by tab, not by count. `useTaskQueue` still reads two things and stayed
that way on purpose: the queue shows the selected run's transcript, so it is ONE
view composing two sources rather than two views sharing a strip.
`useAutomations` reads the flows alone, because a row's NAME and its LAST RUN
are both per-flow keys the ROW reads (`useVersion`, `useLastRun`) — a flow
nobody drew is a flow nobody fetched, and an org-wide page of runs can only say
whether a flow is among the newest fifty of them.

Where a value is genuinely shared, give it its own hook rather than passing it
around: `useOrgs` is read by `useOrgProjects` and `useOrgPeople`, because the org
really does select both.

## Two sessions edit this checkout at once

This repository is worked by more than one agent at a time, and it shows up in
ways that do not look like concurrency:

- **`git add -A` takes the other session's staged work.** It happened twice.
  Once it took a rename of `compose/skills.ts` WITHOUT the import updates, so
  that commit did not build although the working tree did — the dangling-
  reference shape, with no conflict to warn you. **Use `git commit -- <paths>`**,
  which ignores the index for everything else. `git add` then `git commit` is
  not enough: the peer can stage between the two.
- **Work you pushed can be gone.** The plugin union was reverted by a peer's
  rewrite of the same files hours later — not carelessly: that rewrite carried
  three findings this pass had missed (`all=true`, without which the route
  returns only RUNNING subsystems so `enabled` can never read false; `source` is
  authored TypeScript rather than a location; `builtAt` in this app's clock).
  The answer is to re-apply over theirs, keeping both, not to revert.
- **`tsc` green is not `build` green.** Main was red for a while because two
  entry points import `@hanzo/font/css` and nothing declared the package. A CSS
  side-effect import carries no types, so only a bundle catches it. Run the
  build, not just the typecheck, before calling anything shipped.
