import { PASS, type RouteHandler } from "./table.ts";

const RETELL_CREATE_CALL_URL = "https://api.retellai.com/v3/create-web-call";

export function createRetellRoutes(env: NodeJS.ProcessEnv = process.env): RouteHandler {
  return async ({ req, res, path, method, json, readBody }) => {
    if (path !== "/api/retell/call" || method !== "POST") return PASS;

    const apiKey = env.RETELL_API_KEY?.trim();
    const agentId = env.RETELL_AGENT_ID?.trim();
    if (!apiKey || !agentId) {
      return json(res, 503, { error: "Retell is not configured on this server." });
    }

    const body = await readBody(req, 16 * 1024);
    if (body !== null && typeof body !== "object") return json(res, 400, { error: "Invalid request body." });

    try {
      const upstream = await fetch(RETELL_CREATE_CALL_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ agent_id: agentId }),
      });
      const result = (await upstream.json().catch(() => null)) as {
        access_token?: unknown;
        call_id?: unknown;
        transport?: unknown;
        ice_servers?: unknown;
        message?: unknown;
      } | null;
      if (!upstream.ok || typeof result?.access_token !== "string") {
        const detail = typeof result?.message === "string" ? result.message : "Retell could not create a call.";
        return json(res, upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502, { error: detail });
      }
      res.setHeader("cache-control", "no-store");
      return json(res, 200, {
        accessToken: result.access_token,
        ...(typeof result.call_id === "string" ? { callId: result.call_id } : {}),
        ...(result.transport === "gateway" || result.transport === "livekit" ? { transport: result.transport } : {}),
        ...(Array.isArray(result.ice_servers) ? { iceServers: result.ice_servers } : {}),
      });
    } catch {
      return json(res, 502, { error: "Retell is temporarily unreachable." });
    }
  };
}
