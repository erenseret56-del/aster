

# ASTER: Deep Architectural & Capability Analysis

Welcome! As a Computer Science and Design (CSD) student diving into backend systems, **ASTER** (forked and rebranded from **OpenMausBot**) is a rich codebase to study. It demonstrates how to orchestrate autonomous AI agents, manage local process life cycles, persist state reliably without external database servers, stream real-time events, and enforce safety boundaries.

---

## 1. High-Level Architecture & Topology

ASTER follows a **local-first, multi-process architecture**. Even though it packages as a single desktop app via Electron, the UI, the orchestration server, and the AI agent processes are decoupled across distinct boundaries.

```mermaid
flowchart TB
    subgraph Client["Presentation Layer (Client)"]
        UI["React 19 + Vite + Tailwind\n(src/App.tsx)"]
        Preload["Electron Bridge\nwindow.ogb (electron/preload.cjs)"]
    end
    subgraph Server["Orchestration Engine (Node.js)"]
        HTTP["HTTP API Server (:8799)\n(server/index.ts)"]
        SSE["Server-Sent Events Stream\nGET /api/events (server/sse-fanout.ts)"]
        Store["State Engine & JSON Store\n(server/store.ts)"]
        MsgDB["SQLite Transcript Store\n(server/message-db.ts)"]
        Decider["Decision Layer\nJev & Clef-Flash (server/decider/)"]
        Harness["Driver Harness & Registry\n(server/contracts.ts)"]
    end
    subgraph Engines["AI Execution Engines (Subprocesses / APIs)"]
        Claude["Claude CLI\n(stream-json stdio)"]
        Codex["Codex App-Server\n(JSON-RPC stdio)"]
        ACP["ACP Agents (Gemini, Grok, Qwen...)\n(Agent Client Protocol stdio)"]
        OAI["OpenAI-Compatible REST APIs\n(Ollama, OpenRouter, vLLM)"]
    end
    subgraph Tools["Tools, Connectors & Devices"]
        MCP["External MCP Servers\n(server/mcp-registry.ts)"]
        Browser["Agent-Browser Engine\n(server/browser-engine.ts)"]
        Computer["Computer-Use / CUA\n(Docker / Cloud VM / Native)"]
        Composio["Composio SaaS Tools\n(server/composio.ts)"]
    end
    UI -- "REST /api/*" --> HTTP
    HTTP -- "SSE stream" --> SSE
    SSE -- "Live events (token, tool, ask)" --> UI
    Preload -. "OS Keychain & native APIs" .- UI
    HTTP --> Store
    HTTP --> MsgDB
    HTTP --> Decider
    HTTP --> Harness
    Harness --> Claude
    Harness --> Codex
    Harness --> ACP
    Harness --> OAI
    Claude & Codex & ACP & OAI --> MCP
    Claude & Codex & ACP & OAI --> Browser
    Claude & Codex & ACP & OAI --> Computer
    Claude & Codex & ACP & OAI --> Composio
```

### The 3 "Front Doors"

1. **Desktop App:** [electron/main.mjs](../electron/main.mjs) launches a BrowserWindow that renders the React UI. In packaged builds, it forks the Node server using Node's `utilityProcess.fork` on loopback port `8799`.

2. **Local Web Browser:** You can open `http\://127.0.0.1:8799` in any browser. Local browser pages get the web UI over HTTP.

3. **Companion Sidecar (Mobile/Remote):** The companion process in [companion/src/index.ts](../companion/src/index.ts) listens on port `8810` for paired mobile devices (iOS/Android) over a LAN or Tailscale network, acting as an authentication and rate-limiting proxy in front of the loopback server.

---

## 2. End-to-End Request Flow: When You Send a Message

Here is what happens under the hood from the millisecond you hit `Enter` until the AI's tokens stream back:

```
[User Input] 
     │
     ▼
1. React Composer (src/components/Composer.tsx)
   └─ Dispatches POST /api/bots/:id/messages (with text, threadId, sendId)
     │
     ▼
2. Server Routing & Auth Gate (server/index.ts & server/request-auth.ts)
   ├─ Verifies loopback origin and auth token
   ├─ Checks spend budget: assertWithinBudget()
   └─ Sequencer locks turn via sendSequencer to prevent duplicate dispatch
     │
     ▼
3. Turn Initialization (server/index.ts: startTurn())
   ├─ Writes User Message to SQLite messages.db (server/message-db.ts)
   ├─ Emits SSE message.created event to frontend (server/sse-fanout.ts)
   ├─ Compiles System Prompt (server/system-prompt.ts):
   │   ├─ Reads bot's SOUL.md & memory files (MEMORY.md)
   │   ├─ Injects Pre-Turn Recall (server/recall.ts) via SQLite FTS5 search
   │   └─ Sets active surface (Local / Browser / Cloud / Off) and permissions
     │
     ▼
4. Engine Selection & Session Dispatch (server/harness/registry.ts)
   ├─ Looks up bot's driver (e.g. Claude CLI, Codex, ACP, or OpenAI-compat)
   └─ Connects to long-lived session process or sends HTTP prompt
     │
     ▼
5. Tool Execution & Human-in-the-Loop Approval (if tool called)
   ├─ Engine emits request.opened event (e.g., run terminal command)
   ├─ If bot is in "Ask" mode: turn pauses, ApprovalCard rendered in UI
   ├─ User clicks "Allow Once" -> POST /api/threads/:id/approvals/:reqId
   └─ Server dispatches tool execution and sends tool.completed to engine
     │
     ▼
6. Streaming & State Finalization
   ├─ Token events stream over SSE: GET /api/events
   ├─ React StreamContext updates visible text without full component tree re-renders
   ├─ Engine sends turn completion signal with token usage
   └─ Server commits bot message to SQLite messages.db and banks costs to usage-ledger.ts
```

---

## 3. Deep Dive into the 10 Areas

### 1. User-Facing Features

Through the frontend, you can currently:

- **1-on-1 Bot Chats:** Chat in isolated threads with customized AI agents ([ChatView.tsx](../src/components/ChatView.tsx)).

- **Multi-Agent Rooms (Groups):** Create group conversations where multiple agents collaborate. Rooms can be manual (only responding when @mentioned) or "Auto" (the decider selects who speaks) ([GroupView.tsx](../src/components/GroupView.tsx)).

- **Scheduled Routines & Calendar:** Set up recurring agent tasks on cron or interval schedules. A dedicated calendar visualizes past and scheduled runs ([RoutineCalendarPage.tsx](../src/components/RoutineCalendarPage.tsx)).

- **Team Visual Map:** View your agents, their roles, and relationships on an interactive canvas ([TeamCanvas.tsx](../src/components/TeamCanvas.tsx)).

- **Computer & Browser Automation:** View live screenshots and interaction logs of automated desktop or browser sessions ([ComputerPanel.tsx](../src/components/ComputerPanel.tsx)).

- **SaaS Connections (Plugins):** Authenticate with external apps (GitHub, Gmail, Slack, etc.) via Composio ([PluginsPanel.tsx](../src/components/PluginsPanel.tsx)).

- **Mobile Pairing:** Pair an iPhone or Android phone via a QR code or numeric code ([ServerPairingCard.tsx](../src/components/ServerPairingCard.tsx)).

### 2. Agent System

- **Creation:** Agents are created via [NewBotDialog.tsx](../src/components/NewBotDialog.tsx) which calls `POST /api/bots`. Defaults are validated with Zod in [server/new-bot-defaults.ts](../server/new-bot-defaults.ts).

- **Identity & Persona:** Each agent gets a name, a color/mascot, a private workspace folder (`~/.openmausbot/workspaces/<botId>/`), and a `SOUL.md` file that defines its standing instructions ([server/bot-folder.ts](../server/bot-folder.ts)).

- **Selection:** When chatting in a 1-on-1 thread, the selected bot runs. In group rooms, selection occurs via @mentions or through the decision layer ([server/decider/room-routing.ts](../server/decider/room-routing.ts)).

- **Execution:** Execution is handled through drivers implementing `ProviderDriver` in [server/contracts.ts](../server/contracts.ts). Long-lived CLI processes (Claude, Codex, ACP) are pooled to avoid paying full process startup penalties on every turn.

### 3. Decision Layer (Jev & Cloudflare Clef-Flash)

The decision layer ([server/decider/index.ts](../server/decider/index.ts)) runs a small, fast AI classifier **before** any full agent turn.

- **Why it exists:** Traditional LLMs take seconds to think and stream. The decider answers small, structured multiple-choice questions in 100–300ms with probability scores.

- **Current Active Role:** Its **only active job in the codebase today** is **Room Routing** ([server/decider/room-routing.ts](../server/decider/room-routing.ts)). When someone speaks in an "Auto" multi-agent room without tagging anyone, the decider evaluates recent messages and chooses which agent is best suited.

  - If a bot receives probability $p \ge 0.6$, that bot responds.

  - If $p < 0.6$, or if the decider times out (strict 1.5s timeout) or errors, it falls back to the room leader.

  - **Fail-safe contract:** The decider **never throws errors**. Every failure degrades gracefully to deterministic fallbacks.

- **Backends:**

  1. **Jev (Default):** TypeSafe API (`https\://api.typesafe.ai/v1/systemone`) running model `jev-latest` ([server/decider/jev.ts](../server/decider/jev.ts)).

  2. **Clef-Flash:** Cloudflare Workers AI model `@cf/cloudflare/clef-flash` ([server/decider/clef.ts](../server/decider/clef.ts)). Keeps undici keep-alive sockets open to minimize latency.

### 4. Model Integrations & Providers

Registered in [server/drivers/builtIn.ts](../server/drivers/builtIn.ts):

- **CLI Subprocess Engines:**

  - **Claude:** Official Anthropic Claude Code CLI (`claude` on PATH via `stream-json` stdio).

  - **Codex:** OpenAI Codex app-server via stdio JSON-RPC.

  - **ACP (Agent Client Protocol) Agents:** Grok Build, Gemini CLI, Kimi, Droid, Cursor, OpenCode Go, Qwen, Hermes, Antigravity.

- **Direct HTTP / OpenAI-Compatible:**

  - [server/drivers/openai-compat.ts](../server/drivers/openai-compat.ts): Connects directly to local Ollama, LM Studio, vLLM, or any custom endpoint without needing a separate CLI binary.

- **Cloud Provider Catalog:**

  - Bundled with a snapshot of [models.dev](https\://models.dev) ([server/model-catalog/](../server/model-catalog/)) supporting OpenRouter, Fireworks AI, DeepSeek, Groq, Together AI, Mistral, xAI, Moonshot, Cerebras, and OpenAI.

### 5. Tools & Connectors

What tools can agents actually execute?

- **Local File & Command Tools:** Built into Claude CLI, Codex, and ACP engines. They can read/write files and execute bash commands within the project working directory.

- **External MCP (Model Context Protocol):** Fully implemented ([server/mcp-registry.ts](../server/mcp-registry.ts)). You can mount custom stdio or HTTP/SSE MCP servers in Settings, and ASTER passes them into the agent engine.

- **Browser Automation:** Fully implemented via `agent-browser` ([server/browser-engine.ts](../server/browser-engine.ts)), which downloads or connects to a dedicated Chromium instance to inspect DOM, click, fill forms, and take screenshots.

- **Computer-Use / GUI Desktop:** Functional via [chat-boat-tools.ts](../server/drivers/chat-boat-tools.ts) and [local-computer.ts](../server/local-computer.ts). Supports `screenshot`, `click`, `move`, `type_text`, `key_press`, and `scroll`. Operates on Cloud VMs ("boat"), local VMs (via `@trycua/cua-driver`), or host machines (macOS/Linux/Windows with proper OS permissions).

- **Composio SaaS Connectors:** Fully implemented via [server/composio.ts](../server/composio.ts). Agents can trigger authorized actions in Gmail, GitHub, Slack, etc.

- **Inter-Agent Delegations:** Agents can hand off tasks to teammates using `delegate_bot` or `coordinate_bots` ([server/room-handoffs.ts](../server/room-handoffs.ts)).

### 6. Backend Architecture & Runtime Topology

- Built on Node.js using native `node:http` (no Express framework) in [server/index.ts](../server/index.ts).

- Routes are organized into modular handlers ([server/routes/](../server/routes/)) returning `PASS` if a route is unhandled, backed by an inline legacy dispatch chain.

- **SSE Over WebSockets:** The live stream is `GET /api/events` ([server/sse-fanout.ts](../server/sse-fanout.ts)). SSE simplifies connection handling across firewalls, proxies, and tunnels, supporting reconnections via `Last-Event-ID`.

- **Zero-Build Development:** In dev mode, the backend runs directly via `node --experimental-strip-types server/index.ts`, executing TypeScript files without pre-compiling.

### 7. Memory & Conversations

- **Transcript Storage:** Transcripts are persisted in SQLite (`messages.db`) using Node 23.4+ built-in `node:sqlite` in Write-Ahead Logging mode (`WAL`) ([server/message-db.ts](../server/message-db.ts)).

- **Full-Text Search:** Thread search runs in a background worker thread (`message-search.worker.ts`) using SQLite FTS5 index tables.

- **Markdown Notes Workspace:**

  - `~/.openmausbot/workspaces/<botId>/MEMORY.md`: Core standing facts. The first 200 lines (or 24 KB) are injected into the agent's system prompt on every turn ([server/workspace.ts](../server/workspace.ts)).

  - `memory/<topic>.md`: Deep reference notes read on demand.

  - `memory/log/YYYY-MM-DD.md`: Daily audit trails.

- **Automated Memory Upkeep:** A background handler ([server/memory-upkeep.ts](../server/memory-upkeep.ts)) summarizes facts after 2 minutes of quiet time or every 6 turns, filing noticed facts into `MEMORY.md` or topic files.

- **Pre-Turn Recall:** [server/recall.ts](../server/recall.ts) automatically matches user query keywords against topic files and past conversation passages, prepending relevant snippets to the prompt.

### 8. Permissions, Approvals & Security

- **Approval Levels:** Configured per bot and per thread ([docs/approval-levels.md](../docs/approval-levels.md)):

  1. `Ask for approval`: Prompts user with an `ApprovalCard` for commands and file writes.

  2. `Auto-accept edits`: Automatically approves file modifications, but asks before terminal commands.

  3. `Approve for me`: Defers to the engine's built-in evaluator (Claude/Codex auto mode).

  4. `Full access`: Permissive execution mode (runs commands and edits without prompts). Restrictable only in packaged desktop builds.

  5. `Chief of Staff Elevation`: A designated Chief of Staff with Full Access automatically passes its permission grant down to delegate tasks.

- **Secret Redaction:** Everything a bot authors (replies, tool names, summaries, logs) is scanned by `redactSecretsInText()` ([server/redact.ts](../server/redact.ts)) before touching disk or database.

- **Credential Storage:**

  - **Packaged App:** Secrets are stored in `credentials.bin` using Electron's `safeStorage` (hardware/OS keychain: Apple Keychain, Windows DPAPI, or Linux Secret Service) ([electron/workspace-credentials.mjs](../electron/workspace-credentials.mjs)).

  - **API Safety:** Keys sent via `PUT /api/config` are **write-only**. `GET /api/config` returns only boolean indicators (`configured: true`).

### 9. Frontend, UI & Design Layer

- **Tech Stack:** React 19, Vite 7, Tailwind 4.

- **Theming & Liquid Glass:** Custom design system featuring an Apple Liquid Glass aesthetic ([src/styles.css](../src/styles.css)) with 8 skins (Midnight, Daylight, Dusk, Lagoon, Atelier, Foundry, Graphite, Linen). Glass blur sits on `::before` pseudo-layers to prevent `backdrop-filter` clipping bugs.

- **State Separation:** [src/state/store.tsx](../src/state/store.tsx) divides state into:

  - `StoreContext`: Main UI state, lists, dialogs, settings.

  - `StreamContext`: High-frequency streaming text chunks, ensuring that rapid token rendering does not re-render the sidebar or heavy parent views.

### 10. Limitations & Known Gaps in the Working Tree

- **Clef-Flash Catalog Verification:** The model string `@cf/cloudflare/clef-flash` in [server/decider/clef.ts](../server/decider/clef.ts) is experimental and not yet verified against Cloudflare's published Workers AI catalog.

- **Decider Scope:** The decider is currently used **only for room routing**. Envisioned tasks like UI element clicking and tool selection are not wired up to the decider.

- **Vite Proxy Mismatch:** [vite.config.ts](../vite.config.ts#L63) proxies `/.well-known/aster/environment`, but the backend only handles `/.well-known/openmausbot/environment`.

- **`jevConfigured` Flag Bug:** In [server/decider/index.ts:137](../server/decider/index.ts#L137), `jevConfigured` is incorrectly set only when *both* Jev and Clef are configured.

- **`isIdle` Thread Rendering Issue:** In [src/components/ChatView.tsx:709](../src/components/ChatView.tsx#L709), threads with bot messages but no user message can be hidden inadvertently.

- **Rebrand Residuals:** Because ASTER was forked from OpenMausBot, internal directories (`~/.openmausbot`), environment variables (`OMB_*`), and IPC methods (`window.ogb`) intentionally retain old names for backward compatibility.

---

## 4. Current Features Implementation Status Table

| Feature / Subsystem | Status | Primary Code Reference | Notes / Evidence |

|---|---|---|---|

| **1-on-1 Chat Streaming** | **Fully Implemented** | [src/components/ChatView.tsx](../src/components/ChatView.tsx), [server/sse-fanout.ts](../server/sse-fanout.ts) | Real-time token streaming over SSE with markdown & math rendering. |

| **Multi-Agent Group Rooms** | **Fully Implemented** | [src/components/GroupView.tsx](../src/components/GroupView.tsx), [server/store.ts](../server/store.ts) | Group chats with @mentions, leader fallbacks, and shared task logs. |

| **Decider: Jev (TypeSafe)** | **Fully Implemented** | [server/decider/jev.ts](../server/decider/jev.ts) | Probabilistic room routing via `https\://api.typesafe.ai/v1/systemone`. |

| **Decider: Clef-Flash (Cloudflare)** | **Partially Implemented** | [server/decider/clef.ts](../server/decider/clef.ts) | Functional API client with keep-alive pooling; model ID unconfirmed. |

| **Decider: Tool / Click Selection** | **Not Implemented** | [server/decider/index.ts](../server/decider/index.ts) | Architectural goal; no routes or calls currently connect it. |

| **Claude CLI Engine** | **Fully Implemented** | [server/drivers/claude.ts](../server/drivers/claude.ts) | Spawns `claude` CLI with `--output-format stream-json`. |

| **Codex App-Server Engine** | **Fully Implemented** | [server/drivers/codex.ts](../server/drivers/codex.ts) | JSON-RPC over stdio communicating with OpenAI Codex app-server. |

| **ACP Agent Engines (Gemini, Grok, Qwen, etc.)** | **Fully Implemented** | [server/drivers/acp/core.ts](../server/drivers/acp/core.ts) | Full Agent Client Protocol implementation over stdio. Requires local CLIs. |

| **Direct OpenAI-Compatible REST** | **Fully Implemented** | [server/drivers/openai-compat.ts](../server/drivers/openai-compat.ts) | Calls `/v1/chat/completions` directly without requiring any local CLI. |

| **External MCP Server Mounting** | **Fully Implemented** | [server/mcp-registry.ts](../server/mcp-registry.ts) | Custom stdio commands or SSE/HTTP servers mounted per agent. |

| **Browser Engine (`agent-browser`)** | **Fully Implemented** | [server/browser-engine.ts](../server/browser-engine.ts) | Headless/headed Chromium browser engine with profile session isolation. |

| **Computer-Use (GUI Automation)** | **Fully Implemented** | [server/drivers/chat-boat-tools.ts](../server/drivers/chat-boat-tools.ts), [server/local-computer.ts](../server/local-computer.ts) | Screenshots, clicks, typing, scrolling on Cloud VMs, local VMs, or OS host. |

| **Composio Connector Tools** | **Fully Implemented** | [server/composio.ts](../server/composio.ts) | SaaS app OAuth management and tool routing. |

| **SQLite Transcript Persistence** | **Fully Implemented** | [server/message-db.ts](../server/message-db.ts) | Uses native `node:sqlite` (`messages.db`) in WAL mode with FTS5 search. |

| **Markdown Workspace Memory** | **Fully Implemented** | [server/workspace.ts](../server/workspace.ts), [server/memory-store.ts](../server/memory-store.ts) | `MEMORY.md`, topic files, daily logs, and automatic memory upkeep. |

| **Automated Scheduled Routines** | **Fully Implemented** | [server/routines.ts](../server/routines.ts), [src/components/RoutineCalendarPage.tsx](../src/components/RoutineCalendarPage.tsx) | Cron/interval job runner via `croner`, with visual schedule calendar. |

| **OS Keychain Encryption** | **Fully Implemented** | [electron/workspace-credentials.mjs](../electron/workspace-credentials.mjs) | Encrypted storage (`credentials.bin`) via Electron `safeStorage`. |

| **Text-to-Speech (TTS) & Voice** | **Fully Implemented** | [server/tts/index.ts](../server/tts/index.ts) | Supports ElevenLabs, Fish Audio, Grok, Chatterbox, and OS system voices. |

| **Phone Companion Pairing** | **Fully Implemented** | [companion/src/index.ts](../companion/src/index.ts) | Standalone sidecar process (:8810) with HPKE encryption and QR pairing. |

| **Cloudflare Control Plane** | **Fully Implemented** | [cloudflare/control-plane/](../cloudflare/control-plane/) | Cloudflare Worker with Better Auth, D1 database, and tunnel routing. |

---

## 5. The Most Important Backend Files to Understand First

When you begin studying the backend code, read these 6 files in this order:

1. [server/contracts.ts](../server/contracts.ts)

   - **Why:** This is the bedrock type contract. It defines `ProviderDriver`, `SendTurnInput`, `RuntimeEvent`, `ApprovalMode`, and error shapes. Every single engine driver implements this contract.

2. [server/store.ts](../server/store.ts)

   - **Why:** The state management layer. Contains `BotRecord`, `TaskRecord`, `GroupRecord`, atomic file serialization (`writeFileAtomic`), and secret scrubbing.

3. [server/message-db.ts](../server/message-db.ts)

   - **Why:** The database engine. Demonstrates how to use Node's native `DatabaseSync` (`node:sqlite`) with WAL mode, FTS5 indexes, and lazy migrations from legacy JSON files.

4. [server/index.ts](../server/index.ts)

   - **Why:** The HTTP server entrypoint. Follow how requests enter, pass through authentication (`request-auth.ts`), invoke `startTurn()` (line 8601), and emit real-time updates over SSE.

5. [server/drivers/acp/core.ts](../server/drivers/acp/core.ts)

   - **Why:** Masterclass in subprocess IPC. Shows how to spawn an external agent CLI, establish a JSON-RPC session over `stdio`, handle permissions, manage idle timeouts, and gracefully handle crashes.

6. [server/decider/room-routing.ts](../server/decider/room-routing.ts)

   - **Why:** Illustrates how to build low-latency decision layers that evaluate multi-agent routing questions without blocking or crashing the primary turn.

---

## 6. Top 5 Technical Concepts You Can Learn From This Project

### 1. Zero-Dependency Embedded Databases with `node:sqlite`

- **What it is:** Instead of running a heavy PostgreSQL or MySQL server, or bundling native C++ bindings that break across Node versions, ASTER uses Node.js’s built-in `node:sqlite` module.

- **Why it matters:** It provides ACID transaction guarantees and fast full-text search (FTS5) with zero dependencies. Enabling **Write-Ahead Logging (WAL)** (`PRAGMA journal_mode = WAL`) allows concurrent readers without blocking writes.

### 2. Subprocess IPC over Stdio via JSON-RPC 2.0

- **What it is:** In [server/drivers/acp/core.ts](../server/drivers/acp/core.ts), ASTER controls external CLI tools (Gemini, Grok, Qwen) using `stdio` pipes (`child_process.spawn`).

- **Why it matters:** Rather than restarting the CLI binary on every single message (which incurs massive startup overhead), ASTER keeps the child process alive in an idle pool and sends JSON-RPC requests across its `stdin` while listening on `stdout`.

### 3. Real-Time Streaming via Server-Sent Events (SSE)

- **What it is:** Instead of complex bidirectional WebSockets, ASTER uses a unidirectional HTTP stream (`GET /api/events`) in [server/sse-fanout.ts](../server/sse-fanout.ts).

- **Why it matters:** SSE runs over plain HTTP/1.1 or HTTP/2, automatically works through reverse proxies and tunnels without WebSocket upgrade negotiations, and supports reconnection recovery with `Last-Event-ID`.

### 4. Human-in-the-Loop Asynchronous Turn Interruption

- **What it is:** Autonomous agents executing shell commands or modifying files must not run wild. ASTER implements a cooperative pause mechanism.

- **Why it matters:** When a tool requires approval, the driver pauses the turn execution promise and emits an SSE `request.opened` event. The UI displays an `ApprovalCard`. Only when the user submits approval via REST does the server resolve the pending promise and permit the command to run.

### 5. Architectural Separation of Presentation and State

- **What it is:** The frontend ([src/state/store.tsx](../src/state/store.tsx)) maintains two distinct React contexts: `StoreContext` and `StreamContext`.

- **Why it matters:** When an LLM streams tokens at 60 tokens per second, updating a unified state store would trigger re-renders across the whole application (sidebar, thread list, navigation). Splitting out `StreamContext` limits re-renders strictly to the active message bubble, keeping the UI silky smooth at 60 FPS.

---

## What ASTER can do right now

**ASTER is a functional, local-first multi-agent desktop platform.** 

Right now, you can create individual agents with custom system prompts, avatars, and tool privileges. You can chat with them using either locally installed AI CLIs (Claude Code, OpenAI Codex, or any ACP agent like Gemini, Grok, or Cursor) or remote OpenAI-compatible endpoints (Ollama, OpenRouter, vLLM). Agents can read and write files in their workspace, search your conversation history using SQLite full-text search, retain persistent memory in `MEMORY.md` notes, browse the web using a headless browser engine, and execute tasks on cron schedules. 

In multi-agent rooms, you can have teams of agents coordinate with one another, utilizing the Jev or Clef-Flash decision model to automatically route questions to the right specialist. When dangerous actions or shell commands are requested, ASTER reliably halts execution to prompt you for approval, keeping all sensitive credentials encrypted in your operating system's hardware keychain.
