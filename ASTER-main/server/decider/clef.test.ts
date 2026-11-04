import { describe, expect, it, vi } from "vitest";

import {
  CLEF_BODY_MODEL,
  CLEF_FLASH_MODEL,
  clefBackend,
  clefEndpoint,
  clefRequestBody,
  parseClefResponse,
  questionsFit,
} from "./clef.ts";
import type { BackendRequest, DeciderQuestion } from "./types.ts";

const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const TOKEN = "cft_test_token_secret_123456789";

const OPTIONS = { billing: "Billing and invoices", technical: "Technical support" };
const CHOICE_Q: DeciderQuestion = { type: "choice", instructions: "Pick a department", options: OPTIONS };
const SCORE_Q: DeciderQuestion = { type: "score", instructions: "Rate severity", levels: ["low", "medium", "high"] };
const YESNO_Q: DeciderQuestion = { type: "yesno", instructions: "Is this an outage?", criteria: { yes: "Total downtime", no: "Minor glitch" } };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("clefEndpoint", () => {
  it("constructs the official Cloudflare Workers AI URL", () => {
    const url = clefEndpoint(ACCOUNT_ID);
    expect(url?.href).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${CLEF_FLASH_MODEL}`,
    );
  });

  it("supports loopback http URLs for test servers", () => {
    const url = clefEndpoint(ACCOUNT_ID, "http://127.0.0.1:8765");
    expect(url?.href).toBe(
      `http://127.0.0.1:8765/client/v4/accounts/${ACCOUNT_ID}/ai/run/${CLEF_FLASH_MODEL}`,
    );
  });

  it("supports direct ai/run endpoint URLs in baseUrl", () => {
    const direct = `http://127.0.0.1:8765/ai/run/${CLEF_FLASH_MODEL}`;
    const url = clefEndpoint(ACCOUNT_ID, direct);
    expect(url?.href).toBe(direct);
  });

  it("refuses plain http to non-loopback addresses", () => {
    expect(clefEndpoint(ACCOUNT_ID, "http://api.cloudflare.com")).toBeNull();
    expect(clefEndpoint(ACCOUNT_ID, "http://evil.example.com")).toBeNull();
  });

  it("refuses missing or invalid account IDs", () => {
    expect(clefEndpoint("")).toBeNull();
    expect(clefEndpoint("   ")).toBeNull();
    expect(clefEndpoint(undefined)).toBeNull();
    expect(clefEndpoint("bad account/with/slashes")).toBeNull();
  });

  it("refuses URLs with credentials", () => {
    expect(clefEndpoint(ACCOUNT_ID, "https://user:pass@api.cloudflare.com")).toBeNull();
  });
});

describe("questionsFit", () => {
  it("validates choice option count (2 to 255)", () => {
    expect(questionsFit({ q: CHOICE_Q })).toBe(true);
    expect(questionsFit({ q: { type: "choice", instructions: "Too few", options: { one: "Single" } } })).toBe(false);
  });

  it("validates score level count (2 to 10)", () => {
    expect(questionsFit({ q: SCORE_Q })).toBe(true);
    expect(questionsFit({ q: { type: "score", instructions: "One level", levels: ["only"] } })).toBe(false);
  });

  it("rejects empty questions map", () => {
    expect(questionsFit({})).toBe(false);
  });
});

describe("clefRequestBody", () => {
  it("structures questions into wire schema with model and state", () => {
    const state = { text: "Can't log into the portal" };
    const body = clefRequestBody(state, {
      dept: CHOICE_Q,
      severity: SCORE_Q,
      outage: YESNO_Q,
    });

    expect(body.model).toBe(CLEF_BODY_MODEL);
    expect(body.state).toEqual(state);
    expect(body.questions.dept).toEqual({
      type: "choice",
      instructions: CHOICE_Q.instructions,
      criteria: OPTIONS,
    });
    expect(body.questions.severity).toEqual({
      type: "score",
      instructions: SCORE_Q.instructions,
      criteria: ["low", "medium", "high"],
    });
    expect(body.questions.outage).toEqual({
      type: "noul",
      instructions: YESNO_Q.instructions,
      criteria: { true: "Total downtime", false: "Minor glitch" },
    });
  });
});

describe("parseClefResponse", () => {
  it("parses Cloudflare wrapped response envelope", () => {
    const cfEnvelope = {
      success: true,
      errors: [],
      messages: [],
      result: {
        model: "clef-flash",
        answers: {
          dept: {
            type: "choice",
            choice: "technical",
            probabilities: { technical: 0.95, billing: 0.05 },
          },
        },
        usage: { input_tokens: 128 },
      },
    };

    const parsed = parseClefResponse(cfEnvelope, { dept: CHOICE_Q });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.inputTokens).toBe(128);
    expect(parsed.answers.dept).toMatchObject({
      type: "choice",
      choice: "technical",
      pTop: 0.95,
      probabilities: { technical: 0.95, billing: 0.05 },
    });
    expect((parsed.answers.dept as any).margin).toBeCloseTo(0.9, 5);
  });

  it("parses unwrapped answer object", () => {
    const raw = {
      model: "clef-flash",
      answers: {
        outage: { type: "noul", noul: 0.88 },
      },
    };
    const parsed = parseClefResponse(raw, { outage: YESNO_Q });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.answers.outage).toEqual({ type: "yesno", p: 0.88 });
  });

  it("supports selected property and confidence fallback for choice", () => {
    const raw = {
      result: {
        answers: {
          dept: {
            type: "choice",
            selected: "billing",
            confidence: 0.9,
          },
        },
      },
    };
    const parsed = parseClefResponse(raw, { dept: CHOICE_Q });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.answers.dept).toMatchObject({
      type: "choice",
      choice: "billing",
      pTop: 0.9,
    });
  });

  it("parses score with array probabilities", () => {
    const raw = {
      result: {
        answers: {
          severity: {
            type: "score",
            score: 1.75,
            probabilities: [0.05, 0.15, 0.8],
          },
        },
      },
    };
    const parsed = parseClefResponse(raw, { severity: SCORE_Q });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.answers.severity).toEqual({
      type: "score",
      score: 1.75,
      level: 2,
      probabilities: [0.05, 0.15, 0.8],
    });
  });

  it("rejects success: false responses", () => {
    const failure = {
      success: false,
      errors: [{ code: 10000, message: "Authentication error" }],
      result: null,
    };
    expect(parseClefResponse(failure, { dept: CHOICE_Q })).toEqual({ ok: false });
  });

  it("rejects choice not in offered set", () => {
    const badChoice = {
      result: {
        answers: {
          dept: { type: "choice", choice: "unknown", probabilities: { unknown: 1.0 } },
        },
      },
    };
    expect(parseClefResponse(badChoice, { dept: CHOICE_Q })).toEqual({ ok: false });
  });

  it("rejects probabilities that do not sum to ~1", () => {
    const badSum = {
      result: {
        answers: {
          dept: { type: "choice", choice: "technical", probabilities: { technical: 0.5, billing: 0.1 } },
        },
      },
    };
    expect(parseClefResponse(badSum, { dept: CHOICE_Q })).toEqual({ ok: false });
  });
});

describe("clefBackend.decide", () => {
  function makeReq(overrides: Partial<BackendRequest> = {}): BackendRequest {
    return {
      key: TOKEN,
      accountId: ACCOUNT_ID,
      state: { input: "test" },
      questions: { dept: CHOICE_Q },
      signal: new AbortController().signal,
      fetch: vi.fn() as unknown as typeof fetch,
      ...overrides,
    };
  }

  it("performs POST with Authorization Bearer header and parses response", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        success: true,
        result: {
          model: "clef-flash",
          answers: {
            dept: {
              type: "choice",
              choice: "technical",
              probabilities: { technical: 0.92, billing: 0.08 },
            },
          },
        },
      }),
    );

    const req = makeReq({ fetch: fetchMock as unknown as typeof fetch });
    const result = await clefBackend.decide(req);

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain(`/accounts/${ACCOUNT_ID}/ai/run/${CLEF_FLASH_MODEL}`);
    expect(init?.headers).toMatchObject({
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
      accept: "application/json",
    });
  });

  it("reports phase timings, and only timings", async () => {
    const answer = { success: true, result: { answers: { dept: { type: "choice", choice: "technical", probabilities: { technical: 0.9, billing: 0.1 } } } } };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(answer), { status: 200 }));
    const result = await clefBackend.decide(makeReq({ fetch: fetchMock as unknown as typeof fetch }));
    expect(result.ok).toBe(true);
    expect(result.timing).toEqual({ requestMs: expect.any(Number), responseMs: expect.any(Number), parseMs: expect.any(Number) });
    expect(JSON.stringify(result.timing)).not.toContain(TOKEN);
  });

  it("sends every call through one shared keep-alive dispatcher", async () => {
    const answer = { success: true, result: { answers: { dept: { type: "choice", choice: "technical", probabilities: { technical: 0.9, billing: 0.1 } } } } };
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(answer), { status: 200 }));
    await clefBackend.decide(makeReq({ fetch: fetchMock as unknown as typeof fetch }));
    await clefBackend.decide(makeReq({ fetch: fetchMock as unknown as typeof fetch }));
    const first = (fetchMock.mock.calls[0]![1] as { dispatcher?: unknown }).dispatcher;
    const second = (fetchMock.mock.calls[1]![1] as { dispatcher?: unknown }).dispatcher;
    expect(first).toBeDefined();
    expect(second).toBe(first);
  });

  it("maps 401 and 403 to rejected", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("Unauthorized", { status: 401 }));
    const result = await clefBackend.decide(makeReq({ fetch: fetchMock as unknown as typeof fetch }));
    expect(result).toEqual({ ok: false, reason: "rejected", status: 401, timing: { requestMs: expect.any(Number) } });
  });

  it("maps 429 to rate_limited", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("Rate limited", { status: 429 }));
    const result = await clefBackend.decide(makeReq({ fetch: fetchMock as unknown as typeof fetch }));
    expect(result).toEqual({ ok: false, reason: "rate_limited", status: 429, timing: { requestMs: expect.any(Number) } });
  });

  it("maps 500, 502, 503 to overloaded", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("Server Error", { status: 503 }));
    const result = await clefBackend.decide(makeReq({ fetch: fetchMock as unknown as typeof fetch }));
    expect(result).toEqual({ ok: false, reason: "overloaded", status: 503, timing: { requestMs: expect.any(Number) } });
  });

  it("maps an unknown model (404 from Workers AI) to http_error without throwing", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ success: false, errors: [{ code: 5007, message: "No such model" }] }, 404),
    );
    const result = await clefBackend.decide(makeReq({ fetch: fetchMock as unknown as typeof fetch }));
    expect(result).toEqual({ ok: false, reason: "http_error", status: 404, timing: { requestMs: expect.any(Number) } });
  });

  it("maps network errors to unreachable", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("Network drop"));
    const result = await clefBackend.decide(makeReq({ fetch: fetchMock as unknown as typeof fetch }));
    expect(result).toEqual({ ok: false, reason: "unreachable", timing: { requestMs: expect.any(Number) } });
  });

  it("maps malformed JSON response to malformed", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("not json", { status: 200 }));
    const result = await clefBackend.decide(makeReq({ fetch: fetchMock as unknown as typeof fetch }));
    expect(result).toEqual({ ok: false, reason: "malformed", timing: { requestMs: expect.any(Number), responseMs: expect.any(Number) } });
  });
});
