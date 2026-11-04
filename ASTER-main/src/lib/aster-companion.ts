// What the ASTER home screen shows about the companion: the greeting, the
// mode a person picked, the growth stage of the conversation in front of
// them, and the mood the hero mascot moves in. Pure, so the panels stay thin.
import type { Message } from "@/state/store";

export type AsterMode = "balanced" | "creative" | "technical" | "study" | "relaxed";
export const ASTER_MODES: AsterMode[] = ["balanced", "creative", "technical", "study", "relaxed"];
const MODE_KEY = "aster.mode";

/** The mode is a preference of this browser only; nothing on the server
 * reads it yet. Storage can throw (private mode), so every access is
 * guarded and a failure falls back to Balanced. */
export function readAsterMode(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): AsterMode {
  try {
    const stored = storage?.getItem(MODE_KEY);
    return ASTER_MODES.includes(stored as AsterMode) ? (stored as AsterMode) : "balanced";
  } catch {
    return "balanced";
  }
}

export function saveAsterMode(mode: AsterMode, storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(MODE_KEY, mode);
  } catch {
    /* the choice still applies for this session */
  }
}

export type GrowthStage = "curious" | "learning" | "planning" | "working" | "achieved";
export const GROWTH_STAGES: GrowthStage[] = ["curious", "learning", "planning", "working", "achieved"];

const isReceipt = (message: Message) => message.kind === "digest" || message.kind === "compaction";

/** Where the open conversation stands, read from its messages: nothing asked
 * yet, asked and not started, thinking, running tools, or answered. */
export function growthStage(bot: { busy?: boolean; messages: Message[] }): GrowthStage {
  const rows = bot.messages.filter((message) => !isReceipt(message));
  if (!rows.some((message) => message.role === "user")) return "curious";
  const last = rows.at(-1);
  if (bot.busy) return last?.kind === "activity" ? "working" : "planning";
  return last?.role === "user" ? "learning" : "achieved";
}

/** The four moods the hero mascot animates. */
export type CompanionMood = "idle" | "listening" | "thinking" | "responding";

export function companionMood(input: { busy?: boolean; typing?: boolean; streaming?: boolean }): CompanionMood {
  if (input.busy) return input.streaming ? "responding" : "thinking";
  return input.typing ? "listening" : "idle";
}

export function greetingFor(hour: number): "morning" | "afternoon" | "evening" {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  return "evening";
}

/** The seeded opening line every new bot's thread starts with
 * (server/store.ts createBot): `Hi, I'm <name>. What would you like me to do?` */
const OPENING_GREETING = /^Hi, I'm .+\. What would you like me to do\?$/;

/** Whether a thread is still at its start, so the home hero takes the place
 * of the transcript: nothing yet, or only the bot's own opening greeting. A
 * thread holding any other bot content (a routine result, a peer's message, a
 * webhook) is a conversation and must show it, even with no user turn. */
export function isCompanionHome(bot: { busy?: boolean }, messages: Pick<Message, "role" | "kind" | "text">[]): boolean {
  if (bot.busy) return false;
  return messages.every((message) =>
    message.role === "bot" && message.kind === "text" && OPENING_GREETING.test(message.text ?? ""));
}
