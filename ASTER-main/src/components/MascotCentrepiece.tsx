import { memo, useMemo } from "react";
import { type Bot, type Message } from "@/state/store";
import { BotAvatar } from "./Avatar";
import { stateForBot, type MausState, type MausMotion } from "@/lib/mascot";
import { cn } from "@/lib/cn";
import { Grip } from "lucide-react";
import { greetingFor } from "@/lib/aster-companion";
import { Badge } from "./glass-ui/badge";
import { Card } from "./glass-ui/card";

export interface MascotCentrepieceProps {
  bot: Bot;
  messages: Message[];
  isTyping?: boolean;
  toolInFlight?: boolean;
  speaking?: boolean;
  hasError?: boolean;
}

/** The home screen of an empty conversation: a greeting and headline on
 * the left, the ASTER companion floating on the right. The quick actions
 * live in the composer below (Composer's `hero`). */
export const MascotCentrepiece = memo(function MascotCentrepiece({
  bot,
  isTyping = false,
  toolInFlight = false,
  speaking = false,
  hasError = false,
}: MascotCentrepieceProps) {
  const statusLabel = useMemo(() => {
    if (hasError) return "Needs attention";
    if (speaking) return "Speaking...";
    if (toolInFlight) return "Executing tool...";
    if (bot.busy) return "Thinking...";
    if (isTyping) return "Listening...";
    return "Here with you";
  }, [hasError, speaking, toolInFlight, bot.busy, isTyping]);
  const greeting = greetingFor(new Date().getHours());

  return (
    <div data-mascot-centrepiece className="aster-hero flex flex-1 select-none items-center px-6 pb-6 pt-2 animate-in fade-in duration-500 md:px-10">
      <div className="mx-auto grid w-full max-w-[62rem] grid-cols-[minmax(0,1fr)] items-center gap-2 md:grid-cols-[minmax(0,1.15fr)_auto]">
        <div className="order-2 text-center md:order-1 md:text-left">
          <p className="flex items-center justify-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-secondary md:justify-start">
            <Grip size={13} aria-hidden />
            Good {greeting},
          </p>
          <h1 className="aster-headline mt-4 text-[clamp(2rem,3.4vw,2.9rem)] font-light leading-[1.08] tracking-[-0.02em] text-ink">
            Let&rsquo;s create <br className="hidden md:block" />
            something amazing <span className="aster-gradient-text">today.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[26rem] text-[14px] leading-relaxed text-ink-secondary md:mx-0">
            I&rsquo;m {bot.name} &mdash; your AI companion. Ask me anything, plan, build, or just have a chat.
          </p>
          <Badge variant="glass" className="mt-5 gap-2 px-3 py-1 text-[12px] font-medium text-ink-secondary">
            <span
              className={cn(
                "size-1.5 rounded-full transition-colors",
                bot.busy ? "bg-accent animate-pulse" : hasError ? "bg-danger" : "bg-success",
              )}
            />
            <span>{statusLabel}</span>
          </Badge>
        </div>
        {/* The open bot's own companion, drawn by the same renderer as its
            sidebar avatar; keyed so switching bots replays its entrance. */}
        <div className="order-1 mx-auto md:order-2" data-mascot-companion>
          <BotAvatar key={bot.id} bot={bot} size={250} state={speaking ? "writing" : isTyping ? "listening" : "idle"} label={`${bot.name}, your companion`} />
        </div>
      </div>
    </div>
  );
});

export interface MascotCompanionHeaderProps {
  bot: Bot;
  messages: Message[];
  isTyping?: boolean;
  toolInFlight?: boolean;
  speaking?: boolean;
  hasError?: boolean;
  motion?: MausMotion;
  motionKey?: number;
}

export const MascotCompanionHeader = memo(function MascotCompanionHeader({
  bot,
  messages,
  isTyping = false,
  toolInFlight = false,
  speaking = false,
  hasError = false,
  motion = "none",
  motionKey = 0,
}: MascotCompanionHeaderProps) {
  const currentState: MausState = useMemo(() => {
    if (hasError) return "alerting";
    if (speaking) return "dictating";
    if (toolInFlight) return "working";
    if (bot.busy) return "thinking";
    if (isTyping) return "listening";
    return stateForBot({ ...bot, messages });
  }, [hasError, speaking, toolInFlight, bot, isTyping, messages]);

  const activityText = useMemo(() => {
    if (hasError) return "Attention needed";
    if (speaking) return "Speaking...";
    if (toolInFlight) return "Running tools...";
    if (bot.busy) return "Thinking...";
    if (isTyping) return "Listening to you...";
    return "Ready";
  }, [hasError, speaking, toolInFlight, bot.busy, isTyping]);

  return (
    <Card data-companion-header variant="glass" className="pointer-events-auto mx-auto mb-3 flex-row items-center gap-3 rounded-2xl px-3.5 py-1.5">
      <div className="relative size-9 shrink-0">
        <BotAvatar
          bot={bot}
          state={currentState}
          size={36}
          motion={motion}
          motionKey={motionKey}
          trackPointer={true}
        />
      </div>
      <div className="flex flex-col min-w-0 pr-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold text-ink">{bot.name}</span>
          <span
            className={cn(
              "size-1.5 rounded-full",
              bot.busy ? "bg-accent animate-pulse" : hasError ? "bg-danger" : "bg-success",
            )}
          />
        </div>
        <span className="truncate text-[11px] text-ink-secondary">{activityText}</span>
      </div>
    </Card>
  );
});
