import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../config.ts";
import { createDecider, deciderProvider, deciderReady, describeDecider } from "./index.ts";
import { decideRoomResponder } from "./room-routing.ts";
import { CLEF_FLASH_MODEL } from "./clef.ts";

const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const CF_TOKEN = "cft_unit_test_token_123456";
const JEV_KEY = "tsk_unit_secret_key_0123456789abcdef";

const STATE = { new_message: { from: "Rithwik", text: "Please help triage this issue" } };
const QUESTION = {
  instructions: "Which bot should answer?",
  options: { alice: "Alice, Support Lead", bob: "Bob, Infrastructure" },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.DECIDER_PROVIDER;
  delete process.env.OMB_DECIDER_PROVIDER;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;
});

describe("provider selection", () => {
  it("defaults to jev when unconfigured", () => {
    expect(deciderProvider({})).toBe("jev");
    expect(deciderProvider({ decider: { enabled: true } })).toBe("jev");
  });

  it("selects clef-flash from config", () => {
    expect(deciderProvider({ decider: { provider: "clef-flash" } })).toBe("clef-flash");
  });

  it("selects clef-flash from DECIDER_PROVIDER environment variable", () => {
    process.env.DECIDER_PROVIDER = "clef-flash";
    expect(deciderProvider({})).toBe("clef-flash");
  });

  it("normalizes provider aliases (clef, cloudflare)", () => {
    process.env.DECIDER_PROVIDER = "clef";
    expect(deciderProvider({})).toBe("clef-flash");

    process.env.DECIDER_PROVIDER = "cloudflare";
    expect(deciderProvider({})).toBe("clef-flash");
  });

  it("preserves off when disabled", () => {
    expect(deciderProvider({ decider: { provider: "off" } })).toBe("off");
  });
});

describe("Clef-Flash credential resolution", () => {
  it("reports not ready when credentials are missing", () => {
    const config: AppConfig = {
      decider: { enabled: true, provider: "clef-flash", jobs: { roomRouting: true } },
    };
    expect(deciderReady(config, "roomRouting")).toBe(false);
  });

  it("becomes ready when CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are set", () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = ACCOUNT_ID;
    process.env.CLOUDFLARE_API_TOKEN = CF_TOKEN;
    const config: AppConfig = {
      decider: { enabled: true, provider: "clef-flash", jobs: { roomRouting: true } },
    };
    expect(deciderReady(config, "roomRouting")).toBe(true);
  });

  it("becomes ready when configured in config object", () => {
    const config: AppConfig = {
      decider: {
        enabled: true,
        provider: "clef-flash",
        accountId: ACCOUNT_ID,
        cloudflareToken: CF_TOKEN,
        jobs: { roomRouting: true },
      },
    };
    expect(deciderReady(config, "roomRouting")).toBe(true);
  });
});

describe("end-to-end Clef-Flash execution", () => {
  it("routes decision to Cloudflare Workers AI endpoint with Bearer auth", async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = ACCOUNT_ID;
    process.env.CLOUDFLARE_API_TOKEN = CF_TOKEN;

    const config: AppConfig = {
      decider: { enabled: true, provider: "clef-flash", jobs: { roomRouting: true } },
    };

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        success: true,
        result: {
          model: "clef-flash",
          answers: {
            answer: {
              type: "choice",
              choice: "bob",
              probabilities: { bob: 0.91, alice: 0.09 },
            },
          },
        },
      }),
    );

    const decider = createDecider({
      config: () => config,
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await decider.choose("roomRouting", STATE, QUESTION);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provider).toBe("clef-flash");
    expect(result.answers.choice).toBe("bob");
    expect(result.answers.pTop).toBe(0.91);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${CLEF_FLASH_MODEL}`,
    );
    expect(init?.headers).toMatchObject({
      authorization: `Bearer ${CF_TOKEN}`,
      "content-type": "application/json",
    });
  });

  it("handles room routing end-to-end with Clef-Flash", async () => {
    const config: AppConfig = {
      decider: {
        enabled: true,
        provider: "clef-flash",
        accountId: ACCOUNT_ID,
        cloudflareToken: CF_TOKEN,
        jobs: { roomRouting: true },
      },
    };

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        result: {
          answers: {
            answer: {
              type: "choice",
              choice: "bot_bob",
              probabilities: { bot_bob: 0.88, bot_alice: 0.12 },
            },
          },
        },
      }),
    );

    const decider = createDecider({
      config: () => config,
      fetch: fetchMock as unknown as typeof fetch,
    });

    const route = await decideRoomResponder(decider, {
      room: "Engineering",
      humans: ["Rithwik"],
      members: [
        { id: "bot_alice", name: "Alice", title: "Support" },
        { id: "bot_bob", name: "Bob", title: "Infra" },
      ],
      recent: [],
      message: { from: "Rithwik", text: "Database connection spiking" },
    });

    expect(route).toEqual({
      kind: "member",
      botId: "bot_bob",
      probability: 0.88,
      provider: "clef-flash",
    });
  });

  it("tests key against Clef-Flash endpoint during testKey", async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = ACCOUNT_ID;

    const config: AppConfig = {
      decider: { provider: "clef-flash", accountId: ACCOUNT_ID },
    };

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        success: true,
        result: {
          answers: {
            answer: { type: "noul", noul: 0.99 },
          },
        },
      }),
    );

    const decider = createDecider({
      config: () => config,
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await decider.testKey({ key: "draft_cf_token_123" });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.headers).toMatchObject({
      authorization: "Bearer draft_cf_token_123",
    });
  });

  it("preserves Jev as default when Clef-Flash is not selected", async () => {
    const config: AppConfig = {
      decider: { enabled: true, key: JEV_KEY, jobs: { roomRouting: true } },
    };

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        model: "jev-latest",
        answers: {
          answer: {
            type: "choice",
            choice: "alice",
            probabilities: { alice: 0.95, bob: 0.05 },
          },
        },
      }),
    );

    const decider = createDecider({
      config: () => config,
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await decider.choose("roomRouting", STATE, QUESTION);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provider).toBe("jev");
    expect(result.answers.choice).toBe("alice");

    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.typesafe.ai/v1/systemone");
  });
});

describe("Jev and Clef-Flash status are independent", () => {
  const JEV_ONLY: AppConfig = { decider: { enabled: true, key: JEV_KEY, jobs: { roomRouting: true } } };
  const CLEF_ONLY: AppConfig = {
    decider: { enabled: true, provider: "clef-flash", cloudflareAccountId: ACCOUNT_ID, cloudflareToken: CF_TOKEN, jobs: { roomRouting: true } },
  };
  const BOTH: AppConfig = {
    decider: { enabled: true, key: JEV_KEY, cloudflareAccountId: ACCOUNT_ID, cloudflareToken: CF_TOKEN, jobs: { roomRouting: true } },
  };

  it("Jev only: Jev reports configured and routes rooms with no Clef account", () => {
    const status = describeDecider(JEV_ONLY);
    expect(status).toMatchObject({ provider: "jev", configured: true, enabled: true, jevConfigured: true });
    expect(status).not.toHaveProperty("clefConfigured");
    expect(deciderReady(JEV_ONLY, "roomRouting")).toBe(true);
  });

  it("Clef only: Clef reports configured, Jev does not", () => {
    const status = describeDecider(CLEF_ONLY);
    expect(status).toMatchObject({ provider: "clef-flash", configured: true, enabled: true, clefConfigured: true, clefAccountId: ACCOUNT_ID });
    expect(status).not.toHaveProperty("jevConfigured");
    expect(deciderReady(CLEF_ONLY, "roomRouting")).toBe(true);
  });

  it("both: each reports configured, and the selected provider still routes", async () => {
    expect(describeDecider(BOTH)).toMatchObject({ provider: "jev", jevConfigured: true, clefConfigured: true });
    const both = { decider: { ...BOTH.decider, provider: "clef-flash" as const } };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ success: true, result: { answers: { answer: { type: "choice", choice: "bob", probabilities: { alice: 0.1, bob: 0.9 } } } } }),
    );
    const result = await createDecider({ config: () => both, fetch: fetchMock as unknown as typeof fetch }).choose("roomRouting", STATE, QUESTION);
    expect(result).toMatchObject({ ok: true, provider: "clef-flash" });
    expect(String(fetchMock.mock.calls[0]![0])).toContain(`/ai/run/${CLEF_FLASH_MODEL}`);
  });

  it("neither: nothing reports configured and room routing is not asked", () => {
    const status = describeDecider({});
    expect(status).toMatchObject({ provider: "jev", configured: false, enabled: false });
    expect(status).not.toHaveProperty("jevConfigured");
    expect(status).not.toHaveProperty("clefConfigured");
    expect(deciderReady({}, "roomRouting")).toBe(false);
  });

  it("incomplete Jev credentials: a base URL with a blank key is not configured", async () => {
    const incomplete: AppConfig = { decider: { enabled: true, key: "   ", baseUrl: "http://127.0.0.1:9", jobs: { roomRouting: true } } };
    expect(describeDecider(incomplete)).not.toHaveProperty("jevConfigured");
    expect(deciderReady(incomplete, "roomRouting")).toBe(false);
    const fetchMock = vi.fn<typeof fetch>();
    const result = await createDecider({ config: () => incomplete, fetch: fetchMock as unknown as typeof fetch }).choose("roomRouting", STATE, QUESTION);
    expect(result).toEqual({ ok: false, reason: "no_key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
