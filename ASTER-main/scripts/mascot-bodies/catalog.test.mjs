import { describe, expect, it } from "vitest";

import {
  DEFAULT_MASCOT_BODY,
  MASCOT_BODIES,
  MASCOT_BODY_IDS,
  botMascotBody,
  mascotBodySchema,
} from "../../shared/mascot-bodies.ts";

describe("the generated catalog", () => {
  it("carries exactly the four ASTER companions, no retired geometric body", () => {
    expect([...MASCOT_BODY_IDS]).toEqual(["luma", "nova", "orbit", "echo"]);
    for (const retired of ["cursor", "blob", "circle", "hexagon", "drop", "star", "mochi"]) expect(retired in MASCOT_BODIES).toBe(false);
    for (const id of MASCOT_BODY_IDS) expect(MASCOT_BODIES[id].id).toBe(id);
  });

  it("defaults to the ASTER Luma companion", () => {
    expect(DEFAULT_MASCOT_BODY).toBe("luma");
  });

  it("gives every body the markup the renderer expects", () => {
    for (const id of MASCOT_BODY_IDS) {
      const entry = MASCOT_BODIES[id];
      expect(entry.body, id).toContain('fill="{{GRADIENT}}"');
      expect(entry.clip, id).not.toContain("fill=");
      expect(entry.fit, id).toMatch(/^translate\(/);
      expect(entry.name.length, id).toBeGreaterThan(0);
    }
  });

  it("places every face inside its body", () => {
    for (const id of MASCOT_BODY_IDS) {
      const { anchor } = MASCOT_BODIES[id];
      expect(anchor.scale, id).toBeGreaterThan(0);
      expect(anchor.scale, id).toBeLessThanOrEqual(1);
      expect(anchor.x, id).toBeGreaterThan(0);
      expect(anchor.y, id).toBeGreaterThan(0);
    }
  });

  it("clamps every face to one shared size", () => {
    const scales = new Set(MASCOT_BODY_IDS.map(id => MASCOT_BODIES[id].anchor.scale));
    expect([...scales]).toHaveLength(1);
  });
});

describe("botMascotBody", () => {
  it("accepts a known id", () => {
    expect(botMascotBody("orbit")).toBe("orbit");
  });

  it("falls back to the default Luma for anything else", () => {
    expect(botMascotBody("hexagram")).toBe("luma");
    expect(botMascotBody(undefined)).toBe("luma");
    expect(botMascotBody(null)).toBe("luma");
    expect(botMascotBody(42)).toBe("luma");
    for (const retired of ["cursor", "hexagon", "drop", "blob"]) expect(botMascotBody(retired)).toBe("luma");
  });

  it("exposes a schema that rejects an unknown id", () => {
    expect(mascotBodySchema.safeParse("echo").success).toBe(true);
    expect(mascotBodySchema.safeParse("star").success).toBe(false);
    expect(mascotBodySchema.safeParse("nope").success).toBe(false);
  });
});
