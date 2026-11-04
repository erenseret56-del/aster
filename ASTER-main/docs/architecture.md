# ASTER architecture

A snapshot of how ASTER is built today, which HTTP APIs the current
(uncommitted) work changes, and the architectural decisions that hold the
pieces together. ASTER is a fork of OpenMausBot; much of the internal naming
(`OMB_*`, `ogb`, `~/.openmausbot`) still carries the old name on purpose — see
[Rebrand](#rebrand-openmausbot--aster).

> Snapshot of the working tree on `main` at `104fd17b` plus uncommitted
> changes, October 2026. Line numbers drift; treat them as pointers.

---

## 1. Repository layout

| Path | What it is |
|---|---|
| `src/` | React 19 + Vite 7 + Tailwind 4 renderer: `components/`, `state/`, `lib/`, `locales/`, `pair/`, `types/ogb.d.ts`, `styles.css` |
| `server/` | Node harness server, run as TypeScript via `node --experimental-strip-types`: `drivers/`, `decider/`, `routes/`, `harness/`, `hooks/`, `tts/`, `model-catalog/`, `testing/` |
| `electron/` | Desktop shell: `main.mjs` (main process), `preload.cjs`, updater, tray, computer-use, cloud, credential helpers |
| `shared/` | Types and pure helpers used by both server and client (`wire.ts`, `approval-mode.ts`, `routines.ts`, `runtime-events.ts`, …) |
| `companion/` | Sidecar process — the only part of the app that listens off the machine (mDNS, paired devices) |
| `apps/docs/` | Next.js docs site (workspace package) |
| `cloudflare/control-plane/` | Worker: cloud account identity, installation ownership, managed companion endpoints |
| `cloudflare/composio-broker/` | Worker (D1) that keeps the Composio key out of desktop builds |
| `deploy/` | Self-hosting: `fly/`, `local/`, `podman/` (Caddy); root `Dockerfile` + `compose.yaml` |
| `scripts/` | Build, packaging, smoke/verify scripts, `mcp-server.ts`, `control-omb.ts` / `control-aster.ts` |
| `docs/` | Feature docs, `verification/` recipes, `plans/`, `specs/`, `design/` |
| `enterprise/`, `evals/`, `skills/`, `ios/`, `android/` | Licensed features, agent evals, bundled skills, mobile clients |
| `third_party/` | Licences and notices for vendored or adapted code |

pnpm workspace members: `.`, `apps/docs`, `cloudflare/control-plane`.
Requires Node ≥ 24 and pnpm 10.33.

---

## 2. Runtime topology

```
┌──────────────────────── Electron (electron/main.mjs) ───────────────────────┐
│                                                                             │
│  BrowserWindow ── loads ──►  dev:      http://127.0.0.1:5199  (Vite)        │
│       │                      packaged: http://127.0.0.1:<SERVER_PORT>       │
│       │ preload.cjs → window.ogb  (contextBridge, ~83 ipcMain handlers)     │
│       ▼                                                                     │
│  React renderer (src/) ── REST /api/* ───────────┐                          │
│                        ◄─ SSE  /api/events ──────┤                          │
│                                                  ▼                          │
│  utilityProcess.fork (packaged only) ──►  Node server (server/index.ts)     │
│                                           127.0.0.1:8799 (+ webhook :8800)  │
└───────────────────────────────────────────────────┬─────────────────────────┘
                                                    │ spawns / talks to
                         engine CLIs & APIs: claude, codex app-server, ACP
                         agents (OpenCode, Qwen, Gemini…), OpenAI-compatible
                         endpoints, decider backends (Jev, Clef-Flash)
```

### Transport

- **REST**: everything under `/api/*`, called through `api<T>(path, init)` in
  `src/state/store.tsx` (a `fetch` wrapper with an optional `timeoutMs`).
- **Server-sent events**: `GET /api/events` is the single live stream. The
  client (`src/lib/live-events.ts`) reconnects with 500 ms → 10 s backoff and
  treats the stream as stale after 40 s without a `ping`. Replay uses
  `Last-Event-ID` or `?since=`. The frame union is `ServerFrame` in
  `shared/wire.ts`. There is no WebSocket server.
- **IPC**: `electron/preload.cjs` exposes `window.ogb`. Local pages get the
  full bridge; remote origins get only a `REMOTE_SAFE` subset (platform,
  capabilities, `applySkin`, `setUnreadCount`, permission status, workspaces,
  cloud move/lending). Types: `src/types/ogb.d.ts`.

### Dev vs packaged

| | Dev | Packaged |
|---|---|---|
| UI | `pnpm dev` → Vite on `127.0.0.1:5199` (`ASTER_UI_PORT` / `OMB_UI_PORT`) | Built `dist/` served by the server from `Resources/ui` |
| Server | `pnpm dev:server` (run it yourself) | `startServerOn(port)` forks `Resources/server/index.js` with `utilityProcess.fork`, trying 8799 → 18799 → 28799 |
| Window URL | `ELECTRON_START_URL ?? http://127.0.0.1:5199` | `http://127.0.0.1:${SERVER_PORT}` |
| Proxy | Vite forwards `/api` and `/.well-known/{aster,openmausbot}/environment` to `127.0.0.1:${ASTER_PORT‖8799}` | n/a |

Server port resolution (`server/index.ts:582`):
`ASTER_PORT || OMB_PORT || OGB_PORT || 8799`; the webhook listener defaults to
`PORT + 1`. An optional Unix-socket listener exists for tunnels
(`OMB_TUNNEL_SOCKET`).

---

## 3. Server

### Entry points

- `server/index.ts` (~23.5k lines) is the HTTP server, built on plain
  `node:http` `createServer(handleRequest)`.
- `server/aster.ts` and `server/openmausbot.ts` are 8-line wrappers around
  `main()` in `server/cli.ts`. That CLI runs the server and also handles
  `pair` and setup. npx, the container (`dist-server/cli.js`) and a source
  checkout all use it.

### Request pipeline

1. **Auth gate**: `server/request-auth.ts`.
2. **Route modules**: `dispatchRoutes(ROUTES, ctx)` from
   `server/routes/table.ts`. Each module is `createXRoutes(deps): RouteHandler`
   and returns `PASS` when the request isn't its own. Modules are registered
   with `ROUTES.push(...)` in `server/index.ts` (~14483–14519):
   hosted-slack, bot-presets, bot-memory, **decider**, antigravity-leftovers.
3. **Legacy inline routes**: the long `if` chain in `server/index.ts`.
   Per `server/routes/README.md`, new routes go into modules, not here.

Helpers: `json` / `readBody` in `server/harness/http.ts`; the event bus is
`server/harness/bus.ts`.

### Subsystems

| Subsystem | Where | Notes |
|---|---|---|
| Engines / drivers | `server/harness/registry.ts`, `server/drivers/builtIn.ts`, `server/drivers/acp/core.ts`, `server/contracts.ts` | `BUILT_IN_DRIVERS`: Claude (claude CLI, stream-json), Codex (app-server), OpenCode, Qwen, Gemini, Grok, Kimi, Droid, Cursor, Hermes, Pi, Antigravity, Minimax, BoatAgent, CustomAcp, OpenAICompat. An unknown driver becomes an "unavailable" shadow snapshot rather than an error. |
| Decider | `server/decider/` | Fast decision model that runs before an engine turn. See [§5](#5-the-decider-jev-and-clef-flash). |
| Rooms / teams | `server/store.ts` (`groups.json`), `room-*.ts`, `team-*.ts`, `group-goal-run.ts`, `chief-of-staff.ts` | Rooms are stored as "groups". |
| Memory | `memory-store.ts`, `memory-*.ts`, `recall.ts`, `workspace.ts` | Each bot's workspace has a `MEMORY.md` and a `memory/` folder. |
| Routines | `server/routines.ts`, `routine-requests.ts`, `shared/routines.ts`, `shared/routine-schedule.ts` | Scheduled agent runs, stored as JSON. |
| Cloud | `cloud-*.ts`, `boat.ts`, `fleet*.ts` | Hosted homes, VM lending and moves, fleet workspaces. |
| MCP | `scripts/mcp-server.ts` (server side, stdio JSON-RPC); `server/mcp-*.ts` (client side) | The MCP server drives a running ASTER over HTTP; the client side connects bots to external MCP servers. |

### Persistence

Everything lives under
`DATA_DIR = ASTER_DATA_DIR ?? OMB_DATA_DIR ?? ~/.openmausbot`
(`server/config.ts:929`). A legacy `~/.opengrokbot` is migrated on first run.

| File | Contents |
|---|---|
| `config.json` | Settings, zod-validated (`server/config.ts`: `loadConfig` / `saveConfig`) |
| `bots.json`, `groups.json` | Bots and rooms, written atomically (`server/atomic.ts` `writeFileAtomic`) |
| `messages.db` | Transcripts in SQLite via built-in `node:sqlite` (`server/message-db.ts`); full-text search runs in `message-search.worker.ts`. Legacy `messages-<threadId>.json` files are imported lazily. |
| `events/`, `native/` | Event log and native helper state |
| `brand.json` | Optional white-label override (`server/brand.ts`, gated by the `whitelabel` entitlement) |

---

## 4. Frontend

- **Boot**: `src/main.tsx` applies the skin and font before first paint
  (`applySkin(readSkin())`), runs `bootstrapBrand()`, then `chooseRoot()`. That
  shows `PairPage` / `BrowserSignInPage` on `/pair` or when unauthenticated,
  and `<App/>` otherwise.
- **State**: `src/state/store.tsx` (~4k lines). `useReducer` inside
  `StoreProvider`, with two contexts: `StoreContext`, and a separate
  `StreamContext` so token-by-token streaming doesn't re-render the whole
  tree. Components read them with `useStore()`.
- **i18n**: in-house catalog in `src/lib/i18n.ts` (`resolveLocale`,
  `setLocale`, English fallback, RTL support). Packs live in
  `src/locales/*.json` (en, de, es, fr, hi, ja, pt-br, uk, zh, zh-tw);
  `pnpm i18n:check` verifies them against `source-hashes.json`.
- **Skins**: `src/lib/skins.ts` defines eight skins (midnight [default],
  atelier, foundry, lagoon, graphite, linen, dusk, daylight) and three
  appearance modes (system → midnight or daylight, dark, light). A skin is a
  `data-skin` attribute plus one block of CSS custom properties in
  `src/styles.css`; `scripts/check-skin-contrast.mjs` enforces WCAG AA.
- **Shell layout** (`src/App.tsx`), left to right:
  - `NavigationRail` (60px)
  - the collapsible `Sidebar` ("Agent Chats", toggled with ⌘B, persisted in `localStorage` as `aster.sidebarExpanded`)
  - the main view: `ChatView`, `GroupView`, `RoutineCalendarPage` or `TeamMapPage`
- **Chat**:
  - An empty thread shows `MascotCentrepiece`: the mascot, a live status chip, the bot's name and four starter tiles.
  - Once the person has sent a message, a compact `MascotCompanionHeader` appears above the transcript.
  - `Composer` floats over the transcript, so messages scroll beneath it.

### Glass UI layer

The current redesign adds an Apple "Liquid Glass" surface system:

- **CSS**: all in `src/styles.css`, sections "LIQUID GLASS" and "Glass UI tokens and utilities".
- **Surface classes**: `.glass-rail`, `.glass-sidebar`, `.glass-toolbar`, `.glass-chip`, `.glass-composer`, `.glass-card`, `.glass-panel` (menus/popovers), `.glass-dialog` (settings), `.glass-sheet` (bot settings side panel), and `.glass-ground` (the wallpaper behind the shell).
- **Vendored components**: `src/components/glass-ui/` holds `Button`, `Card`, `Badge` and `glass-utils`, from [Glass UI](https://github.com/crenspire/glass-ui) (MIT, `third_party/glass-ui/NOTICE`). They use the `.glass-bg`, `.glass-frosted` and `.glass-crystal` utilities.
- **Token recipes**: adapted from [Glin UI](https://github.com/glincker/glinui) (MIT, `third_party/glinui/LICENSE`).

See [§7](#7-key-architectural-decisions) for why it is built this way.

---

## 5. The decider (Jev and Clef-Flash)

A cheap, fast model that answers small typed questions (choice, score, yes/no)
with probabilities, *before* a full engine turn. Its only job today is
**room routing**: in an "Auto" room it picks which bot answers a message that
@mentions nobody. A pick with p ≥ 0.6 wins; otherwise the lead (or first
member) answers. Timeout: 1.5 s. Background: `docs/decision-model.md`.

- **Never throws**: every failure is `{ok:false, reason}`. Reasons:
  `rejected`, `rate_limited`, `overloaded`, `http_error`, `unreachable`,
  `malformed`.
- **Backends** (`server/decider/index.ts:45`):
  `BACKENDS = { jev, "clef-flash": clefBackend }`.
  - **Jev** (`jev.ts`, default): TypeSafe, `POST https://api.typesafe.ai/v1/systemone`, model `jev-latest`, Bearer key (`OMB_JEV_API_KEY` / desktop credential `jevApiKey`). Cloud Pro can supply it through an admin relay (`relay.ts`).
  - **Clef-Flash** (`clef.ts`, the `clef-flash` backend: request building, response validation, keep-alive connection pool): Cloudflare Workers AI, `POST {base}/client/v4/accounts/{accountId}/ai/run/@cf/cloudflare/clef-flash`.
    - Auth: Bearer token, `redirect: "error"`.
    - The base URL must be https (plain http is allowed only to loopback); the account id must match `^[a-zA-Z0-9_-]+$`.
    - Body: `{state, model:"clef-flash", questions}`. Choice questions take 2–255 options; score questions take 2–10 levels.
    - Accepts the Cloudflare envelope or a bare `{answers}`; anything else is `malformed`.
    - Never uses the Cloud Pro relay (`included:false`).
    - The model id `@cf/cloudflare/clef-flash` is confirmed by Cloudflare's Workers AI model page (developers.cloudflare.com/workers-ai/models/clef-flash/) and by successful key checks against a real account.
- **Clef-Flash latency**: model work is ~100–150 ms; the rest is network.
  Calls share one undici `Agent` with a 120 s idle keep-alive (Node's default
  pool keeps idle sockets for only 4 s, so calls more than 4 s apart needed a
  new connection 19–20 times out of 20). `createDecider` pre-opens that socket
  with an unauthenticated `HEAD /client/v4/ips` when Clef-Flash is active.
  Each call logs `timing: { requestMs, responseMs, parseMs }` to
  `decider-log/` (durations only).
- **Provider selection**: `deciderProvider(cfg)` (`index.ts:49`). The
  `DECIDER_PROVIDER` / `OMB_DECIDER_PROVIDER` env var **overrides** config.
  `clef` and `cloudflare` are aliases for `clef-flash`; an unknown value means
  `off`.
- **Credential resolution for Clef** (`deciderAccount`, exported):
  - token: draft → `decider.cloudflareToken` → `decider.key` (only while the provider is Clef) → `CLOUDFLARE_API_TOKEN`
  - account id: draft → `decider.cloudflareAccountId` → `decider.accountId` → `CLOUDFLARE_ACCOUNT_ID`
- **Save rules** (`deciderSavePatch`, `index.ts:150`): saving a Clef token or
  account id while the provider is `clef-flash` turns on the decider and room
  routing. Clearing the token turns it off. Enabling a provider without its
  credentials returns 400.
- **Attribution**: room-routing results carry `provider`
  (`room-routing.ts`), and `server/index.ts:~12878` stamps it on the message as
  `routedBy.provider`. Before this change it was hard-coded to `"jev"`.

---

## 6. API changes in the current working tree

No endpoints were added, removed or renamed. Three changed shape or behaviour,
all for the Clef-Flash decider.

### `POST /api/decider/test` (admin), `server/routes/decider.ts:18-35`

Tests a decider credential without saving it.

| | Before | Now |
|---|---|---|
| Request | `{ key?: string }` | `{ key?: string, accountId?: string, provider?: "jev" \| "clef-flash" }` |
| Validation | `key must be a string` | adds `accountId must be a string`, `invalid provider` (400) |
| Dispatch | `testKey({})` when no draft | always `testKey({ key, accountId, provider })`; a provider of `off` falls back to Jev |
| Response | `{ok:true, latencyMs}` \| `{ok:false, reason, status?}`, `cache-control: no-store` | unchanged |

### `PUT/PATCH /api/config`, `server/index.ts:~22320`

The route itself is unchanged. `patch.decider` now accepts:

```ts
{
  provider?: "jev" | "clef-flash" | "off",
  accountId?: string,
  cloudflareAccountId?: string,
  cloudflareToken?: string,     // write-only, never echoed back
  // existing: key, enabled, jobs, …
}
```

Schema: `server/config.ts:476-480`. New 400 error:
*"Save a Cloudflare Account ID and API token before turning on Clef-Flash."*

### `GET /api/config`, `decider` block (`describeDecider`, `server/decider/index.ts:123`)

```ts
decider: {
  provider: "jev" | "clef-flash" | "off",   // was always "jev"
  configured: boolean,
  included?: true,
  enabled: boolean,
  jobs: { roomRouting: boolean },
  clefConfigured?: true,                   // new
  clefAccountId?: string,                  // new (an id, not a secret)
  jevConfigured?: true,                    // new
}
```

Client type: `src/state/store.tsx:641-648`.

### Wire and bridge types

| Type | Change |
|---|---|
| `shared/wire.ts:457` `WireMessage.routedBy` | `{provider:"jev"}` → `{provider:"jev" \| "clef-flash"; probability}` |
| `src/types/ogb.d.ts:294` `ogb.setCredential` | name union adds `"cloudflareApiToken"` |
| `electron/workspace-credentials.mjs:16` | maps `decider.cloudflareToken` ↔ `cloudflareApiToken` ↔ `CLOUDFLARE_API_TOKEN` |

### New environment variables

| Variable | Purpose |
|---|---|
| `DECIDER_PROVIDER` / `OMB_DECIDER_PROVIDER` | `jev` \| `clef-flash` \| `off`; overrides config |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Clef-Flash credentials (also in `WORKSPACE_CREDENTIAL_ENV`) |
| `CLOUDFLARE_BASE_URL` | Operator override for the Workers AI base (not in `.env.example`) |
| `ASTER_PORT`, `ASTER_WEBHOOK_PORT`, `ASTER_WEBHOOK_PUBLIC_URL`, `ASTER_STATIC_DIR`, `ASTER_DATA_DIR`, `ASTER_BRAND_FILE`, `ASTER_UI_PORT` | Rebrand names; each falls back to its `OMB_*` predecessor |

### UI consumer

`src/components/DecisionModelSettings.tsx` now has separate Jev and Clef
sections, each with its own Save and Test. Clef saves through
`PUT /api/config {decider:{cloudflareAccountId, provider:"clef-flash", cloudflareToken?}}`
and tests through `POST /api/decider/test {provider:"clef-flash", key?, accountId?}`.
Strings: `decider.clef.*` in `src/locales/en.json`.

---

## 7. Key architectural decisions

### Platform and process model

1. **One local server, three front doors.** The desktop window, the browser
   and the phone companion all talk to the same `127.0.0.1` Node server over
   REST + SSE. Electron adds capabilities through `window.ogb`; it holds no
   app state of its own.
2. **Server runs on Electron's Node in production.** It is forked with
   `utilityProcess.fork` from a bundled `dist-server`, so the packaged app ships
   no `node_modules`, and it is the same server the CLI and container run.
3. **TypeScript without a build step in dev.** The server runs through
   `node --experimental-strip-types`; `tsc` is only a type checker until
   packaging.
4. **SSE, not WebSockets.** A single replayable stream (`Last-Event-ID`,
   `?since=`), with `ping` frames for liveness and client backoff. It works
   through proxies and tunnels with no upgrade handling.
5. **Remote pages get a reduced bridge.** `preload.cjs` exposes only
   `REMOTE_SAFE` methods to non-local origins.

### Server design

6. **`shared/wire.ts` is the contract.** Every field it declares must be
   emitted. Server records extend these types, so an undeclared field fails
   compilation instead of leaking or silently going missing.
7. **Route modules over the monolith.** New HTTP surface goes into
   `server/routes/*` as `createXRoutes(deps)` handlers that return `PASS`.
   The inline chain in `index.ts` is legacy.
8. **Atomic files plus SQLite.** Small, hot JSON state (`bots.json`,
   `groups.json`, `config.json`) is written atomically. Transcripts live in
   `node:sqlite` with search in a worker thread. There is no external
   database.
9. **Engines behind one registry.** Every engine is a driver behind
   `server/contracts.ts`; ACP agents share `drivers/acp/core.ts`. An unknown
   or missing driver degrades to an "unavailable" snapshot instead of
   crashing.
10. **The decider is advisory and fail-safe.** It never throws, has a 1.5 s
    budget, and below p = 0.6 it defers to a deterministic fallback. Backends
    are pluggable through `BACKENDS`. Env overrides config so operators can
    pin a provider.
11. **Secrets are write-only.** Keys and tokens are accepted on
    `PUT /api/config` and in desktop credential storage but never echoed back.
    `describeDecider` returns only `configured` flags (and the non-secret
    Cloudflare account id). The Clef client refuses redirects and allows plain
    http only to loopback.

### Frontend and design

12. **Skins are pure CSS.** A skin is one block of custom properties under
    `[data-skin]`, so any subtree can open its own skin context; that is how
    the skin picker renders live previews. Contrast is a tested constraint.
13. **Glass lives on a `::before` layer, not the element.** `backdrop-filter`
    would make its element a containing block for `position: fixed` children
    and break the sidebar's fixed menus and full-window overlays. The layer
    sits at `z-index:-1` inside an isolated surface. The sidebar is
    deliberately *not* isolated: its layer joins `.glass-ground`'s stacking
    context, so its `z-50` overlays aren't trapped under the chat.
14. **No backdrop roots in the glass path.** A `mask`, `filter` or
    `opacity < 1` ancestor would make every glass surface inside it blur
    nothing. This is why the transcript has no fade mask and the composer's
    dock strip is unpainted rather than solid.
15. **Readable glass, with fallbacks.** Each surface tints over the skin
    colour at a tuned opacity floor (tiles about 14–30%, menus 66–74%,
    settings 78–84%). Without `backdrop-filter`, or under
    `prefers-reduced-transparency`, every floor goes to 1 (opaque). Reduced
    motion removes lifts and transitions.
16. **Vendor recipes, don't adopt component systems.** Glin UI (Radix + cva on
    Tailwind 3) and Glass UI (shadcn/Radix) were mined for tokens and three
    presentational components rather than installed wholesale. That avoids a
    second palette and component system, and avoids rewriting working menus
    and dialogs. Vendored shadcn colour tokens were remapped to skin tokens,
    which `src/lib/color-utilities.test.ts` enforces.
17. **Performance budget for glass.** The wallpaper is static gradients, with
    no canvas or animated backgrounds. Blur is 10px on tiles and 16–20px on
    large panes. Measured at a steady 60 fps (max frame 16.8 ms) with 13 blurred
    surfaces, at rest, during sidebar animation and on hover (headless
    Chromium, Metal on Apple M5).

### Testing

18. **Verify against an isolated fixture, never live data.**
    `scripts/control-omb.ts` (alias `control-aster.ts`) launches a server with
    a temporary data dir and home, free ports and only the fake Claude engine.
    Mutating commands require an explicit `--url`. Recipes are in
    `docs/verification/`.

---

## Rebrand: OpenMausBot → ASTER

The rebrand is deliberately surface-level so existing installs keep working.

**Changed**
- Product name, window, tray and startup-screen titles, and artifact names
  (`ASTER-${version}-${arch}.${ext}`).
- GitHub publish target: `asteragent1011-cyber/ASTER`.
- `DEFAULT_BRAND.name = "ASTER"`.
- New scripts `aster` and `control:aster`.
- `ASTER_*` env names, each falling back to the old `OMB_*` name.

**Kept for compatibility**
- `appId com.openmausbot.app` and the `openmausbot://` protocol (changing
  them would break updates and deep links).
- Data dir `~/.openmausbot`.
- `OMB_*` credential env vars.
- `window.ogb`.
- `/.well-known/openmausbot/*` routes.
- The old `omb` and `control:omb` scripts.

---

## 8. Known gaps in the working tree

Found while writing this document. None of them are fixed here.

| Issue | Where |
|---|---|
| Vite proxies `/.well-known/aster/environment`, but the server only serves `/.well-known/openmausbot/environment`. | `vite.config.ts:63`, `server/index.ts:14575` |
| `jevConfigured` is set only when **both** Clef and Jev are configured. | `server/decider/index.ts:137` |
| `syncCredentialEnv` syncs `decider.accountId` to `CLOUDFLARE_ACCOUNT_ID`, but the UI saves `cloudflareAccountId`. | `server/config.ts:~1098` |
| `DECIDER_PROVIDER` written to env by `syncCredentialEnv` overrides later config changes, because env wins over config. | `server/config.ts:~1099`, `server/decider/index.ts:49` |
| `isIdle` in `MessagesList` hides threads that contain bot messages but no user message. This causes 6 test failures in `ChatView.controls` and `ChatView.voice`. | `src/components/ChatView.tsx:709` |
| The Clef-Flash model id is unverified against Cloudflare's catalog. | `server/decider/clef.ts:28-29` |
| A leftover "OpenMausBot" string remains in the locale. | `src/locales/en.json:~1553` |

---

## 9. Build, test and packaging quick reference

| Command | Does |
|---|---|
| `pnpm dev` / `pnpm dev:server` / `pnpm dev:desktop` | Vite UI on :5199 / server on :8799 / Electron |
| `pnpm typecheck` | `tsc -b && tsc -p tsconfig.server.json` |
| `pnpm lint` | `oxlint --deny-warnings .` |
| `pnpm test` | vitest → broker tests → `node --test electron/*.node-test.mjs` → packaged-server smoke |
| `pnpm build` / `pnpm build:server` | UI to `dist/` / server bundle to `dist-server/` |
| `pnpm package:mac\|win\|linux` | `package:prepare` then `electron-builder --publish never` into `release/` |
| `node --experimental-strip-types scripts/control-aster.ts launch` | Isolated fixture for verification (`ui launch` adds a headless browser) |
