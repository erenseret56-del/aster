import { memo, useState, type ReactNode } from "react";
import {
  Aperture,
  Bell,
  BookMarked,
  ChevronRight,
  Coffee,
  Compass,
  Lightbulb,
  Rocket,
  Search,
  Sparkles,
  Trophy,
  Wrench,
  Waypoints,
} from "lucide-react";
import { useStore, type Bot } from "@/state/store";
import { cn } from "@/lib/cn";
import {
  ASTER_MODES,
  GROWTH_STAGES,
  growthStage,
  readAsterMode,
  saveAsterMode,
  type AsterMode,
  type GrowthStage,
} from "@/lib/aster-companion";
import { BotAvatar } from "../Avatar";
import { AsterMark } from "./AsterMark";

const MODES: Record<AsterMode, { label: string; hint: string; icon: ReactNode }> = {
  balanced: { label: "Balanced", hint: "Everyday help", icon: <Sparkles size={15} /> },
  creative: { label: "Creative", hint: "For ideas & brainstorming", icon: <Aperture size={15} /> },
  technical: { label: "Technical", hint: "For coding & problem solving", icon: <Wrench size={15} /> },
  study: { label: "Study", hint: "For learning & research", icon: <BookMarked size={15} /> },
  relaxed: { label: "Relaxed", hint: "For casual conversations", icon: <Coffee size={15} /> },
};

const STAGES: Record<GrowthStage, { label: string; icon: ReactNode }> = {
  curious: { label: "Curious", icon: <Lightbulb size={16} /> },
  learning: { label: "Learning", icon: <Compass size={16} /> },
  planning: { label: "Planning", icon: <Waypoints size={16} /> },
  working: { label: "Working", icon: <Rocket size={16} /> },
  achieved: { label: "Achieved", icon: <Trophy size={16} /> },
};

function PanelHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 px-1">
      <span className="aster-orb-icon flex size-9 shrink-0 items-center justify-center rounded-full">
        <AsterMark size={18} />
      </span>
      <div className="min-w-0">
        <div className="text-[14px] font-medium text-ink">{title}</div>
        <div className="truncate text-[11.5px] text-ink-tertiary">{subtitle}</div>
      </div>
    </div>
  );
}

/** The home screen's right column: search, notifications and the open
 * bot; how ASTER should help (a preference of this browser); and where the
 * open conversation stands, read from its messages. */
export const AsterContextPanel = memo(function AsterContextPanel({
  bot,
  unreadCount,
  onOpenSearch,
  onOpenChats,
}: {
  bot: Bot;
  unreadCount: number;
  onOpenSearch: () => void;
  onOpenChats: () => void;
}) {
  const { dispatch } = useStore();
  const [mode, setMode] = useState<AsterMode>(() => readAsterMode());
  const stage = growthStage(bot);
  const reached = GROWTH_STAGES.indexOf(stage);

  return (
    <aside aria-label="ASTER companion panel" className="aster-context relative z-10 hidden w-[312px] shrink-0 flex-col gap-3 overflow-y-auto py-5 pr-5 xl:flex">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenSearch}
          className="glass-chip flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-full px-4 text-[13px] text-ink-tertiary transition-colors hover:text-ink-secondary"
        >
          <Search size={15} />
          <span>Search...</span>
          <kbd className="ml-auto text-[11px] text-ink-tertiary">⌘K</kbd>
        </button>
        <button
          type="button"
          onClick={onOpenChats}
          aria-label={unreadCount > 0 ? `Notifications: ${unreadCount} unread` : "Notifications"}
          title="Unread conversations"
          className="relative flex size-10 items-center justify-center rounded-full text-ink-secondary transition-colors hover:text-ink"
        >
          <Bell size={18} />
          {unreadCount > 0 && <span aria-hidden className="absolute right-2.5 top-2.5 size-2 rounded-full bg-accent ring-2 ring-[var(--color-app)]" />}
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: "toggleSettings", open: true })}
          aria-label={`${bot.name} profile`}
          title={`${bot.name} profile`}
          className="aster-avatar-ring size-10 shrink-0 overflow-hidden rounded-full"
        >
          <BotAvatar bot={bot} size={40} />
        </button>
      </div>

      <section aria-label="Aster Mode" className="aster-card flex flex-col gap-2 rounded-[22px] p-3.5">
        <PanelHeader title="Aster Mode" subtitle="Choose how you want Aster to help" />
        <div role="radiogroup" aria-label="Aster Mode" className="mt-1 flex flex-col gap-0.5">
          {ASTER_MODES.map((id) => {
            const item = MODES[id];
            const selected = id === mode;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setMode(id);
                  saveAsterMode(id);
                }}
                className={cn("aster-mode-row flex items-center gap-3 rounded-2xl px-2 py-1.5 text-left", selected && "is-selected")}
              >
                <span className="aster-mode-icon flex size-8 shrink-0 items-center justify-center rounded-full">{item.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-ink">{item.label}</span>
                  {!selected && <span className="block truncate text-[11px] text-ink-tertiary">{item.hint}</span>}
                </span>
                {selected && <ChevronRight size={15} className="text-ink-secondary" />}
              </button>
            );
          })}
        </div>
      </section>

      <section aria-label="Aster's Growth" className="aster-card flex flex-col gap-3 rounded-[22px] p-3.5">
        <PanelHeader title="Aster's Growth" subtitle="Where this conversation stands" />
        <ol className="flex items-start justify-between px-0.5">
          {GROWTH_STAGES.map((id, index) => {
            const item = STAGES[id];
            return (
              <li
                key={id}
                aria-current={id === stage ? "step" : undefined}
                className={cn("aster-stage flex w-12 flex-col items-center gap-1.5", index <= reached && "is-reached", id === stage && "is-current")}
              >
                <span className="aster-stage-orb flex size-9 items-center justify-center rounded-full">{item.icon}</span>
                <span className="text-[10.5px] text-ink-tertiary">{item.label}</span>
              </li>
            );
          })}
        </ol>
      </section>
    </aside>
  );
});
