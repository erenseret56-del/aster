import { RetellWebClient } from "retell-client-js-sdk";

export type RetellCallStatus = "disconnected" | "connecting" | "connected" | "listening" | "agent-speaking" | "error";
export interface RetellCallState { status: RetellCallStatus; targetId: string | null; muted: boolean; startedAt: number | null; error: string | null; }
const initialState: RetellCallState = { status: "disconnected", targetId: null, muted: false, startedAt: null, error: null };
let state = initialState;
let client: RetellWebClient | null = null;
let callGeneration = 0;
const listeners = new Set<() => void>();
function notify() { for (const listener of listeners) listener(); }
function update(patch: Partial<RetellCallState>) { state = { ...state, ...patch }; notify(); }
export function getRetellCallState() { return state; }
export function subscribeToRetellCall(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }

export async function startRetellCall(targetId: string) {
  if (client || state.status !== "disconnected") return;
  const generation = ++callGeneration;
  update({ status: "connecting", targetId, startedAt: Date.now(), error: null, muted: false });
  try {
    const response = await fetch("/api/retell/call", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const result = (await response.json().catch(() => null)) as {
      accessToken?: unknown;
      error?: unknown;
      callId?: unknown;
      transport?: "gateway" | "livekit";
      iceServers?: RTCIceServer[];
    } | null;
    if (!response.ok || typeof result?.accessToken !== "string") throw new Error(typeof result?.error === "string" ? result.error : "Unable to start the call.");
    if (generation !== callGeneration || state.status === "disconnected") return;
    const nextClient = new RetellWebClient();
    client = nextClient;
    nextClient.on("call_started", () => update({ status: "listening" }));
    nextClient.on("agent_start_talking", () => update({ status: "agent-speaking" }));
    nextClient.on("agent_stop_talking", () => update({ status: "listening" }));
    nextClient.on("call_ended", () => finish());
    nextClient.on("error", (error: unknown) => fail(error));
    await nextClient.startCall({
      accessToken: result.accessToken,
      ...(typeof result.callId === "string" ? { callId: result.callId } : {}),
      ...(result.transport ? { transport: result.transport } : {}),
      ...(result.iceServers ? { iceServers: result.iceServers } : {}),
    });
  } catch (error) { fail(error); }
}
export function toggleRetellMute() { if (!client) return; if (state.muted) client.unmute(); else client.mute(); update({ muted: !state.muted }); }
export function endRetellCall() { callGeneration += 1; if (!client) { update({ status: "disconnected", targetId: null, startedAt: null }); return; } client.stopCall(); finish(); }
function finish() { client = null; update({ status: "disconnected", targetId: null, muted: false, startedAt: null }); }
function fail(error: unknown) { client?.stopCall(); client = null; update({ status: "error", error: error instanceof Error ? error.message : "The call connection failed." }); }
