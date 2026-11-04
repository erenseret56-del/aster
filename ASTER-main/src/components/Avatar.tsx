// Bot avatar: every bot is drawn as its ASTER companion (Luma, Nova, Orbit or
// Echo; aster/AsterBlobAvatar.tsx). MausAvatar keeps the app's historical API
// so call sites stay as they were; BotAvatar adds the bot's uploaded image,
// when it has one, and otherwise resolves the bot's companion.
import { memo, useEffect, useState } from "react";
import type { MausColor, MausMotion, MausState } from "@/lib/mascot";
import { botAvatarProfile, clampAvatarFocus, clampAvatarZoom, type BotAvatarCrop } from "../../shared/bot-avatar";
import { blobMotionFor, blobStateFor, botBodyFor, companionBody } from "@/lib/aster-blobs";
import { AsterBlobAvatar } from "./aster/AsterBlobAvatar";

export type MausAvatarProps = {
  /** Kept for the call sites that pass it; a companion's palette is its own. */
  color?: MausColor;
  /** Named behaviour, drawn as the companion's mood. */
  state?: MausState;
  size?: number;
  label?: string;
  motion?: MausMotion;
  motionKey?: number;
  /** Run the animation. Off draws the companion still. */
  animated?: boolean;
  /** Which companion to draw. Anything that is not a companion id (a body from
   * the retired geometric catalog) draws the default companion. */
  bodyId?: string | null;
  /** Whether the bot is working: the thinking mood and the message beats. */
  busy?: boolean;
  /** Stable per-bot identity, so a roster of companions never moves in step. */
  identity?: string;
  /** The avatar stands for the selected bot. */
  selected?: boolean;
  /** Accepted for older call sites; companions do not follow the pointer. */
  trackPointer?: boolean;
};

function MausAvatarComponent({
  state = "idle",
  size = 44,
  label,
  motion = "none",
  motionKey = 0,
  animated = true,
  bodyId,
  busy,
  identity,
  selected = false,
}: MausAvatarProps) {
  return (
    <AsterBlobAvatar
      body={companionBody(bodyId)}
      size={size}
      state={selected ? "selected" : blobStateFor(state, busy)}
      motion={blobMotionFor(motion)}
      motionKey={motionKey}
      busy={busy}
      identity={identity}
      animated={animated}
      label={label ?? null}
    />
  );
}

export const MausAvatar = memo(MausAvatarComponent);

export type BotAvatarProps = Omit<MausAvatarProps, "color"> & {
  bot: {
    /** The bot's id: picks its ASTER companion when it has not chosen a body. */
    id?: string;
    name?: string;
    color: MausColor;
    /** Working on a turn: the companions show it and beat on the change. */
    busy?: boolean;
    avatarUrl?: string | null;
    avatarCrop?: BotAvatarCrop;
    avatarZoom?: number;
    avatarFocusX?: number;
    avatarFocusY?: number;
    /** A saved body. Only a companion id is honoured; a retired geometric body is ignored. */
    mascotBody?: string | null;
  };
};

export type BotAvatarOutcome = "flatImage" | "gradientMascot";

/**
 * Pick which of the two ways to render a bot's avatar, given the parsed
 * profile plus whether the image has already failed to load. Kept as a pure
 * function — independent of React state and effects — so both arms can be
 * unit-tested directly: `imageFailed` is set by the `<img>`'s own `onError`,
 * which `renderToStaticMarkup` never fires, so the failure fallback is
 * unreachable from a synchronous render test.
 *
 * The iOS half of this decision is `resolveBotAvatarOutcome` in
 * `ios/Sources/CompanionCore/BotAvatarRendering.swift`, which mirrors this
 * union name for name so the two renderers can be read side by side.
 */
export function resolveBotAvatarOutcome(params: {
  avatarCrop: BotAvatarCrop;
  hasUrl: boolean;
  imageFailed: boolean;
}): BotAvatarOutcome {
  const { avatarCrop, hasUrl, imageFailed } = params;
  if (!hasUrl) return "gradientMascot";
  if (avatarCrop === "mascot") return "gradientMascot";
  if (imageFailed) return "gradientMascot";
  return "flatImage";
}

/**
 * The one renderer for a bot's chosen profile image. Malformed persisted
 * values and images that fail to load both fall back to the animated mascot,
 * so an old/corrupt profile can never leave a broken-image icon in the app.
 */
export function BotAvatar({ bot, size = 44, label, ...mascotProps }: BotAvatarProps) {
  const profile = botAvatarProfile(bot);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [profile.avatarUrl]);

  const outcome = resolveBotAvatarOutcome({
    avatarCrop: profile.avatarCrop,
    hasUrl: Boolean(profile.avatarUrl),
    imageFailed,
  });

  if (outcome !== "flatImage") {
    return (
      <MausAvatar
        bodyId={botBodyFor(bot)}
        busy={bot.busy}
        identity={bot.id ?? bot.name}
        {...mascotProps}
        color={bot.color}
        size={size}
        label={label ?? bot.name}
      />
    );
  }

  const radius =
    profile.avatarCrop === "circle"
      ? "50%"
      : profile.avatarCrop === "rounded"
        ? "22%"
        : "0";
  const zoom = clampAvatarZoom(bot.avatarZoom ?? 1);
  const focusX = clampAvatarFocus(bot.avatarFocusX ?? 0.5);
  const focusY = clampAvatarFocus(bot.avatarFocusY ?? 0.5);
  const origin = `${focusX * 100}% ${focusY * 100}%`;
  return (
    <span
      className="relative block shrink-0 overflow-hidden bg-raised"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <img
        src={profile.avatarUrl}
        alt={label ?? (bot.name ? `${bot.name} avatar` : "Bot avatar")}
        width={size}
        height={size}
        draggable={false}
        onError={() => setImageFailed(true)}
        className="block size-full max-w-none object-cover"
        style={{
          width: size,
          height: size,
          objectPosition: origin,
          transform: zoom === 1 ? undefined : `scale(${zoom})`,
          transformOrigin: origin,
        }}
      />
    </span>
  );
}

export function InitialsAvatar({
  initials,
  size = 32,
}: {
  initials: string;
  size?: number;
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-raised text-ink-secondary font-medium"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}
