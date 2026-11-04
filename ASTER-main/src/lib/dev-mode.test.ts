import { afterEach, describe, expect, it, vi } from "vitest";

import { devMode } from "./dev-mode";
import { browserUnavailableReason } from "./feature-flags";
import { setLocale } from "./i18n";

const notInstalled = { browserEngine: { kind: "unavailable" as const, installable: true } };

afterEach(() => {
  vi.unstubAllEnvs();
  setLocale("en");
});

describe("Dev Mode", () => {
  it("is on when running from source and off in the packaged build", () => {
    expect(devMode()).toBe(true);
    vi.stubEnv("DEV", false);
    expect(devMode()).toBe(false);
  });

  it("names the upstream CLI only in Dev Mode", () => {
    setLocale("en");
    expect(browserUnavailableReason(notInstalled)).toContain("openmausbot browser install");
    vi.stubEnv("DEV", false);
    const reason = browserUnavailableReason(notInstalled);
    expect(reason).toContain("Bot's computer → Browser");
    expect(reason).not.toMatch(/openmausbot/i);
  });
});
