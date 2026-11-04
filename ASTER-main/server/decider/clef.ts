// Cloudflare Clef-Flash decision model over Workers AI:
// POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/@cf/cloudflare/clef-flash
// with an Authorization: Bearer {API_TOKEN} header and { state, model, questions }.
//
// Clef-Flash accepts typed questions:
// - choice: instructions + criteria (map of option -> meaning)
// - score: instructions + criteria (list of levels)
// - noul (yes/no): instructions + criteria ({ true?: ..., false?: ... })
//
// Answers come back in Cloudflare's standard envelope:
// { success: true, result: { model?, answers: { [id]: answer }, usage?: { input_tokens } } }
// or directly as { model?, answers: { ... } }.
//
// Every answer is validated before acceptance: a choice must be one of the
// offered keys and the most likely option, probabilities numbers in [0, 1].
//
// Latency: most of a decision's time is the network, not the model. Measured
// against api.cloudflare.com, model work is ~100–150ms, while a fresh
// DNS+TCP+TLS setup cost 0.2s at the median and 4–14s in the tail on a lossy
// path. Node's global fetch only keeps an idle socket for 4s, and room
// messages arrive further apart than that, so nearly every decision paid a
// fresh handshake. Calls therefore go through one long-lived keep-alive
// dispatcher (CLEF_DISPATCHER), and `warmClefConnection` opens that socket
// ahead of the first decision.
import { Agent } from "undici";
import type {
  BackendRequest,
  BackendResult,
  ChoiceAnswer,
  DeciderAnswer,
  DeciderBackend,
  DeciderQuestion,
  ScoreAnswer,
  YesNoAnswer,
} from "./types.ts";

export const CLOUDFLARE_DEFAULT_BASE_URL = "https://api.cloudflare.com";
export const CLEF_FLASH_MODEL = "@cf/cloudflare/clef-flash";
export const CLEF_BODY_MODEL = "clef-flash";
export const CLEF_MAX_OPTIONS = 255;
export const CLEF_MIN_LEVELS = 2;
export const CLEF_MAX_LEVELS = 10;

/** How long an idle socket to Cloudflare is kept, and the ceiling when the
 * server hints a longer one. Measured: with a 120s idle timeout, one socket
 * served calls 6s and 30s apart; Node's default 4s reconnected 9 calls of 10
 * at 6s apart (median 2.3s → 0.9s). */
export const CLEF_KEEP_ALIVE_MS = 120_000;
const CLEF_KEEP_ALIVE_MAX_MS = 600_000;

// One pool for every Clef call in this process. Lazy, so a server that never
// uses Clef never opens it.
let dispatcher: Agent | undefined;
function clefDispatcher(): Agent {
  dispatcher ??= new Agent({
    keepAliveTimeout: CLEF_KEEP_ALIVE_MS,
    keepAliveMaxTimeout: CLEF_KEEP_ALIVE_MAX_MS,
    // Decisions are sequential per room; a few sockets cover concurrent rooms.
    connections: 4,
  });
  return dispatcher;
}

/** Open (or keep) the pooled connection to the Clef origin before a decision
 * needs it, so the first room message doesn't pay the handshake. A bodiless,
 * unauthenticated HEAD to a public path on the same origin: no key, no state.
 * Fire-and-forget; failures are ignored (the decision itself still handles
 * the network properly). */
export function warmClefConnection(baseUrl?: string | null): void {
  let origin: string;
  try {
    const root = new URL((baseUrl?.trim() || CLOUDFLARE_DEFAULT_BASE_URL));
    if (root.protocol !== "https:" && !(root.protocol === "http:" && isLoopback(root.hostname))) return;
    origin = root.origin;
  } catch {
    return;
  }
  void fetch(`${origin}/client/v4/ips`, {
    method: "HEAD",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    dispatcher: clefDispatcher(),
  } as RequestInit).then((response) => response.body?.cancel()).catch(() => undefined);
}

function isLoopback(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.startsWith("127.");
}

/** The endpoint for Cloudflare Workers AI execution:
 * https anywhere, plain http only to this machine (test double / local proxy). */
export function clefEndpoint(accountId?: string | null, baseUrl?: string | null): URL | null {
  const root = (baseUrl?.trim() || CLOUDFLARE_DEFAULT_BASE_URL).replace(/\/+$/, "");
  let url: URL;
  try {
    if (root.includes("/ai/run/")) {
      url = new URL(root);
    } else {
      const acct = accountId?.trim();
      if (!acct || !/^[a-zA-Z0-9_-]+$/.test(acct)) return null;
      url = new URL(`${root}/client/v4/accounts/${encodeURIComponent(acct)}/ai/run/${CLEF_FLASH_MODEL}`);
    }
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol === "https:") return url;
  return url.protocol === "http:" && isLoopback(url.hostname) ? url : null;
}

/** Questions within the API's limits: 2–255 options, 2–10 levels. */
export function questionsFit(questions: Record<string, DeciderQuestion>): boolean {
  const entries = Object.entries(questions);
  if (!entries.length) return false;
  return entries.every(([, question]) => {
    if (question.type === "choice") {
      const count = Object.keys(question.options).length;
      return count >= 2 && count <= CLEF_MAX_OPTIONS;
    }
    if (question.type === "score") return question.levels.length >= CLEF_MIN_LEVELS && question.levels.length <= CLEF_MAX_LEVELS;
    return true;
  });
}

type WireQuestion =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] }
  | { type: "noul"; instructions: string; criteria?: { true?: string; false?: string } };

export function clefRequestBody(state: unknown, questions: Record<string, DeciderQuestion>) {
  const wire: Record<string, WireQuestion> = {};
  for (const [id, question] of Object.entries(questions)) {
    if (question.type === "choice") {
      wire[id] = { type: "choice", instructions: question.instructions, criteria: { ...question.options } };
    } else if (question.type === "score") {
      wire[id] = { type: "score", instructions: question.instructions, criteria: [...question.levels] };
    } else {
      const criteria = question.criteria?.yes || question.criteria?.no
        ? { ...(question.criteria.yes ? { true: question.criteria.yes } : {}), ...(question.criteria.no ? { false: question.criteria.no } : {}) }
        : undefined;
      wire[id] = { type: "noul", instructions: question.instructions, ...(criteria ? { criteria } : {}) };
    }
  }
  return { state, model: CLEF_BODY_MODEL, questions: wire };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isProbability = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

const SUM_TOLERANCE = 0.1;
const EPSILON = 1e-9;

function parseChoice(raw: Record<string, unknown>, question: Extract<DeciderQuestion, { type: "choice" }>): ChoiceAnswer | null {
  const offered = new Set(Object.keys(question.options));
  const choice = typeof raw.choice === "string" ? raw.choice : typeof raw.selected === "string" ? raw.selected : null;
  if (!choice || !offered.has(choice)) return null;

  const probabilities: Record<string, number> = {};
  if (isRecord(raw.probabilities)) {
    let sum = 0;
    for (const [key, value] of Object.entries(raw.probabilities)) {
      if (!offered.has(key) || !isProbability(value)) return null;
      probabilities[key] = value;
      sum += value;
    }
    if (!(Math.abs(sum - 1) <= SUM_TOLERANCE)) return null;
  } else if (typeof raw.confidence === "number" && isProbability(raw.confidence)) {
    const conf = raw.confidence;
    const remaining = Math.max(0, 1 - conf);
    const otherKeys = Object.keys(question.options).filter((k) => k !== choice);
    probabilities[choice] = conf;
    const perOther = otherKeys.length ? remaining / otherKeys.length : 0;
    for (const k of otherKeys) probabilities[k] = perOther;
  } else {
    return null;
  }

  const pTop = probabilities[choice];
  if (pTop === undefined) return null;
  const others = Object.entries(probabilities).filter(([key]) => key !== choice).map(([, value]) => value);
  const runnerUp = others.length ? Math.max(...others) : 0;
  if (runnerUp > pTop + EPSILON) return null;
  return { type: "choice", choice, pTop, margin: pTop - runnerUp, probabilities };
}

function parseScore(raw: Record<string, unknown>, question: Extract<DeciderQuestion, { type: "score" }>): ScoreAnswer | null {
  const levels = question.levels.length;
  const score = raw.score;
  if (typeof score !== "number" || !Number.isFinite(score) || score < -EPSILON || score > levels - 1 + EPSILON) return null;

  const probabilities = Array.from({ length: levels }, () => 0);
  if (Array.isArray(raw.probabilities)) {
    if (raw.probabilities.length !== levels) return null;
    for (let i = 0; i < levels; i++) {
      const val = raw.probabilities[i];
      if (!isProbability(val)) return null;
      probabilities[i] = val;
    }
  } else if (isRecord(raw.probabilities)) {
    for (const [key, value] of Object.entries(raw.probabilities)) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index >= levels || String(index) !== key || !isProbability(value)) return null;
      probabilities[index] = value;
    }
  } else {
    return null;
  }

  const sum = probabilities.reduce((total, value) => total + value, 0);
  if (!(Math.abs(sum - 1) <= SUM_TOLERANCE)) return null;
  const level = probabilities.indexOf(Math.max(...probabilities));
  return { type: "score", score, level, probabilities };
}

function parseYesNo(raw: Record<string, unknown>): YesNoAnswer | null {
  const p = isProbability(raw.noul) ? raw.noul
    : isProbability(raw.p) ? raw.p
    : isProbability(raw.probability) ? raw.probability
    : null;
  return p !== null ? { type: "yesno", p } : null;
}

const WIRE_TYPE = { choice: "choice", score: "score", yesno: "noul" } as const;

/** Strictly decode one response body against the questions that were asked. */
export function parseClefResponse(
  body: unknown,
  questions: Record<string, DeciderQuestion>,
): { ok: true; answers: Record<string, DeciderAnswer>; inputTokens?: number; model?: string } | { ok: false } {
  if (!isRecord(body)) return { ok: false };
  let payload: Record<string, unknown> = body;
  if ("result" in body && isRecord(body.result)) {
    if (body.success === false) return { ok: false };
    payload = body.result;
  }
  if (!isRecord(payload.answers)) return { ok: false };
  const answers: Record<string, DeciderAnswer> = {};
  for (const [id, question] of Object.entries(questions)) {
    const raw = payload.answers[id];
    if (!isRecord(raw)) return { ok: false };
    if (raw.type !== undefined && raw.type !== WIRE_TYPE[question.type] && (question.type !== "yesno" || raw.type !== "yesno")) {
      return { ok: false };
    }
    const parsed = question.type === "choice" ? parseChoice(raw, question)
      : question.type === "score" ? parseScore(raw, question)
        : parseYesNo(raw);
    if (!parsed) return { ok: false };
    answers[id] = parsed;
  }
  const usage = isRecord(payload.usage) ? payload.usage.input_tokens : isRecord(body.usage) ? body.usage.input_tokens : undefined;
  const inputTokens = typeof usage === "number" && Number.isFinite(usage) && usage >= 0 ? usage : undefined;
  const model = typeof payload.model === "string" && payload.model.length <= 80 ? payload.model
    : typeof body.model === "string" && body.model.length <= 80 ? body.model : undefined;
  return { ok: true, answers, ...(inputTokens !== undefined ? { inputTokens } : {}), ...(model ? { model } : {}) };
}

function refusal(status: number): BackendResult {
  if (status === 401 || status === 403) return { ok: false, reason: "rejected", status };
  if (status === 429) return { ok: false, reason: "rate_limited", status };
  if (status === 500 || status === 502 || status === 503 || status === 529) return { ok: false, reason: "overloaded", status };
  return { ok: false, reason: "http_error", status };
}

const ms = (from: number, to: number) => Math.max(0, Math.round(to - from));

async function decide(request: BackendRequest): Promise<BackendResult> {
  const endpoint = clefEndpoint(request.accountId, request.baseUrl);
  if (!endpoint || !questionsFit(request.questions)) return { ok: false, reason: "misconfigured" };
  const fetchImpl = request.fetch ?? fetch;
  // Timing only: durations in ms, never the key, the state or the answers.
  const started = performance.now();
  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${request.key}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(clefRequestBody(request.state, request.questions)),
      signal: request.signal,
      redirect: "error",
      // The shared keep-alive pool (see the top of this file). A test double
      // passed as `request.fetch` simply ignores it.
      dispatcher: clefDispatcher(),
    } as RequestInit);
  } catch {
    return { ok: false, reason: "unreachable", timing: { requestMs: ms(started, performance.now()) } };
  }
  // Headers in: connection + upload + model + first byte.
  const headersAt = performance.now();
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return { ...refusal(response.status), timing: { requestMs: ms(started, headersAt) } };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, reason: "malformed", timing: { requestMs: ms(started, headersAt), responseMs: ms(headersAt, performance.now()) } };
  }
  const bodyAt = performance.now();
  const parsed = parseClefResponse(body, request.questions);
  const timing = { requestMs: ms(started, headersAt), responseMs: ms(headersAt, bodyAt), parseMs: ms(bodyAt, performance.now()) };
  return parsed.ok ? { ...parsed, timing } : { ok: false, reason: "malformed", timing };
}

export const clefBackend: DeciderBackend = { id: "clef-flash", decide };
