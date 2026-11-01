import { afterEach, describe, expect, it } from "vitest";

import { setLocale } from "./i18n";
import { effectiveDefaultResponder, goalCoordinatorForComposer, groupComposerHint, groupResponseHint, roomRespondersForComposer, roomRoutingOn } from "./group-routing";
import type { ConfigStatus, Group, GroupDefaultResponder } from "@/state/store";

describe("roomRespondersForComposer", () => {
  const members = [
    { id: "atlas", name: "Atlas" },
    { id: "milind", name: "Milind" },
  ];

  it("routes an unmentioned message to the configured lead", () => {
    expect(
      roomRespondersForComposer("hello there", members, { defaultResponder: { kind: "member", botId: "atlas" } }),
    ).toEqual([members[0]]);
  });

  it("lets explicit mentions override the configured lead", () => {
    expect(
      roomRespondersForComposer("@Milind take this", members, { defaultResponder: { kind: "member", botId: "atlas" } }),
    ).toEqual([members[1]]);
  });

  it("uses the shared Markdown, punctuation, and Unicode mention boundaries", () => {
    const mentionsOnly = { defaultResponder: { kind: "mentions" } } as const;
    expect(roomRespondersForComposer("**@Milind**", members, mentionsOnly)).toEqual([members[1]]);
    expect(roomRespondersForComposer("(@Milind)", members, mentionsOnly)).toEqual([members[1]]);
    expect(roomRespondersForComposer("【@Milind】", members, mentionsOnly)).toEqual([members[1]]);
    expect(roomRespondersForComposer("user@Milind /@Milind", members, mentionsOnly)).toEqual([]);
    expect(roomRespondersForComposer("@Milindo", members, mentionsOnly)).toEqual([]);
    expect(roomRespondersForComposer("@Milind𐐀", members, mentionsOnly)).toEqual([]);
    expect(roomRespondersForComposer("İ @Milind", members, mentionsOnly)).toEqual([members[1]]);
  });

  it("supports everyone and mentions-only room policies", () => {
    expect(roomRespondersForComposer("hello", members, { defaultResponder: { kind: "everyone" } })).toEqual(members);
    expect(roomRespondersForComposer("hello", members, { defaultResponder: { kind: "mentions" } })).toEqual([]);
    expect(roomRespondersForComposer("@everyone hello", members, { defaultResponder: { kind: "mentions" } })).toEqual(
      members,
    );
  });

  it("applies the shared mention boundaries to everyone", () => {
    const mentionsOnly = { defaultResponder: { kind: "mentions" } } as const;
    expect(roomRespondersForComposer("**@EVERYONE** hello", members, mentionsOnly)).toEqual(members);
    expect(roomRespondersForComposer("【@everyone】 hello", members, mentionsOnly)).toEqual(members);
    expect(roomRespondersForComposer("@everyone調査 hello", members, mentionsOnly)).toEqual([]);
    expect(roomRespondersForComposer("@everyone𐐀 hello", members, mentionsOnly)).toEqual([]);
    expect(roomRespondersForComposer("user@everyone /@everyone", members, mentionsOnly)).toEqual([]);
    expect(roomRespondersForComposer("İ @everyone", members, mentionsOnly)).toEqual(members);
  });
});

describe("goalCoordinatorForComposer", () => {
  const members = [
    { id: "first", name: "First" },
    { id: "chief", name: "Chief", chiefOfStaff: true },
    { id: "writer", name: "Writer" },
  ];

  it("uses an explicit mention before the configured lead", () => {
    expect(goalCoordinatorForComposer(
      "@Writer finish this",
      members,
      { defaultResponder: { kind: "member", botId: "first" } },
    )?.id).toBe("writer");
  });

  it("uses wrapped explicit mentions before the configured lead", () => {
    expect(goalCoordinatorForComposer(
      "**@Writer** finish this",
      members,
      { defaultResponder: { kind: "member", botId: "first" } },
    )?.id).toBe("writer");
  });

  it("falls back to the in-room Chief for mentions-only goal channels", () => {
    expect(goalCoordinatorForComposer(
      "finish this",
      members,
      { defaultResponder: { kind: "mentions" } },
    )?.id).toBe("chief");
  });
});

describe("composer hint, in the reader's language", () => {
  afterEach(() => {
    setLocale("en");
  });

  it("translates every routing case and keeps the lead's own name", () => {
    const members = [
      { id: "first", name: "Juniper" },
      { id: "lead", name: "Atlas" },
    ] as Parameters<typeof groupComposerHint>[1];
    const room = (defaultResponder: GroupDefaultResponder) =>
      ({ defaultResponder, dm: false }) as Parameters<typeof groupComposerHint>[0];

    setLocale("pt-br");
    expect(groupComposerHint(room({ kind: "everyone" }), members)).toBe("todos respondem");
    expect(groupComposerHint(room({ kind: "mentions" }), members)).toBe("@ para chamar um bot");
    // Select the non-first member so fallback routing cannot satisfy the assertion.
    expect(groupComposerHint(room({ kind: "member", botId: "lead" }), members)).toBe("Atlas responde");
    expect(groupComposerHint({ dm: true } as Parameters<typeof groupComposerHint>[0], members)).toBe(
      "continuar a conversa",
    );

    setLocale("ja");
    expect(groupComposerHint(room({ kind: "everyone" }), members)).toBe("全員が応答します");
  });
});

describe("Clef rooms", () => {
  const members = [{ id: "maya", name: "Maya" }, { id: "theo", name: "Theo" }] as Parameters<typeof groupComposerHint>[1];
  const room = (defaultResponder: GroupDefaultResponder) => ({ defaultResponder, dm: false }) as Group;
  const config = (decider: Partial<NonNullable<ConfigStatus["decider"]>>) =>
    ({ decider: { provider: "jev", configured: false, enabled: false, jobs: { roomRouting: true }, ...decider } }) as ConfigStatus;

  it("keep Clef when their fallback bot has left the room", () => {
    expect(effectiveDefaultResponder(room({ kind: "auto", engine: "clef", fallbackBotId: "gone" }), members)).toEqual({ kind: "auto", engine: "clef" });
    expect(effectiveDefaultResponder(room({ kind: "auto", fallbackBotId: "gone" }), members)).toEqual({ kind: "auto" });
  });

  it("ask the Clef engine, not Jev's switch", () => {
    const clef = room({ kind: "auto", engine: "clef" });
    const auto = room({ kind: "auto" });
    expect(roomRoutingOn(clef, config({ clefReady: true }))).toBe(true);
    expect(roomRoutingOn(clef, config({ enabled: true, configured: true }))).toBe(false);
    expect(roomRoutingOn(auto, config({ clefReady: true }))).toBe(false);
    expect(roomRoutingOn(auto, config({ enabled: true, configured: true }))).toBe(true);
  });

  it("say Clef picks, or name the lead while its engine is off", () => {
    const clef = room({ kind: "auto", engine: "clef", fallbackBotId: "theo" });
    expect(groupComposerHint(clef, members, { jevOn: true })).toBe("Clef picks who responds");
    expect(groupResponseHint(clef, members, { jevOn: true })).toContain("Clef picks who answers each message");
    expect(groupComposerHint(clef, members, { jevOn: false })).toContain("Theo");
  });

  it("let any member be picked, and @mentions still win", () => {
    const clef = room({ kind: "auto", engine: "clef" });
    expect(roomRespondersForComposer("who can help?", members, clef).map((member) => member.id)).toEqual(["maya", "theo"]);
    expect(roomRespondersForComposer("@Theo can you?", members, clef).map((member) => member.id)).toEqual(["theo"]);
  });
});
