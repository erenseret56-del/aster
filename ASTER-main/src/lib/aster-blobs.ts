// The ASTER companions (the brand sheet's Luma, Nova, Orbit and Echo): which
// one a bot wears, and which of the avatar's moods they show. Pure, so every
// place that draws a bot agrees, and it is unit-tested.
import type { MascotBodyId } from "../../shared/mascot-bodies";
import type { MausMotion, MausState } from "./mascot";

export const ASTER_BLOB_IDS = ["luma", "nova", "orbit", "echo"] as const satisfies readonly MascotBodyId[];
export type AsterBlobId = (typeof ASTER_BLOB_IDS)[number];

export function isAsterBlob(id: string | null | undefined): id is AsterBlobId {
  return (ASTER_BLOB_IDS as readonly string[]).includes(id ?? "");
}

/** FNV-1a: small, stable across runs and platforms, good enough to spread ids. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The companion a bot wears when it has not chosen a body: the same bot always
 * gets the same one, on every screen, and a roster gets a mix.
 */
export function asterBlobFor(identity: string): AsterBlobId {
  return ASTER_BLOB_IDS[hash(identity) % ASTER_BLOB_IDS.length]!;
}

/** The default companion, for an avatar that stands for no bot in particular. */
export const DEFAULT_COMPANION: AsterBlobId = "luma";

/** A companion id as given, or the default for anything else: an unknown
 * value, or a body from the retired geometric catalog (cursor, hexagon...). */
export function companionBody(value: string | null | undefined): AsterBlobId {
  return isAsterBlob(value) ? value : DEFAULT_COMPANION;
}

/**
 * The companion a bot wears. A saved companion id is honoured; anything else
 * saved (a retired geometric body such as hexagon or drop) is ignored, never
 * migrated or deleted, and the bot wears the companion its id picks.
 */
export function botBodyFor(bot: { id?: string; name?: string; mascotBody?: string | null }): AsterBlobId {
  if (isAsterBlob(bot.mascotBody)) return bot.mascotBody;
  const identity = bot.id || bot.name;
  return identity ? asterBlobFor(identity) : DEFAULT_COMPANION;
}

/** The moods the companions draw, the reusable animation API's states. */
export type AsterBlobState = "idle" | "thinking" | "happy" | "sleepy" | "alert" | "selected";
/** One-shot beats, played once and handed back. */
export type AsterBlobMotion = "blink" | "message-sent" | "message-received";

const HAPPY: ReadonlySet<MausState> = new Set<MausState>(["happy", "proud", "excited", "celebrate", "laughing", "playful", "bouncing"]);
const SLEEPY: ReadonlySet<MausState> = new Set<MausState>(["sleeping", "drowsy", "bored", "powering-down"]);
const ALERT: ReadonlySet<MausState> = new Set<MausState>(["alerting", "notifying", "surprised", "scared"]);
const WORKING: ReadonlySet<MausState> = new Set<MausState>([
  "thinking", "searching", "working", "loading", "listening", "orbit", "radar", "progress",
  "humming", "writing", "dictating", "uploading", "receiving", "sending",
]);

/**
 * The companion's mood for a bot's mascot state. A bot's resting state is
 * partly about what it does (a coder rests as "working"), so when [busy] is
 * known it alone decides thinking; without it the state does.
 */
export function blobStateFor(state: MausState, busy?: boolean): AsterBlobState {
  if (busy === true) return "thinking";
  if (ALERT.has(state)) return "alert";
  if (HAPPY.has(state)) return "happy";
  if (SLEEPY.has(state)) return "sleepy";
  if (busy === undefined && WORKING.has(state)) return "thinking";
  return "idle";
}

/** The avatar's one-shot motions as companion beats; null where none fits. */
export function blobMotionFor(motion: MausMotion): AsterBlobMotion | null {
  switch (motion) {
    case "launch":
    case "arrive":
    case "switch":
      return "message-sent";
    case "success":
    case "celebrate":
    case "customize":
      return "message-received";
    case "blink":
    case "surprise":
      return "blink";
    default:
      return null;
  }
}

/** A per-bot phase, so a roster of companions never bobs or blinks in step. */
export function blobPhase(identity: string): { floatDelayS: number; blinkDelayS: number; enterDelayMs: number } {
  const h = hash(identity);
  return {
    floatDelayS: -((h % 4600) / 1000),
    blinkDelayS: -(((h >>> 8) % 6200) / 1000),
    enterDelayMs: (h >>> 16) % 240,
  };
}
