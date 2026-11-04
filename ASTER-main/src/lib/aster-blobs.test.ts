import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BotAvatar, MausAvatar } from "@/components/Avatar";
import { AsterBlobAvatar } from "@/components/aster/AsterBlobAvatar";
import { MASCOT_BODIES } from "../../shared/mascot-bodies";
import { ASTER_BLOB_IDS, asterBlobFor, blobMotionFor, blobPhase, blobStateFor, botBodyFor, isAsterBlob } from "./aster-blobs";

describe("which companion a bot wears", () => {
  it("is stable for a bot and spreads a roster across all four", () => {
    expect(asterBlobFor("5409ef29-6a07-4bfb-b4f7-f3bc2a205330")).toBe(asterBlobFor("5409ef29-6a07-4bfb-b4f7-f3bc2a205330"));
    const worn = new Set(Array.from({ length: 40 }, (_, i) => asterBlobFor(`bot-${i}`)));
    expect([...worn].sort()).toEqual([...ASTER_BLOB_IDS].sort());
  });

  it("ignores a retired geometric body: the bot wears the companion its id picks", () => {
    // The live bots: Yuki saved hexagon, Moss blob, Comet drop. None of it shows.
    for (const legacy of ["hexagon", "blob", "drop", "cursor", "star", "mochi", "nonsense"]) {
      expect(botBodyFor({ id: "koda", mascotBody: legacy })).toBe(asterBlobFor("koda"));
    }
    expect(botBodyFor({ id: "koda", mascotBody: null })).toBe(asterBlobFor("koda"));
    expect(botBodyFor({ name: "Koda" })).toBe(asterBlobFor("Koda"));
    expect(botBodyFor({})).toBe("luma");
  });

  it("honours a saved companion id, the only body that still means anything", () => {
    expect(botBodyFor({ id: "koda", mascotBody: "echo" })).toBe("echo");
    expect(isAsterBlob(botBodyFor({ id: "anything" }))).toBe(true);
  });

  it("every companion is a real catalog body, so the picker and the phones know it", () => {
    for (const id of ASTER_BLOB_IDS) expect(MASCOT_BODIES[id].id).toBe(id);
  });
});

describe("the companions' moods and beats", () => {
  it("busy alone decides thinking when it is known: a coder at rest is not thinking", () => {
    expect(blobStateFor("working", true)).toBe("thinking");
    expect(blobStateFor("working", false)).toBe("idle");
    expect(blobStateFor("working")).toBe("thinking");
    expect(blobStateFor("happy", false)).toBe("happy");
    expect(blobStateFor("drowsy", false)).toBe("sleepy");
    expect(blobStateFor("notifying", false)).toBe("alert");
    expect(blobStateFor("idle", false)).toBe("idle");
  });

  it("maps the avatar's one-shot motions onto the companion beats", () => {
    expect(blobMotionFor("launch")).toBe("message-sent");
    expect(blobMotionFor("success")).toBe("message-received");
    expect(blobMotionFor("blink")).toBe("blink");
    expect(blobMotionFor("none")).toBeNull();
    expect(blobMotionFor("failure")).toBeNull();
  });

  it("gives each bot its own phase so a roster never moves in step", () => {
    const a = blobPhase("koda");
    expect(a).toEqual(blobPhase("koda"));
    expect(a).not.toEqual(blobPhase("yuki"));
    expect(a.enterDelayMs).toBeGreaterThanOrEqual(0);
    expect(a.enterDelayMs).toBeLessThan(240);
  });
});

describe("AsterBlobAvatar", () => {
  const render = (props: Parameters<typeof AsterBlobAvatar>[0]) => renderToStaticMarkup(createElement(AsterBlobAvatar, props));

  it("draws each companion with its visor, eyes and own details at full size", () => {
    const luma = render({ body: "luma", size: 64, label: "Koda" });
    expect(luma).toContain('data-body="luma"');
    expect(luma).toContain("aster-blob__eyes");
    expect(luma).toContain("aster-blob__star");
    expect(luma).toContain("aster-blob__ring");
    expect(luma).toContain('aria-label="Koda"');
    expect(render({ body: "orbit", size: 64 }).match(/aster-blob__moon/g)).toHaveLength(3);
    expect(render({ body: "echo", size: 64 })).not.toContain("aster-blob__ring");
  });

  it("drops the rings and particles at small sizes so the face still reads", () => {
    const small = render({ body: "orbit", size: 24 });
    expect(small).toContain("aster-blob__eyes");
    expect(small).not.toContain("aster-blob__ring");
    expect(small).not.toContain("aster-blob__moon");
    expect(small).not.toContain("aster-blob__particle");
  });

  it("says its mood, stills itself on request, and hides from assistive tech without a label", () => {
    expect(render({ body: "nova", state: "thinking" })).toContain('data-state="thinking"');
    expect(render({ body: "nova", animated: false })).toContain("aster-blob--still");
    expect(render({ body: "nova" })).toContain('aria-hidden="true"');
  });
});

describe("bots wear their companion everywhere BotAvatar draws them", () => {
  it("an unbodied bot and a bot with a retired body both get their companion; an uploaded image is kept", () => {
    const unbodied = renderToStaticMarkup(createElement(BotAvatar, { bot: { id: "koda", name: "Koda", color: "green" }, animated: false }));
    expect(unbodied).toContain(`data-body="${asterBlobFor("koda")}"`);
    const legacy = renderToStaticMarkup(createElement(BotAvatar, { bot: { id: "koda", name: "Koda", color: "green", mascotBody: "hexagon" }, animated: false }));
    expect(legacy).toContain(`data-body="${asterBlobFor("koda")}"`);
    const photo = renderToStaticMarkup(createElement(BotAvatar, { bot: { id: "koda", name: "Koda", color: "green", avatarUrl: "/api/attachments/koda.webp", avatarCrop: "circle" } }));
    expect(photo).toContain("<img");
    expect(photo).not.toContain("aster-blob");
  });

  it("a busy bot thinks; a selected one shows it", () => {
    expect(renderToStaticMarkup(createElement(BotAvatar, { bot: { id: "koda", color: "green", busy: true } }))).toContain('data-state="thinking"');
    expect(renderToStaticMarkup(createElement(MausAvatar, { color: "green", bodyId: "luma", selected: true }))).toContain('data-state="selected"');
  });
});

describe("the home's central mascot is the open bot's companion", () => {
  // MascotCentrepiece reads the bot ChatView is showing, so switching chats is
  // switching this prop; no mascot state of its own to get stuck.
  const hero = async (bot: { id: string; name: string; mascotBody?: string }) => {
    const { MascotCentrepiece } = await import("@/components/MascotCentrepiece");
    const full = { threadId: `t-${bot.id}`, title: "", description: "", notifications: false, color: "green", unread: false,
      modelSelection: { instanceId: "local", model: "m" }, messages: [], ...bot } as never;
    const markup = renderToStaticMarkup(createElement(MascotCentrepiece, { bot: full, messages: [] }));
    return /data-mascot-companion[\s\S]*?data-body="([a-z]+)"/.exec(markup)?.[1];
  };

  it("draws the bot's own companion, and switching bots switches it", async () => {
    const bots = ["yuki-id", "moss-id", "comet-id", "koda-id"].map((id) => ({ id, name: id.split("-")[0]! }));
    for (const bot of bots) expect(await hero(bot)).toBe(asterBlobFor(bot.id));
    expect(new Set(await Promise.all(bots.map(hero))).size).toBeGreaterThan(1);
  });

  it("is the bot's companion even when the bot saved a retired body", async () => {
    expect(await hero({ id: "yuki-id", name: "Yuki", mascotBody: "hexagon" })).toBe(asterBlobFor("yuki-id"));
  });
});
