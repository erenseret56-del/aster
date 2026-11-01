// Settings → Decision model. Supports both Jev and Cloudflare Clef-Flash
// providers with independent keys/credentials and selection switches, and
// the engine rooms set to Clef ask: a local Ollama model or Clef-Flash.
import { useState } from "react";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { api, useStore, type ConfigStatus } from "@/state/store";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";
import { Card, SettingRow, Switch } from "./SettingsPrimitives";

const JEV_KEY_URL = "https://typesafe.ai";
const CLOUDFLARE_URL = "https://dash.cloudflare.com/";

type TestResult = { ok: true; latencyMs: number } | { ok: false; reason: string; status?: number };

const FAILURES: Record<string, LocaleKey> = {
  rejected: "decider.error.rejected",
  unreachable: "decider.error.unreachable",
  timeout: "decider.error.timeout",
  rate_limited: "decider.error.rateLimited",
  overloaded: "decider.error.overloaded",
  malformed: "decider.error.malformed",
  no_key: "decider.error.noKey",
  misconfigured: "decider.error.misconfigured",
};

const INCLUDED_FAILURES: Record<string, LocaleKey> = {
  rejected: "decider.included.error.rejected",
  rate_limited: "decider.included.error.limited",
};

/** A fixed sentence per failure: the vendor's own body never reaches the UI. */
export function deciderFailureText(
  result: { reason: string; status?: number },
  included = false,
  provider: "jev" | "clef-flash" = "jev",
): string {
  if (provider === "clef-flash") {
    if (result.reason === "http_error") return t("decider.clef.error.http", { status: String(result.status ?? "?") });
    if (result.reason === "rejected") return t("decider.clef.error.rejected");
    if (result.reason === "unreachable") return t("decider.clef.error.unreachable");
    if (result.reason === "timeout") return t("decider.clef.error.timeout");
    if (result.reason === "rate_limited") return t("decider.clef.error.rateLimited");
    if (result.reason === "overloaded") return t("decider.clef.error.overloaded");
    if (result.reason === "malformed") return t("decider.clef.error.malformed");
    if (result.reason === "no_key") return t("decider.clef.error.noCreds");
    return t("decider.error.other");
  }
  if (included && result.reason === "http_error" && result.status === 402) return t("decider.included.error.subscription");
  if (included && INCLUDED_FAILURES[result.reason]) return t(INCLUDED_FAILURES[result.reason]!);
  if (result.reason === "http_error") return t("decider.error.http", { status: String(result.status ?? "?") });
  const key = FAILURES[result.reason];
  return key ? t(key) : t("decider.error.other");
}

/** Jobs that are not built yet: listed so people know what is coming, with
 * no switch, because a switch that does nothing would be a lie. */
const COMING_SOON: LocaleKey[] = ["decider.jobs.browserClicks", "decider.jobs.toolSelection", "decider.jobs.placement"];

export function DecisionModelSettings() {
  const { state, dispatch } = useStore();
  const decider = state.config?.decider;
  const activeProvider = decider?.provider ?? "jev";
  const enabled = decider?.enabled ?? false;
  const isJevActive = enabled && (activeProvider === "jev" || activeProvider === "off");
  const isClefActive = enabled && activeProvider === "clef-flash";

  // Provider configuration statuses
  const jevConfigured = decider?.jevConfigured ?? (activeProvider === "jev" ? decider?.configured ?? false : false);
  const clefConfigured = decider?.clefConfigured ?? (activeProvider === "clef-flash" ? decider?.configured ?? false : false);
  const included = jevConfigured && decider?.included === true;
  const ownJevKey = jevConfigured && !included;
  const roomRouting = decider?.jobs.roomRouting ?? true;

  // Jev state
  const [jevValue, setJevValue] = useState("");
  const [jevSaving, setJevSaving] = useState(false);
  const [jevTesting, setJevTesting] = useState(false);
  const [jevError, setJevError] = useState<string | null>(null);
  const [jevVerdict, setJevVerdict] = useState<{ ok: boolean; text: string } | null>(null);

  // Clef-Flash state
  const [clefAccountId, setClefAccountId] = useState(decider?.clefAccountId ?? "");
  const [clefToken, setClefToken] = useState("");
  const [clefSaving, setClefSaving] = useState(false);
  const [clefTesting, setClefTesting] = useState(false);
  const [clefError, setClefError] = useState<string | null>(null);
  const [clefVerdict, setClefVerdict] = useState<{ ok: boolean; text: string } | null>(null);

  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const draftJev = jevValue.trim();
  const clearingJev = !draftJev && ownJevKey;
  const draftClefToken = clefToken.trim();
  const draftClefAccountId = clefAccountId.trim();
  const clearingClef = !draftClefToken && !draftClefAccountId && clefConfigured;

  const applied = (config: ConfigStatus) => dispatch({ type: "configStatus", config });

  const patch = async (decision: Record<string, unknown>) => {
    if (switching) return;
    setSwitching(true);
    setSwitchError(null);
    try {
      applied(await api<ConfigStatus>("/api/config", { method: "PUT", body: JSON.stringify({ decider: decision }) }));
    } catch (cause) {
      setSwitchError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSwitching(false);
    }
  };

  const saveJev = async () => {
    if (jevSaving || (!draftJev && !ownJevKey)) return;
    setJevSaving(true);
    setJevError(null);
    setJevVerdict(null);
    try {
      const status = window.ogb?.setCredential
        ? await window.ogb.setCredential("jevApiKey", draftJev)
        : await api<ConfigStatus>("/api/config", {
            method: "PUT",
            body: JSON.stringify({
              decider: {
                key: draftJev,
                ...(activeProvider !== "jev" ? { provider: "jev" } : {}),
              },
            }),
          });
      applied(status);
      setJevValue("");
    } catch (cause) {
      setJevError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setJevSaving(false);
    }
  };

  const testJev = async () => {
    if (jevTesting || jevSaving || (!draftJev && !jevConfigured)) return;
    setJevTesting(true);
    setJevVerdict(null);
    setJevError(null);
    const testingIncluded = !draftJev && included;
    try {
      const result = await api<TestResult>("/api/decider/test", {
        method: "POST",
        body: JSON.stringify(draftJev ? { key: draftJev } : {}),
      });
      setJevVerdict(result.ok
        ? { ok: true, text: t("decider.test.ok", { ms: String(result.latencyMs) }) }
        : { ok: false, text: deciderFailureText(result, testingIncluded, "jev") });
    } catch (cause) {
      setJevVerdict({ ok: false, text: cause instanceof Error ? cause.message : String(cause) });
    } finally {
      setJevTesting(false);
    }
  };

  const saveClef = async () => {
    if (clefSaving || (!draftClefToken && !draftClefAccountId && !clefConfigured)) return;
    setClefSaving(true);
    setClefError(null);
    setClefVerdict(null);
    try {
      if (window.ogb?.setCredential && draftClefToken) {
        await window.ogb.setCredential("cloudflareApiToken", draftClefToken);
      }
      const patchBody: Record<string, unknown> = {
        cloudflareAccountId: draftClefAccountId,
        provider: "clef-flash",
      };
      if (!window.ogb?.setCredential || !draftClefToken) {
        patchBody.cloudflareToken = draftClefToken;
      }
      const status = await api<ConfigStatus>("/api/config", {
        method: "PUT",
        body: JSON.stringify({ decider: patchBody }),
      });
      applied(status);
      setClefToken("");
    } catch (cause) {
      setClefError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setClefSaving(false);
    }
  };

  const testClef = async () => {
    if (clefTesting || clefSaving || (!draftClefToken && !clefConfigured)) return;
    setClefTesting(true);
    setClefVerdict(null);
    setClefError(null);
    try {
      const body: Record<string, unknown> = { provider: "clef-flash" };
      if (draftClefToken) {
        body.key = draftClefToken;
        if (draftClefAccountId) body.accountId = draftClefAccountId;
      }
      const result = await api<TestResult>("/api/decider/test", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setClefVerdict(result.ok
        ? { ok: true, text: t("decider.clef.test.ok", { ms: String(result.latencyMs) }) }
        : { ok: false, text: deciderFailureText(result, false, "clef-flash") });
    } catch (cause) {
      setClefVerdict({ ok: false, text: cause instanceof Error ? cause.message : String(cause) });
    } finally {
      setClefTesting(false);
    }
  };

  return (
    <>
      <p className="text-[13px] leading-relaxed text-ink-secondary">{t("decider.intro")}</p>
      <div className="flex flex-col gap-2">
        <SettingRow title={t("decider.master")} subtitle={jevConfigured ? undefined : t("decider.masterNeedsKey")}>
          <Switch
            data-testid="decider-master"
            aria-label={t("decider.master")}
            checked={isJevActive}
            disabled={!jevConfigured || switching || !state.config}
            onClick={() => void patch(isJevActive ? { enabled: false } : { provider: "jev", enabled: true })}
            className="cursor-pointer"
          />
        </SettingRow>

        <SettingRow title={t("decider.clef.master")} subtitle={clefConfigured ? undefined : t("decider.clef.masterNeedsCreds")}>
          <Switch
            data-testid="decider-clef-master"
            aria-label={t("decider.clef.master")}
            checked={isClefActive}
            disabled={!clefConfigured || switching || !state.config}
            onClick={() => void patch(isClefActive ? { enabled: false } : { provider: "clef-flash", enabled: true })}
            className="cursor-pointer"
          />
        </SettingRow>
        {switchError && <p role="alert" className="text-[12px] text-danger">{switchError}</p>}
      </div>

      {/* Jev Configuration Card */}
      <Card title={t("decider.key.label")}>
        <div role="status" className="mb-2 flex items-center gap-2 text-[13px] text-ink-secondary">
          <span className={cn("size-1.5 rounded-full", jevConfigured ? "bg-success" : "bg-raised-hover")} />
          <span data-testid="decider-status" className={jevConfigured ? "text-success" : undefined}>
            {included ? t("keys.includedWithCloudPro") : jevConfigured ? t("decider.status.connected") : t("decider.status.notConnected")}
          </span>
        </div>
        <div className="flex gap-2">
          <input
            type="password"
            value={jevValue}
            onChange={(event) => { setJevVerdict(null); setJevError(null); setJevValue(event.target.value); }}
            onKeyDown={(event) => event.key === "Enter" && void saveJev()}
            disabled={jevSaving}
            placeholder={ownJevKey ? t("keys.replace") : t("decider.key.placeholder")}
            aria-label={t("decider.key.label")}
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink placeholder:text-ink-secondary focus:outline-none"
          />
          <button
            type="button"
            data-testid="decider-save"
            onClick={() => void saveJev()}
            disabled={jevSaving || (!draftJev && !ownJevKey)}
            title={clearingJev ? t("keys.removeKey") : t("common.save")}
            className={cn(
              "flex w-[72px] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-control py-2 text-[13px] hover:bg-raised-hover disabled:cursor-not-allowed disabled:opacity-50",
              clearingJev ? "text-danger" : "text-ink",
            )}
          >
            {jevSaving ? <Loader2 size={13} className="animate-spin" /> : clearingJev ? t("keys.clear") : <><Check size={13} />{t("common.save")}</>}
          </button>
          <button
            type="button"
            data-testid="decider-test"
            onClick={() => void testJev()}
            disabled={jevTesting || jevSaving || (!draftJev && !jevConfigured)}
            className="flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-hairline/40 px-3 py-2 text-[13px] text-ink-secondary hover:bg-raised/50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {jevTesting ? t("keys.testing") : t("keys.test")}
          </button>
        </div>
        {jevError && <p role="alert" className="mt-1 text-[12px] text-danger">{jevError}</p>}
        {jevVerdict && <p role="status" className={cn("mt-1 text-[12px]", jevVerdict.ok ? "text-success" : "text-danger")}>{jevVerdict.text}</p>}
        <a
          href={JEV_KEY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex cursor-pointer items-center gap-1 text-[12px] text-accent hover:underline"
        >
          {t("decider.key.getKey")}
          <ExternalLink size={11} aria-hidden="true" />
        </a>
      </Card>

      {/* Cloudflare Clef-Flash Configuration Card */}
      <Card title={t("decider.clef.label")}>
        <div role="status" className="mb-2 flex items-center gap-2 text-[13px] text-ink-secondary">
          <span className={cn("size-1.5 rounded-full", clefConfigured ? "bg-success" : "bg-raised-hover")} />
          <span data-testid="decider-clef-status" className={clefConfigured ? "text-success" : undefined}>
            {clefConfigured ? t("decider.status.connected") : t("decider.status.notConnected")}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <input
            type="text"
            data-testid="decider-clef-account-id"
            value={clefAccountId}
            onChange={(event) => { setClefVerdict(null); setClefError(null); setClefAccountId(event.target.value); }}
            disabled={clefSaving}
            placeholder={t("decider.clef.accountId.placeholder")}
            aria-label={t("decider.clef.accountId.label")}
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink placeholder:text-ink-secondary focus:outline-none"
          />
          <div className="flex gap-2">
            <input
              type="password"
              data-testid="decider-clef-token"
              value={clefToken}
              onChange={(event) => { setClefVerdict(null); setClefError(null); setClefToken(event.target.value); }}
              onKeyDown={(event) => event.key === "Enter" && void saveClef()}
              disabled={clefSaving}
              placeholder={clefConfigured ? t("keys.replace") : t("decider.clef.token.placeholder")}
              aria-label={t("decider.clef.token.label")}
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink placeholder:text-ink-secondary focus:outline-none"
            />
            <button
              type="button"
              data-testid="decider-clef-save"
              onClick={() => void saveClef()}
              disabled={clefSaving || (!draftClefToken && !draftClefAccountId && !clefConfigured)}
              title={clearingClef ? t("keys.removeKey") : t("common.save")}
              className={cn(
                "flex w-[72px] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-control py-2 text-[13px] hover:bg-raised-hover disabled:cursor-not-allowed disabled:opacity-50",
                clearingClef ? "text-danger" : "text-ink",
              )}
            >
              {clefSaving ? <Loader2 size={13} className="animate-spin" /> : clearingClef ? t("keys.clear") : <><Check size={13} />{t("common.save")}</>}
            </button>
            <button
              type="button"
              data-testid="decider-clef-test"
              onClick={() => void testClef()}
              disabled={clefTesting || clefSaving || (!draftClefToken && !clefConfigured)}
              className="flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-hairline/40 px-3 py-2 text-[13px] text-ink-secondary hover:bg-raised/50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              {clefTesting ? t("keys.testing") : t("keys.test")}
            </button>
          </div>
        </div>
        {clefError && <p role="alert" className="mt-1 text-[12px] text-danger">{clefError}</p>}
        {clefVerdict && <p role="status" className={cn("mt-1 text-[12px]", clefVerdict.ok ? "text-success" : "text-danger")}>{clefVerdict.text}</p>}
        <a
          href={CLOUDFLARE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex cursor-pointer items-center gap-1 text-[12px] text-accent hover:underline"
        >
          {t("decider.clef.getKey")}
          <ExternalLink size={11} aria-hidden="true" />
        </a>
      </Card>

      <ClefRoomsCard />

      {/* Decision Jobs */}
      <Card title={t("decider.jobs.title")}>
        <ul className="flex flex-col">
          <li className="flex items-start justify-between gap-4 py-2">
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-ink">{t("decider.jobs.roomRouting")}</div>
              <div className="mt-0.5 text-[12px] leading-relaxed text-ink-secondary">{t("decider.jobs.roomRoutingDetail")}</div>
            </div>
            <Switch
              data-testid="decider-job-roomRouting"
              aria-label={t("decider.jobs.roomRouting")}
              checked={enabled && roomRouting}
              disabled={!enabled || switching}
              onClick={() => void patch({ jobs: { roomRouting: !roomRouting } })}
              className="cursor-pointer"
            />
          </li>
          {COMING_SOON.map((label) => (
            <li key={label} data-testid="decider-coming-soon" aria-disabled="true" className="flex items-center justify-between gap-4 border-t border-hairline/40 py-2 opacity-50">
              <span className="text-[13px] text-ink-secondary">{t(label)}</span>
              <span className="rounded bg-control px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-secondary">
                {t("decider.jobs.comingSoon")}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

type OllamaModels = { ok: true; url: string; models: string[] } | { ok: false; reason: string };

const OLLAMA_FAILURES: Record<string, LocaleKey> = {
  not_local: "decider.clefRooms.ollama.error.notLocal",
  unreachable: "decider.clefRooms.ollama.error.unreachable",
  malformed: "decider.clefRooms.ollama.error.malformed",
};

/** The engine rooms set to Clef ask. The local model is the default: room
 * messages then stay on this computer or the person's own network (the
 * server refuses public addresses and Ollama's cloud models). */
export function ClefRoomsCard() {
  const { state, dispatch } = useStore();
  const decider = state.config?.decider;
  const engine = decider?.clefEngine ?? "ollama";
  const ready = decider?.clefReady === true;
  const clefConfigured = decider?.clefConfigured === true;

  const [url, setUrl] = useState(decider?.ollamaUrl ?? "");
  const [model, setModel] = useState(decider?.ollamaModel ?? "");
  const [models, setModels] = useState<string[] | null>(null);
  const [finding, setFinding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async (decision: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    setVerdict(null);
    try {
      dispatch({ type: "configStatus", config: await api<ConfigStatus>("/api/config", { method: "PUT", body: JSON.stringify({ decider: decision }) }) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const findModels = async () => {
    setFinding(true);
    setError(null);
    setVerdict(null);
    try {
      const query = url.trim() ? `?url=${encodeURIComponent(url.trim())}` : "";
      const listed = await api<OllamaModels>(`/api/decider/ollama/models${query}`);
      if (!listed.ok) {
        setModels(null);
        const key = OLLAMA_FAILURES[listed.reason];
        setError(key ? t(key) : t("decider.error.other"));
        return;
      }
      setModels(listed.models);
      if (!listed.models.length) setError(t("decider.clefRooms.ollama.noModels"));
      else if (!listed.models.includes(model)) setModel(listed.models[0]!);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setFinding(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setVerdict(null);
    setError(null);
    try {
      const result = await api<TestResult>("/api/decider/test", { method: "POST", body: JSON.stringify({ provider: engine }) });
      setVerdict(result.ok
        ? { ok: true, text: t(engine === "ollama" ? "decider.clefRooms.ollama.test.ok" : "decider.clef.test.ok", { ms: String(result.latencyMs) }) }
        : { ok: false, text: engine === "ollama"
            ? t(result.reason === "no_key" ? "decider.clefRooms.ollama.error.noModel" : "decider.clefRooms.ollama.error.unreachable")
            : deciderFailureText(result, false, "clef-flash") });
    } catch (cause) {
      setVerdict({ ok: false, text: cause instanceof Error ? cause.message : String(cause) });
    } finally {
      setTesting(false);
    }
  };

  const savedModel = decider?.ollamaModel ?? "";
  const savedUrl = decider?.ollamaUrl ?? "";
  const ollamaDirty = model.trim() !== savedModel || url.trim() !== savedUrl;
  const choices = models ?? (savedModel ? [savedModel] : []);
  const engineButton = (value: "ollama" | "clef-flash", label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={engine === value}
      data-testid={`clef-engine-${value}`}
      disabled={saving || !state.config}
      onClick={() => engine !== value && void save({ clefEngine: value })}
      className={cn(
        "flex-1 cursor-pointer rounded-md px-3 py-1.5 text-[13px] disabled:cursor-not-allowed disabled:opacity-50",
        engine === value ? "bg-raised font-medium text-ink shadow-sm" : "text-ink-secondary hover:text-ink",
      )}
    >
      {label}
    </button>
  );

  return (
    <Card title={t("decider.clefRooms.title")}>
      <p className="mb-2 text-[12px] leading-relaxed text-ink-secondary">{t("decider.clefRooms.detail")}</p>
      <div role="radiogroup" aria-label={t("decider.clefRooms.engine")} className="mb-2 flex gap-1 rounded-lg bg-inset p-1">
        {engineButton("ollama", t("decider.clefRooms.engine.ollama"))}
        {engineButton("clef-flash", t("decider.clefRooms.engine.clefFlash"))}
      </div>
      <div role="status" className="mb-2 flex items-center gap-2 text-[13px] text-ink-secondary">
        <span className={cn("size-1.5 rounded-full", ready ? "bg-success" : "bg-raised-hover")} />
        <span data-testid="clef-rooms-status" className={ready ? "text-success" : undefined}>
          {ready ? t("decider.clefRooms.ready")
            : decider?.jobs.roomRouting === false ? t("decider.clefRooms.jobOff")
              : engine === "ollama" ? t("decider.clefRooms.ollama.notReady") : t("decider.clefRooms.clefFlash.notReady")}
        </span>
      </div>

      {engine === "ollama" ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="text"
              data-testid="clef-ollama-url"
              value={url}
              onChange={(event) => { setVerdict(null); setError(null); setModels(null); setUrl(event.target.value); }}
              disabled={saving}
              placeholder="http://127.0.0.1:11434"
              aria-label={t("decider.clefRooms.ollama.url")}
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink placeholder:text-ink-secondary focus:outline-none"
            />
            <button
              type="button"
              data-testid="clef-ollama-find"
              onClick={() => void findModels()}
              disabled={finding || saving}
              className="flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-hairline/40 px-3 py-2 text-[13px] text-ink-secondary hover:bg-raised/50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              {finding && <Loader2 size={13} className="animate-spin" />}
              {t("decider.clefRooms.ollama.find")}
            </button>
          </div>
          <div className="flex gap-2">
            <select
              data-testid="clef-ollama-model"
              value={model}
              onChange={(event) => { setVerdict(null); setModel(event.target.value); }}
              disabled={saving || !choices.length}
              aria-label={t("decider.clefRooms.ollama.model")}
              className="w-full min-w-0 rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink focus:outline-none disabled:opacity-50"
            >
              {!choices.length && <option value="">{t("decider.clefRooms.ollama.findFirst")}</option>}
              {choices.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <button
              type="button"
              data-testid="clef-ollama-save"
              onClick={() => void save({ ollamaUrl: url.trim(), ollamaModel: model.trim(), clefEngine: "ollama" })}
              disabled={saving || !model.trim() || !ollamaDirty}
              className="flex w-[72px] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-control py-2 text-[13px] text-ink hover:bg-raised-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <><Check size={13} />{t("common.save")}</>}
            </button>
            <button
              type="button"
              data-testid="clef-rooms-test"
              onClick={() => void test()}
              disabled={testing || saving || !savedModel || ollamaDirty}
              className="flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-hairline/40 px-3 py-2 text-[13px] text-ink-secondary hover:bg-raised/50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testing ? t("keys.testing") : t("keys.test")}
            </button>
          </div>
          <p className="text-[11.5px] text-ink-secondary">{t("decider.clefRooms.ollama.private")}</p>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] text-ink-secondary">{t("decider.clefRooms.clefFlash.detail")}</p>
          <button
            type="button"
            data-testid="clef-rooms-test"
            onClick={() => void test()}
            disabled={testing || !clefConfigured}
            className="flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-hairline/40 px-3 py-2 text-[13px] text-ink-secondary hover:bg-raised/50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {testing ? t("keys.testing") : t("keys.test")}
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-1 text-[12px] text-danger">{error}</p>}
      {verdict && <p role="status" className={cn("mt-1 text-[12px]", verdict.ok ? "text-success" : "text-danger")}>{verdict.text}</p>}
    </Card>
  );
}
