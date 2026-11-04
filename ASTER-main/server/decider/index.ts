// The decision model: a fast classifier that picks among options OpenMausBot
// already knows (which bot answers a room message, and later which element
// to click or which tools to mount) in a few hundred milliseconds, before
// any engine turn starts. It never does the work itself.
//
// Modelled on server/tts/index.ts: a key-free status for Settings, a key
// check, and one module per vendor behind a common shape, so another backend
// (a local Jev-compatible server through `baseUrl`, an LLM) plugs in here
// without touching a caller.
//
// The contract every caller relies on: it NEVER throws into a turn. No key,
// the switch off, the job off, a timeout, an HTTP error, an overloaded
// vendor, a malformed answer: each comes back as { ok: false, reason } and
// the caller does exactly what it did before this module existed.
//
// On a Cloud Pro home, decisions are included: with no Jev key of the
// person's own, the Admin's relay token (included-services.ts) is used, only
// ever with the relay's URL and only for the requests the relay accepts
// (relay.ts), and the switch counts as on until turned off.
import type { AppConfig } from "../config.ts";
import { deciderCredential } from "../included-services.ts";
import { jevBackend } from "./jev.ts";
import { clefBackend, warmClefConnection } from "./clef.ts";
import { appendDeciderLog, stateHash } from "./log.ts";
import { KEY_CHECK_QUESTION, KEY_CHECK_STATE, relayAccepts, relaySeam } from "./relay.ts";
import type {
  Answers, AskOptions, BackendResult, ChoiceAnswer, ChoiceQuestion, DeciderBackend, DeciderFailure, DeciderJob,
  DeciderProvider, DeciderQuestion, DeciderResult, DeciderSeam, ScoreAnswer, YesNoAnswer,
} from "./types.ts";

export { DECIDER_JOBS } from "./types.ts";

/** Used when a caller passes no timeout. Room routing passes its own. */
export const DEFAULT_DECIDER_TIMEOUT_MS = 1_500;
/** The Settings key check is one tiny call a person is waiting on. */
export const KEY_CHECK_TIMEOUT_MS = 10_000;
const MIN_TIMEOUT_MS = 50;
const MAX_TIMEOUT_MS = 30_000;

/** A request the switches never let through. */
const offBackend: { id: "off"; decide(): Promise<BackendResult> } = {
  id: "off",
  decide: async () => ({ ok: false, reason: "disabled" }),
};
const BACKENDS: Record<DeciderProvider, DeciderBackend> = { jev: jevBackend, "clef-flash": clefBackend };

type DeciderConfig = NonNullable<AppConfig["decider"]>;

export function deciderProvider(cfg: AppConfig): DeciderProvider | "off" {
  const env = process.env.DECIDER_PROVIDER?.trim() || process.env.OMB_DECIDER_PROVIDER?.trim();
  const raw = env || cfg.decider?.provider || "jev";
  const provider = raw === "clef" || raw === "clef-flash" || raw === "cloudflare" ? "clef-flash" : raw;
  return provider in BACKENDS ? (provider as DeciderProvider) : "off";
}

export interface DeciderAccountResolved {
  token: string;
  api: string;
  accountId?: string;
  included: boolean;
}

/** The key a call uses and the one base URL it goes to: the person's own
 * (a draft being tested, else the config value or the desktop's encrypted
 * store handed over as env) with `decider.baseUrl` or Jev's own, else Cloud
 * Pro's included token with the Admin's relay, but only where the relay
 * accepts that seam: any other job has only an own key. Resolved on every
 * call. */
export function deciderAccount(
  cfg: AppConfig,
  seam?: DeciderSeam,
  draft?: string,
  explicitProvider?: DeciderProvider,
  draftAccountId?: string,
): DeciderAccountResolved | null {
  const provider = explicitProvider ?? deciderProvider(cfg);
  if (provider === "clef-flash") {
    const token = draft?.trim() || cfg.decider?.cloudflareToken || (cfg.decider?.provider === "clef-flash" ? cfg.decider?.key : undefined) || process.env.CLOUDFLARE_API_TOKEN;
    const accountId = draftAccountId?.trim() || cfg.decider?.cloudflareAccountId || cfg.decider?.accountId || process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!token || !accountId) return null;
    const api = cfg.decider?.baseUrl || process.env.CLOUDFLARE_BASE_URL || "https://api.cloudflare.com";
    return { token: token.trim(), accountId: accountId.trim(), api, included: false };
  }
  const account = deciderCredential(draft?.trim() || (cfg.decider?.provider === "clef-flash" ? undefined : cfg.decider?.key), cfg.decider?.baseUrl);
  return account?.included && seam && !relaySeam(seam) ? null : account;
}

/** A key is on file, or Cloud Pro includes decisions here. */
export function deciderConfigured(cfg: AppConfig): boolean {
  return Boolean(deciderAccount(cfg));
}

/** Cloud Pro includes decisions on this machine, whatever key is saved:
 * what clearing an own key falls back to. */
export function deciderIncludedHere(): boolean {
  return deciderCredential(undefined, undefined)?.included === true;
}

/** The master switch as it takes effect: off while there is no key. With an
 * own key it is on once switched on (saving the key does that); with Cloud
 * Pro's included decisions it is on until someone switches it off. */
export function deciderEnabled(cfg: AppConfig): boolean {
  const account = deciderAccount(cfg);
  if (!account || deciderProvider(cfg) === "off") return false;
  return account.included ? cfg.decider?.enabled !== false : cfg.decider?.enabled === true;
}

/** One job's own switch. Absent means on: turning the decider on turns on
 * what it decides unless a job was switched off by hand. */
export function deciderJobOn(cfg: AppConfig, job: DeciderJob): boolean {
  return cfg.decider?.jobs?.[job] !== false;
}

/** Whether a job would be asked right now. Callers check this before they
 * spend any effort building a request. */
export function deciderReady(cfg: AppConfig, job: DeciderJob): boolean {
  return deciderEnabled(cfg) && deciderJobOn(cfg, job) && Boolean(deciderAccount(cfg, job));
}

/** What Settings needs. Never the key, and not the base URL either: that is
 * an operator setting with no UI. `included`: the decisions are Cloud Pro's,
 * not a saved key. */
export function describeDecider(cfg: AppConfig) {
  const account = deciderAccount(cfg);
  const provider = deciderProvider(cfg);
  const jevAccount = deciderAccount(cfg, undefined, undefined, "jev");
  const clefAccount = deciderAccount(cfg, undefined, undefined, "clef-flash");
  const clefAccountId = cfg.decider?.cloudflareAccountId || cfg.decider?.accountId || process.env.CLOUDFLARE_ACCOUNT_ID;
  return {
    provider: provider === "off" ? ("off" as const) : provider,
    configured: Boolean(account),
    ...(account?.included ? { included: true as const } : {}),
    enabled: deciderEnabled(cfg),
    jobs: { roomRouting: deciderJobOn(cfg, "roomRouting") },
    ...(clefAccount ? { clefConfigured: true } : {}),
    ...(clefAccountId ? { clefAccountId } : {}),
    ...(jevAccount ? { jevConfigured: true } : {}),
  };
}

/** The config write a Settings save becomes.
 *
 * Owner rule: the switch is off while no key is saved, and saving a key is
 * the "turn it on" — it switches the decider and its room job on, with no
 * extra step. Clearing the key switches it off, unless Cloud Pro includes
 * decisions here (`included`): then it falls back to them as it stands.
 * Explicit values in the same patch win. Jobs merge per job, because
 * saveConfig replaces a section's nested objects whole. Returns an error for
 * a switch-on with no key and nothing included. */
export function deciderSavePatch(
  patch: Partial<DeciderConfig>,
  current: DeciderConfig | undefined,
  included = false,
): { ok: true; patch: Partial<DeciderConfig> } | { ok: false; error: string } {
  const next: Partial<DeciderConfig> = { ...patch };
  if (typeof patch.key === "string") next.key = patch.key.trim();
  if (typeof patch.cloudflareToken === "string") next.cloudflareToken = patch.cloudflareToken.trim();
  if (typeof patch.cloudflareAccountId === "string") next.cloudflareAccountId = patch.cloudflareAccountId.trim();
  if (typeof patch.accountId === "string") next.accountId = patch.accountId.trim();
  if (patch.provider !== undefined) next.provider = patch.provider;

  const savingJevKey = typeof patch.key === "string" && Boolean(patch.key.trim());
  const clearingJevKey = typeof patch.key === "string" && !patch.key.trim();
  const savingClefToken = typeof patch.cloudflareToken === "string" && Boolean(patch.cloudflareToken.trim());
  const clearingClefToken = typeof patch.cloudflareToken === "string" && !patch.cloudflareToken.trim();
  const savingClefAccount = (typeof patch.cloudflareAccountId === "string" && Boolean(patch.cloudflareAccountId.trim()))
    || (typeof patch.accountId === "string" && Boolean(patch.accountId.trim()));

  const provider = patch.provider ?? current?.provider ?? "jev";
  const clefTokenPresent = () => Boolean(next.cloudflareToken || current?.cloudflareToken || (current?.provider === "clef-flash" && current?.key) || process.env.CLOUDFLARE_API_TOKEN);
  const clefAccountPresent = () => Boolean(next.cloudflareAccountId || next.accountId || current?.cloudflareAccountId || current?.accountId || process.env.CLOUDFLARE_ACCOUNT_ID);

  if (savingJevKey && provider === "jev") {
    next.enabled = patch.enabled ?? true;
    next.jobs = { ...current?.jobs, roomRouting: true, ...patch.jobs };
  } else if ((savingClefToken || savingClefAccount) && provider === "clef-flash") {
    // Clef needs two credentials, and the desktop saves them in two requests
    // (the token through the encrypted store, the Account ID with the rest).
    // Saving one is only the "turn it on" once the other is present too;
    // otherwise keep it and leave the switch where it was. An explicit
    // enabled: true is still checked below.
    if (patch.enabled !== undefined) next.enabled = patch.enabled;
    else if (clefTokenPresent() && clefAccountPresent()) next.enabled = true;
    else if (current?.enabled) next.enabled = false;
    next.jobs = { ...current?.jobs, roomRouting: true, ...patch.jobs };
  } else if (clearingJevKey && provider === "jev") {
    if (!included) next.enabled = false;
  } else if (clearingClefToken && provider === "clef-flash") {
    next.enabled = false;
  } else if (patch.jobs) {
    next.jobs = { ...current?.jobs, ...patch.jobs };
  }

  if (next.enabled === true) {
    if (provider === "clef-flash") {
      if (!clefTokenPresent() || !clefAccountPresent()) {
        return { ok: false, error: "Save a Cloudflare Account ID and API token before turning on Clef-Flash." };
      }
    } else if (provider === "jev") {
      const hasJev = Boolean(next.key || current?.key || included || process.env.OMB_JEV_API_KEY);
      if (!hasJev) {
        return { ok: false, error: "Save a Jev API key before turning on fast decisions." };
      }
    }
  }

  return { ok: true, patch: next };
}

export interface DeciderDeps {
  /** Read on every call, so a Settings change applies to the next decision. */
  config(): AppConfig;
  /** Tests pass a mock; production uses the global fetch. */
  fetch?: typeof fetch;
  /** Where the decision log goes. Omitted: nothing is logged. */
  dataDir?: string;
  now?: () => number;
}

export interface Decider {
  ask<Qs extends Record<string, DeciderQuestion>>(
    seam: DeciderSeam,
    state: unknown,
    questions: Qs,
    options?: AskOptions,
  ): Promise<DeciderResult<Answers<Qs>>>;
  choose<K extends string>(
    seam: DeciderSeam,
    state: unknown,
    question: { instructions: string; options: Record<K, string> },
    options?: AskOptions,
  ): Promise<DeciderResult<ChoiceAnswer<K>>>;
  score(
    seam: DeciderSeam,
    state: unknown,
    question: { instructions: string; levels: string[] },
    options?: AskOptions,
  ): Promise<DeciderResult<ScoreAnswer>>;
  yesNo(seam: DeciderSeam, state: unknown, instructions: string, options?: AskOptions): Promise<DeciderResult<YesNoAnswer>>;
  /** One tiny yes/no call with a draft key or the saved one (with neither,
   * Cloud Pro's included decisions through the relay), whatever the switches
   * say: the Settings Test button, and the check on save. */
  testKey(input?: { key?: string; accountId?: string; provider?: DeciderProvider }, options?: AskOptions): Promise<DeciderResult<YesNoAnswer>>;
}

export function createDecider(deps: DeciderDeps): Decider {
  const fetchImpl = deps.fetch ?? fetch;
  const now = deps.now ?? (() => performance.now());
  // Clef-Flash: open the pooled connection now, so the first room message
  // doesn't pay a cold handshake (measured 3–15s on a lossy path, against
  // ~0.9s warm). Production only — a test that injects fetch makes no
  // network calls. Never blocks or throws.
  if (!deps.fetch) {
    try {
      const cfg = deps.config();
      const account = deciderProvider(cfg) === "clef-flash" && deciderEnabled(cfg) ? deciderAccount(cfg, "roomRouting") : null;
      if (account) warmClefConnection(account.api);
    } catch {
      /* warming is best-effort */
    }
  }

  function gate(cfg: AppConfig, seam: DeciderSeam): DeciderFailure | null {
    if (deciderProvider(cfg) === "off") return "disabled";
    if (seam === "keyCheck") return null;
    if (!deciderConfigured(cfg)) return cfg.decider?.enabled === true ? "no_key" : "disabled";
    if (!deciderEnabled(cfg)) return "disabled";
    if (!deciderJobOn(cfg, seam)) return "job_off";
    // Only the included token, and the relay does not take this job.
    if (!deciderAccount(cfg, seam)) return "no_key";
    return null;
  }

  async function call<Qs extends Record<string, DeciderQuestion>>(
    seam: DeciderSeam,
    backend: DeciderBackend | typeof offBackend,
    request: { key: string; baseUrl?: string; accountId?: string; state: unknown; questions: Qs },
    options: AskOptions,
  ): Promise<DeciderResult<Answers<Qs>>> {
    const provider = backend.id === "off" ? undefined : backend.id;
    if (options.signal?.aborted) return { ok: false, ...(provider ? { provider } : {}), reason: "cancelled" };
    const timeoutMs = Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, options.timeoutMs ?? DEFAULT_DECIDER_TIMEOUT_MS));
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The race, not only the abort, bounds the call: a body that stalls
    // after its headers must not hold a room turn past the budget.
    const timedOut = new Promise<BackendResult>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ ok: false, reason: "timeout" });
      }, timeoutMs);
    });
    const started = now();
    let outcome: BackendResult;
    try {
      const decided = Promise.resolve()
        .then(() => backend.decide({ ...request, signal: controller.signal, fetch: fetchImpl }))
        .catch((): BackendResult => ({ ok: false, reason: "malformed" }));
      outcome = await Promise.race([decided, timedOut]);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    }
    const latencyMs = Math.max(0, Math.round(now() - started));
    if (!outcome.ok && outcome.reason !== "timeout" && options.signal?.aborted) outcome = { ok: false, reason: "cancelled" };
    if (provider && deps.dataDir) {
      const first = outcome.ok ? Object.values(outcome.answers).find((answer) => answer.type === "choice") as ChoiceAnswer | undefined : undefined;
      appendDeciderLog(deps.dataDir, {
        at: new Date().toISOString(),
        seam,
        provider,
        ok: outcome.ok,
        ...(!outcome.ok ? { reason: outcome.reason, ...(outcome.status ? { status: outcome.status } : {}) } : {}),
        ...(first ? { choice: first.choice } : {}),
        pTop: first?.pTop ?? null,
        margin: first?.margin ?? null,
        latencyMs,
        ...(outcome.ok && outcome.inputTokens !== undefined ? { inputTokens: outcome.inputTokens } : {}),
        ...(outcome.timing ? { timing: outcome.timing } : {}),
        stateHash: stateHash(request.state),
      });
    }
    if (!outcome.ok) return { ok: false, ...(provider ? { provider } : {}), reason: outcome.reason, ...(outcome.status ? { status: outcome.status } : {}), latencyMs };
    return {
      ok: true,
      provider: provider!,
      answers: outcome.answers as Answers<Qs>,
      latencyMs,
      ...(outcome.inputTokens !== undefined ? { inputTokens: outcome.inputTokens } : {}),
      ...(outcome.model ? { model: outcome.model } : {}),
    };
  }

  async function ask<Qs extends Record<string, DeciderQuestion>>(
    seam: DeciderSeam,
    state: unknown,
    questions: Qs,
    options: AskOptions = {},
  ): Promise<DeciderResult<Answers<Qs>>> {
    try {
      const cfg = deps.config();
      const refused = gate(cfg, seam);
      if (refused) return { ok: false, reason: refused };
      const provider = deciderProvider(cfg);
      const backend = provider === "off" ? offBackend : BACKENDS[provider];
      const account = deciderAccount(cfg, seam)!;
      // Through the included token, only the exact requests the relay takes.
      if (account.included && !relayAccepts(seam, state, questions)) return { ok: false, reason: "misconfigured" };
      return await call(seam, backend, { key: account.token, baseUrl: account.api, accountId: account.accountId, state, questions }, options);
    } catch {
      return { ok: false, reason: "malformed" };
    }
  }

  const single = <A>(result: DeciderResult<{ answer: A }>): DeciderResult<A> =>
    result.ok ? { ...result, answers: result.answers.answer } : result;

  return {
    ask,
    async choose<K extends string>(
      seam: DeciderSeam,
      state: unknown,
      question: { instructions: string; options: Record<K, string> },
      options?: AskOptions,
    ): Promise<DeciderResult<ChoiceAnswer<K>>> {
      const asked: { answer: ChoiceQuestion<K> } = { answer: { type: "choice", instructions: question.instructions, options: question.options } };
      return single(await ask(seam, state, asked, options)) as DeciderResult<ChoiceAnswer<K>>;
    },
    async score(seam, state, question, options) {
      return single(await ask(seam, state, { answer: { type: "score", instructions: question.instructions, levels: question.levels } }, options));
    },
    async yesNo(seam, state, instructions, options) {
      return single(await ask(seam, state, { answer: { type: "yesno", instructions } }, options));
    },
    async testKey(input = {}, options = {}) {
      try {
        const cfg = deps.config();
        const chosenProvider = input.provider ?? deciderProvider(cfg);
        const provider = chosenProvider === "off" ? "jev" : chosenProvider;
        const account = deciderAccount(cfg, "keyCheck", input.key, provider, input.accountId);
        if (!account) return { ok: false, reason: "no_key" };
        const backend = BACKENDS[provider];
        const questions = { answer: { type: "yesno" as const, instructions: KEY_CHECK_QUESTION } };
        if (account.included && !relayAccepts("keyCheck", KEY_CHECK_STATE, questions)) return { ok: false, reason: "misconfigured" };
        return single(await call("keyCheck", backend, {
          key: account.token,
          baseUrl: account.api,
          accountId: account.accountId,
          state: KEY_CHECK_STATE,
          questions,
        }, { timeoutMs: KEY_CHECK_TIMEOUT_MS, ...options }));
      } catch {
        return { ok: false, reason: "malformed" };
      }
    },
  };
}
