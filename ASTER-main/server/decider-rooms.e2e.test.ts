import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { removeTempDir, waitForExit } from "./testing/cleanup.ts";
import { freePortBlock } from "./testing/ports.ts";

// Auto rooms end to end: a real server and fake engine CLIs, with the
// decision model pointed at a fake Jev-compatible endpoint on this machine
// (decider.baseUrl). Nothing here reaches the real Jev API. The key reaches
// the server only through its env, the way the desktop shell delivers it.

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SERVER_DIR, "..");
const FAKE_CLAUDE = join(SERVER_DIR, "testing", "fake-claude-cli.ts");
const KEY = "tsk_e2e_secret_value_7f3a9c2e41d8";

type JevRequest = { auth?: string; body: any; url?: string };
type RouteScript = { status?: number; choice?: string; p?: number; hold?: Promise<void> };

let child: ChildProcess;
let jev: Server;
let home = "";
let data = "";
let base = "";
let output = "";
let engineDump = "";
let titleDump = "";
let fallbackTitleDump = "";
const jevRequests: JevRequest[] = [];
let script: RouteScript = {};

const routeRequests = () => jevRequests.filter((request) => request.body?.questions?.answer?.type === "choice");
const keyChecks = () => jevRequests.filter((request) => request.body?.questions?.answer?.type === "noul");

const api = async (method: string, path: string, body?: unknown): Promise<{ status: number; body: any; text: string }> => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, text };
};

beforeAll(async () => {
  jev = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", async () => {
      const body = JSON.parse(raw || "{}");
      jevRequests.push({ auth: req.headers.authorization, body, url: req.url });
      const send = (status: number, value: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(value));
      };
      const question = body.questions?.answer;
      // Cloudflare Workers AI, for the Clef-Flash provider: the same script
      // answers, in Cloudflare's envelope. `/client/v4/ips` is the warm-up.
      if (req.url === "/client/v4/ips") return send(200, { success: true, result: {} });
      if (req.url?.startsWith("/client/v4/accounts/")) {
        if (req.url !== "/client/v4/accounts/acct_e2e/ai/run/@cf/cloudflare/clef-flash" || !question || question.type !== "choice") {
          return send(422, { success: false, errors: [{ message: "bad request shape" }] });
        }
        const current = script;
        if (current.status && current.status !== 200) return send(current.status, { success: false, errors: [{ message: "overloaded" }] });
        const keys = Object.keys(question.criteria);
        const choice = current.choice!;
        const rest = keys.filter((key) => key !== choice);
        const probabilities = Object.fromEntries([[choice, current.p], ...rest.map((key) => [key, Math.round(((1 - current.p!) / rest.length) * 1000) / 1000])]);
        return send(200, { success: true, result: { model: "clef-flash", answers: { answer: { type: "choice", choice, probabilities } }, usage: { input_tokens: 610 } } });
      }
      if (req.url !== "/v1/systemone" || body.model !== "jev-latest" || !question) return send(422, { detail: "bad request shape" });
      if (question.type === "noul") {
        return req.headers.authorization === "Bearer tsk_bad"
          ? send(401, { detail: `invalid key ${req.headers.authorization}` })
          : send(200, { model: "jev-1.13.0", answers: { answer: { type: "noul", noul: 0.96 } }, usage: { input_tokens: 40 } });
      }
      const current = script;
      if (current.hold) await current.hold;
      if (current.status && current.status !== 200) return send(current.status, { detail: "overloaded" });
      const keys = Object.keys(question.criteria);
      const choice = current.choice!;
      const other = keys.find((key) => key !== choice)!;
      send(200, {
        model: "jev-1.13.0",
        answers: { answer: { type: "choice", choice, confidence: current.p, probabilities: { [choice]: current.p, [other]: Math.round((1 - current.p!) * 100) / 100 } } },
        usage: { input_tokens: 700 },
      });
    });
  });
  await new Promise<void>((resolve) => jev.listen(0, "127.0.0.1", resolve));
  const jevUrl = `http://127.0.0.1:${(jev.address() as AddressInfo).port}`;

  home = mkdtempSync(join(tmpdir(), "omb-decider-rooms-"));
  data = join(home, ".openmausbot");
  const staticDir = join(home, "static");
  mkdirSync(data, { recursive: true });
  mkdirSync(join(staticDir, "assets"), { recursive: true });
  writeFileSync(join(staticDir, "index.html"), "<!doctype html><title>Decider rooms test</title>");
  writeFileSync(join(staticDir, "assets", "smoke.css"), "body{}");
  engineDump = join(home, "engine-dump.json");
  titleDump = join(home, "title-dump.json");
  fallbackTitleDump = join(home, "fallback-title-dump.json");
  const titleFile = join(home, "title.txt");
  writeFileSync(titleFile, "Safari footer fix");
  writeFileSync(join(data, "config.json"), JSON.stringify({
    // a room task's first message is titled by the engine of whoever answers it
    features: { llmThreadTitles: true },
    instances: {
      quick: {
        driver: "claudeAgent", displayName: "Quick fixture", config: { cli: FAKE_CLAUDE },
        environment: { FAKE_CLAUDE_MODE: "happy", FAKE_CLAUDE_DUMP: engineDump, FAKE_CLAUDE_TEXT_DUMP: fallbackTitleDump, FAKE_CLAUDE_TEXT_FILE: titleFile },
      },
      titled: {
        driver: "claudeAgent", displayName: "Titled fixture", config: { cli: FAKE_CLAUDE },
        environment: { FAKE_CLAUDE_MODE: "happy", FAKE_CLAUDE_TEXT_DUMP: titleDump, FAKE_CLAUDE_TEXT_FILE: titleFile },
      },
    },
    decider: { enabled: true, baseUrl: jevUrl, jobs: { roomRouting: true } },
  }));
  const port = await freePortBlock([0, 1]);
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [join(SERVER_DIR, "index.ts")], {
    cwd: ROOT,
    env: {
      ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
      ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
      HOME: home,
      USERPROFILE: home,
      OMB_PORT: String(port),
      OMB_WEBHOOK_PORT: String(port + 1),
      OMB_STATIC_DIR: staticDir,
      OMB_JEV_API_KEY: KEY,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout!.on("data", (chunk) => (output += chunk));
  child.stderr!.on("data", (chunk) => (output += chunk));
  const deadline = Date.now() + 20_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`server exited ${child.exitCode}: ${output}`);
    try {
      if ((await fetch(`${base}/api/health`)).status === 200) break;
    } catch {
      // still starting
    }
    if (Date.now() >= deadline) throw new Error(`server never became healthy: ${output}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}, 30_000);

afterAll(async () => {
  if (child) await waitForExit(child, { signal: "SIGTERM" });
  await new Promise<void>((resolve) => (jev ? jev.close(() => resolve()) : resolve()));
  if (home) await removeTempDir(home);
});

type RoomMessage = { id: string; kind: string; role: string; text?: string; from?: { botId: string; name: string }; tool?: { name: string; ok?: boolean }; routedBy?: { provider: string; probability: number } };

const roomState = async (roomId: string) => {
  const state = (await api("GET", "/api/bots?messages=200")).body;
  const room = state.groups.find((group: { id: string }) => group.id === roomId);
  return { room, messages: (room?.messages ?? []) as RoomMessage[] };
};

/** Send one plain message and wait for the round to settle; returns what the
 * bots said in it (the first text line of each speaker). */
async function round(roomId: string, text: string): Promise<{ post: any; replies: RoomMessage[] }> {
  const before = new Set((await roomState(roomId)).messages.map((message) => message.id));
  const post = await api("POST", `/api/groups/${roomId}/messages`, { text });
  expect(post.status).toBe(202);
  let replies: RoomMessage[] = [];
  await expect.poll(async () => {
    const { room, messages } = await roomState(roomId);
    replies = messages.filter((message) => !before.has(message.id) && message.kind === "text" && message.role === "bot");
    return !room?.working && replies.length > 0;
  }, { timeout: 20_000, interval: 150 }).toBe(true);
  const firstBySpeaker = new Map<string, RoomMessage>();
  for (const reply of replies) if (!firstBySpeaker.has(reply.from!.botId)) firstBySpeaker.set(reply.from!.botId, reply);
  return { post: post.body, replies: [...firstBySpeaker.values()] };
}

describe("Auto rooms ask the decision model who answers", { timeout: 90_000 }, () => {
  let room: { id: string };
  const bots: Record<string, { id: string }> = {};

  it("reports only booleans in the config, and new rooms default to Auto", async () => {
    const config = await api("GET", "/api/config");
    expect(config.body.decider).toEqual({ provider: "jev", configured: true, enabled: true, jevConfigured: true, jobs: { roomRouting: true } });
    expect(config.text).not.toContain(KEY);

    for (const name of ["Maya", "Theo", "Ravi"]) {
      bots[name] = (await api("POST", "/api/bots", {
        name, title: `${name} title`, modelSelection: { instanceId: name === "Theo" ? "titled" : "quick", model: "claude-sonnet-5" }, requireAvailableModel: true,
      })).body.bot;
    }
    const created = await api("POST", "/api/groups", { name: "Launch", memberIds: [bots.Maya!.id, bots.Theo!.id, bots.Ravi!.id] });
    expect(created.body.group.defaultResponder).toEqual({ kind: "auto" });
    const setup = await api("PATCH", `/api/groups/${created.body.group.id}/setup`, { action: "complete", cwd: null, bulletin: "", defaultResponder: { kind: "auto" } });
    expect(setup.status).toBe(200);
    expect(setup.body.group.defaultResponder).toEqual({ kind: "auto" });
    room = created.body.group;
  });

  it("the Test action makes one tiny call and never echoes the key", async () => {
    const saved = await api("POST", "/api/decider/test", {});
    expect(saved.body).toMatchObject({ ok: true });
    expect(keyChecks().at(-1)?.auth).toBe(`Bearer ${KEY}`);
    const draft = await api("POST", "/api/decider/test", { key: "tsk_bad" });
    expect(draft.body).toEqual({ ok: false, reason: "rejected", status: 401 });
    expect(saved.text + draft.text).not.toContain(KEY);
  });

  it("a confident pick answers alone, and the send does not wait for the decision", async () => {
    let release!: () => void;
    script = { choice: bots.Theo!.id, p: 0.94, hold: new Promise<void>((resolve) => (release = resolve)) };
    const asked = routeRequests().length;
    const text = "The signup button overlaps the footer on Safari mobile.";
    const sent = api("POST", `/api/groups/${room.id}/messages`, { text });
    // Jev has the question and is holding its answer: the send has already
    // been answered and the message appended, synchronously, before it
    await expect.poll(() => routeRequests().length, { timeout: 5_000 }).toBe(asked + 1);
    const early = await Promise.race([sent, new Promise<"still waiting">((resolve) => setTimeout(() => resolve("still waiting"), 1_000))]);
    expect(early).not.toBe("still waiting");
    expect((early as Awaited<typeof sent>).status).toBe(202);
    expect((early as Awaited<typeof sent>).body.message).toMatchObject({ role: "user", text });
    expect((await roomState(room.id)).messages.some((message) => message.role === "user" && message.text === text)).toBe(true);
    release();
    let replies: RoomMessage[] = [];
    await expect.poll(async () => {
      const { room: current, messages } = await roomState(room.id);
      replies = messages.filter((message) => message.kind === "text" && message.role === "bot");
      return !current?.working && replies.length > 0;
    }, { timeout: 20_000, interval: 150 }).toBe(true);
    expect([...new Set(replies.map((reply) => reply.from!.name))]).toEqual(["Theo"]);
    expect(replies[0]!.routedBy).toEqual({ provider: "jev", probability: 0.94 });
    expect(replies.slice(1).every((reply) => reply.routedBy === undefined)).toBe(true);
    // the task title came from the chosen responder's engine, not the fallback's
    await expect.poll(() => existsSync(titleDump), { timeout: 10_000 }).toBe(true);
    expect(existsSync(fallbackTitleDump)).toBe(false);

    const request = routeRequests().at(-1)!;
    expect(request.auth).toBe(`Bearer ${KEY}`);
    expect(Object.keys(request.body.questions.answer.criteria)).toEqual([bots.Maya!.id, bots.Theo!.id, bots.Ravi!.id, "__everyone__", "__nobody__"]);
    expect(request.body.questions.answer.criteria[bots.Theo!.id]).toMatch(/^Theo, Theo title bot\./);
    expect(request.body.state.new_message.text).toBe("The signup button overlaps the footer on Safari mobile.");
    expect(request.body.state.bots_in_room).toEqual(["Maya", "Theo", "Ravi"]);
  });

  it("__everyone__ sends it to every member, each reply marked", async () => {
    script = { choice: "__everyone__", p: 0.9 };
    const { replies } = await round(room.id, "Everyone, post your status for Friday's launch.");
    expect(replies.map((reply) => reply.from!.name).sort()).toEqual(["Maya", "Ravi", "Theo"]);
    expect(replies.every((reply) => reply.routedBy?.probability === 0.9)).toBe(true);
  });

  it("an unsure answer falls back to the room's lead (its first member), unmarked", async () => {
    script = { choice: bots.Ravi!.id, p: 0.41 };
    const { replies } = await round(room.id, "hmm, what do we think?");
    expect(replies.map((reply) => reply.from!.name)).toEqual(["Maya"]);
    expect(replies[0]!.routedBy).toBeUndefined();
  });

  it("a sure __nobody__ means no bot answers, and the room says so", async () => {
    script = { choice: "__nobody__", p: 0.95 };
    const before = new Set((await roomState(room.id)).messages.map((message) => message.id));
    const post = await api("POST", `/api/groups/${room.id}/messages`, { text: "thanks all, that's everything for today" });
    expect(post.status).toBe(202);
    let added: RoomMessage[] = [];
    await expect.poll(async () => {
      const { room: current, messages } = await roomState(room.id);
      added = messages.filter((message) => !before.has(message.id) && message.role === "bot");
      return !current?.working && added.some((message) => message.kind === "activity");
    }, { timeout: 20_000, interval: 150 }).toBe(true);
    // a beat for any turn that might still start: none does
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const { messages } = await roomState(room.id);
    const replies = messages.filter((message) => !before.has(message.id) && message.role === "bot" && message.kind === "text");
    expect(replies).toEqual([]);
    expect(added.find((message) => message.kind === "activity")!.tool?.name).toMatch(/No bot replied/);
  });

  it("an unsure __nobody__ is not silence: the room's lead answers", async () => {
    script = { choice: "__nobody__", p: 0.7 };
    const { replies } = await round(room.id, "ok noted, anything else on the launch?");
    expect(replies.map((reply) => reply.from!.name)).toEqual(["Maya"]);
    expect(replies[0]!.routedBy).toBeUndefined();
  });

  it("a pick that is not a member of this room is ignored: the lead answers, nobody else", async () => {
    script = { choice: "bot-from-another-room", p: 0.99 };
    const { replies } = await round(room.id, "Who owns the pricing page copy?");
    expect(replies.map((reply) => reply.from!.name)).toEqual(["Maya"]);
    expect(replies[0]!.routedBy).toBeUndefined();
  });

  it("a failing decision model falls back too", async () => {
    script = { status: 529 };
    const { replies } = await round(room.id, "Stripe webhooks return 500 since the deploy.");
    expect(replies.map((reply) => reply.from!.name)).toEqual(["Maya"]);
    expect(replies[0]!.routedBy).toBeUndefined();
  });

  it("with Clef-Flash as the decision model, Clef's pick is the only bot that answers", async () => {
    const token = "cf_e2e_token_routing_only";
    const switched = await api("PUT", "/api/config", { decider: { provider: "clef-flash", cloudflareToken: token, cloudflareAccountId: "acct_e2e" } });
    expect(switched.status).toBe(200);
    expect(switched.body.decider).toMatchObject({ provider: "clef-flash", enabled: true, configured: true });
    try {
      script = { choice: bots.Ravi!.id, p: 0.91 };
      const asked = jevRequests.length;
      const { replies } = await round(room.id, "Our usage API p95 jumped to 2s after the deploy.");
      expect(replies.map((reply) => reply.from!.name)).toEqual(["Ravi"]);
      expect(replies[0]!.routedBy).toEqual({ provider: "clef-flash", probability: 0.91 });
      const clefCalls = jevRequests.slice(asked).filter((request) => request.url?.includes("/ai/run/"));
      expect(clefCalls).toHaveLength(1);
      expect(clefCalls[0]!.url).toBe("/client/v4/accounts/acct_e2e/ai/run/@cf/cloudflare/clef-flash");
      expect(clefCalls[0]!.auth).toBe(`Bearer ${token}`);
      expect(Object.keys(clefCalls[0]!.body.questions.answer.criteria)).toEqual([bots.Maya!.id, bots.Theo!.id, bots.Ravi!.id, "__everyone__", "__nobody__"]);
      // the credential never reaches the room or the model's prompt
      expect(JSON.stringify(clefCalls[0]!.body)).not.toContain(token);
      expect(JSON.stringify((await roomState(room.id)).messages)).not.toContain(token);

      // Clef's "nobody", when sure, keeps every bot quiet
      script = { choice: "__nobody__", p: 0.97 };
      const before = new Set((await roomState(room.id)).messages.map((message) => message.id));
      expect((await api("POST", `/api/groups/${room.id}/messages`, { text: "great, thanks everyone" })).status).toBe(202);
      await expect.poll(async () => {
        const { room: current, messages } = await roomState(room.id);
        return !current?.working && messages.some((message) => !before.has(message.id) && message.kind === "activity");
      }, { timeout: 20_000, interval: 150 }).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      expect((await roomState(room.id)).messages.filter((message) => !before.has(message.id) && message.kind === "text" && message.role === "bot")).toEqual([]);
    } finally {
      await api("PUT", "/api/config", { decider: { provider: "jev", cloudflareToken: "", cloudflareAccountId: "" } });
    }
  });

  it("an @mention bypasses the decision model", async () => {
    script = { choice: bots.Maya!.id, p: 0.99 };
    const asked = routeRequests().length;
    const { replies } = await round(room.id, "@Ravi can you check the usage API latency?");
    expect(replies.map((reply) => reply.from!.name)).toEqual(["Ravi"]);
    expect(replies[0]!.routedBy).toBeUndefined();
    expect(routeRequests().length).toBe(asked);
  });

  it("a lead-mode room never asks", async () => {
    expect((await api("PATCH", `/api/groups/${room.id}`, { defaultResponder: { kind: "member", botId: bots.Theo!.id } })).status).toBe(200);
    const asked = routeRequests().length;
    const { replies } = await round(room.id, "Rewrite the launch email.");
    expect(replies.map((reply) => reply.from!.name)).toEqual(["Theo"]);
    expect(routeRequests().length).toBe(asked);
    expect((await api("PATCH", `/api/groups/${room.id}`, { defaultResponder: { kind: "auto", fallbackBotId: bots.Ravi!.id } })).body.group.defaultResponder)
      .toEqual({ kind: "auto", fallbackBotId: bots.Ravi!.id });
  });

  it("engines never see the key; the decision log holds no text and no key", async () => {
    expect(existsSync(engineDump)).toBe(true);
    const dump = readFileSync(engineDump, "utf8");
    expect(JSON.parse(dump).env).not.toHaveProperty("OMB_JEV_API_KEY");
    expect(dump).not.toContain(KEY);
    const dir = join(data, "decider-log");
    const log = readdirSync(dir).map((name) => readFileSync(join(dir, name), "utf8")).join("");
    const rows = log.trim().split("\n").map((line) => JSON.parse(line));
    expect(rows.some((row) => row.seam === "roomRouting" && row.ok && row.choice === bots.Theo!.id)).toBe(true);
    expect(rows.some((row) => row.seam === "roomRouting" && !row.ok && row.reason === "overloaded")).toBe(true);
    expect(log).not.toContain(KEY);
    expect(log).not.toContain("Safari");
    expect(output).not.toContain(KEY);
  });

  it("saving a key turns it on with the room job; a rejected key is not saved", async () => {
    const off = await api("PUT", "/api/config", { decider: { enabled: false, jobs: { roomRouting: false } } });
    expect(off.body.decider).toMatchObject({ enabled: false, jobs: { roomRouting: false } });
    const rejected = await api("PUT", "/api/config", { decider: { key: "tsk_bad" } });
    expect(rejected.status).toBe(400);
    expect((await api("GET", "/api/config")).body.decider).toMatchObject({ enabled: false });
    // the desktop's path: the key goes to its encrypted store, config.json keeps an empty placeholder
    const saved = await api("PUT", "/api/config?secretStorage=external", { decider: { key: "tsk_new_valid_key" } });
    expect(saved.status).toBe(200);
    expect(saved.body.decider).toEqual({ provider: "jev", configured: true, enabled: true, jevConfigured: true, jobs: { roomRouting: true } });
    expect(keyChecks().at(-1)?.auth).toBe("Bearer tsk_new_valid_key");
    expect(saved.text).not.toContain("tsk_new_valid_key");
    const disk = readFileSync(join(data, "config.json"), "utf8");
    expect(JSON.parse(disk).decider).toMatchObject({ key: "", enabled: true, jobs: { roomRouting: true } });
    expect(disk).not.toContain("tsk_new_valid_key");
    expect((await api("PUT", "/api/config", { decider: { key: "" } })).body.decider).toMatchObject({ configured: false, enabled: false });
  });

  it("the desktop's Clef save — token to the encrypted store, then the Account ID — turns Clef on without a plaintext token", async () => {
    const token = "cf_e2e_token_never_on_disk";
    expect((await api("PUT", "/api/config", { decider: { provider: "clef-flash" } })).status).toBe(200);
    // credential:set sends the token alone; with no Account ID yet it is kept, not refused
    const tokenSaved = await api("PUT", "/api/config?secretStorage=external", { decider: { cloudflareToken: token } });
    expect(tokenSaved.status).toBe(200);
    expect(tokenSaved.body.decider).toMatchObject({ provider: "clef-flash", enabled: false });
    expect(tokenSaved.text).not.toContain(token);
    // then the panel saves the Account ID with the provider, which completes the pair and switches it on
    const accountSaved = await api("PUT", "/api/config", { decider: { cloudflareAccountId: "acct_e2e", provider: "clef-flash" } });
    expect(accountSaved.status).toBe(200);
    expect(accountSaved.body.decider).toMatchObject({ provider: "clef-flash", enabled: true, jobs: { roomRouting: true } });
    const disk = readFileSync(join(data, "config.json"), "utf8");
    expect(JSON.parse(disk).decider).toMatchObject({ provider: "clef-flash", cloudflareToken: "", cloudflareAccountId: "acct_e2e", enabled: true });
    expect(disk).not.toContain(token);
    expect((await api("GET", "/api/config")).text).not.toContain(token);
    // switching it on explicitly without a token is still refused
    expect((await api("PUT", "/api/config", { decider: { cloudflareToken: "" } })).body.decider).toMatchObject({ enabled: false });
    const refused = await api("PUT", "/api/config", { decider: { enabled: true } });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toBe("Save a Cloudflare Account ID and API token before turning on Clef-Flash.");
  });
});
