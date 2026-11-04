import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StoreProvider, type Bot } from "@/state/store";
import { asterBlobFor } from "@/lib/aster-blobs";
import { BotProfileAvatarCard } from "./BotProfileAvatarCard";

function makeBot(overrides: Partial<Bot> = {}): Bot {
  return {
    id: "bot-1",
    threadId: "thread-1",
    name: "Maus",
    title: "Maus",
    description: "",
    notifications: false,
    color: "green",
    unread: false,
    modelSelection: { instanceId: "local", model: "test-model" },
    messages: [],
    ...overrides,
  };
}

function renderCard(bot: Bot) {
  return renderToStaticMarkup(
    createElement(
      StoreProvider,
      null,
      createElement(BotProfileAvatarCard, {
        bot,
        activeState: "idle",
        mascotMotion: null,
        onPatch: vi.fn(),
      }),
    ),
  );
}

describe("BotProfileAvatarCard and the companions", () => {
  it("offers no body picker: a bot's body is its companion", () => {
    const markup = renderCard(makeBot());
    expect(markup).not.toContain(">Body<");
    expect(markup).not.toMatch(/aria-label="Use the [A-Za-z]+ body"/);
  });

  it("shows the bot's own companion everywhere in the card, whatever retired body it saved", () => {
    const companion = asterBlobFor("bot-1");
    for (const saved of [undefined, "hexagon", "drop", "cursor"]) {
      const markup = renderCard(makeBot(saved ? { mascotBody: saved as Bot["mascotBody"] } : {}));
      const bodies = [...markup.matchAll(/data-body="([a-z]+)"/g)].map((match) => match[1]);
      expect(bodies.length).toBeGreaterThan(1);
      expect(new Set(bodies)).toEqual(new Set([companion]));
    }
  });

  it("offers zoom and drag framing for a custom image", () => {
    const markup = renderCard(makeBot({
      avatarUrl: "/api/attachments/cat.webp",
      avatarCrop: "circle",
      avatarZoom: 1.5,
    }));
    expect(markup).toContain('aria-label="Zoom avatar"');
    expect(markup).toContain("Drag the picture to reposition it");
    expect(markup).toContain("150%");
    expect(markup).toContain("Reset framing");
  });

  it("hides zoom controls for the mascot", () => {
    const markup = renderCard(makeBot());
    expect(markup).not.toContain('aria-label="Zoom avatar"');
  });

  it("keeps an uploaded image's framing controls, on purpose: a photo is the person's own", () => {
    const markup = renderCard(makeBot({ avatarUrl: "/api/attachments/cat.webp", avatarCrop: "rounded" }));
    expect(markup).toContain('aria-label="Zoom avatar"');
    expect(markup).not.toContain(">Body<");
  });
});
