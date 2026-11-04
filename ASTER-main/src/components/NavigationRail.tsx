import { memo, useState, type ReactNode } from "react";
import {
  BookOpen,
  CalendarDays,
  FolderClosed,
  House,
  MessageSquare,
  Monitor,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import { useStore, type Bot } from "@/state/store";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { applySkin, readAppearancePreference, type AppearanceMode } from "@/lib/skins";
import { useMediaQuery } from "@/hooks/use-media-query";
import { SidebarProfileMenu } from "./SidebarProfileMenu";
import { AsterMark } from "./aster/AsterMark";

export interface NavigationRailProps {
  expanded: boolean;
  onToggleExpanded: () => void;
  onOpenSearch: () => void;
  onNewConversation: () => void;
  activeBot?: Bot;
  unreadCount?: number;
}

/** One destination. Below lg the rail is 60px and shows the icon alone
 * (the label stays as the accessible name); from lg it is a labelled row. */
function NavItem({
  icon,
  label,
  active = false,
  onClick,
  badge,
  expandedState,
  title,
  ariaLabel,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  badge?: number;
  expandedState?: boolean;
  title?: string;
  /** When the visible label alone would collide with another control. */
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-expanded={expandedState}
      aria-label={ariaLabel}
      title={title ?? label}
      className={cn(
        "aster-nav-item relative flex size-10 items-center justify-center rounded-xl text-ink-secondary transition-colors duration-150 hover:text-ink active:scale-[0.98]",
        "lg:h-10 lg:w-full lg:justify-start lg:gap-3 lg:rounded-2xl lg:px-3.5",
      )}
    >
      {icon}
      <span className="hidden text-[14px] lg:inline">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white shadow lg:static lg:ml-auto lg:size-5 lg:text-[10px]"
          aria-label={`${badge} unread messages`}
        >
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

const utility =
  "flex size-9 items-center justify-center rounded-xl text-ink-secondary transition-colors duration-150 hover:bg-raised-hover hover:text-ink active:scale-95";

export const NavigationRail = memo(function NavigationRail({
  expanded,
  onToggleExpanded,
  onOpenSearch,
  onNewConversation,
  unreadCount = 0,
}: NavigationRailProps) {
  const { state, dispatch } = useStore();
  const [appearance, setAppearance] = useState<AppearanceMode | string>(() => readAppearancePreference());
  // Tailwind's lg: the width at which the rail becomes a labelled sidebar.
  const wide = useMediaQuery("(min-width: 1024px)");

  const cycleAppearance = () => {
    let next: AppearanceMode = "system";
    if (appearance === "system") next = "dark";
    else if (appearance === "dark") next = "light";
    else next = "system";
    setAppearance(next);
    applySkin(next);
  };

  const goHome = () => {
    if (state.activeView !== "chat") dispatch({ type: "showChat" });
    if (expanded) onToggleExpanded();
  };

  return (
    <nav
      aria-label="Application navigation rail"
      className={cn(
        "aster-nav glass-rail z-30 flex h-full w-[60px] shrink-0 select-none flex-col items-center justify-between py-3.5",
        "lg:w-[232px] lg:items-stretch lg:px-3 lg:pb-4 lg:pt-5",
      )}
    >
      <div className="flex flex-col items-center gap-2.5 lg:items-stretch lg:gap-1.5">
        <button
          type="button"
          onClick={goHome}
          aria-label="ASTER home"
          title="ASTER"
          className="group flex size-10 items-center justify-center rounded-2xl transition-transform duration-200 hover:scale-105 active:scale-95 lg:mb-5 lg:h-auto lg:w-auto lg:justify-start lg:gap-2.5 lg:px-3 lg:hover:scale-100"
        >
          <AsterMark size={26} className="drop-shadow-[0_2px_6px_rgb(110_120_240/0.45)]" />
          <span className="hidden text-[20px] font-medium tracking-tight text-ink lg:inline">Aster</span>
        </button>

        <div className="my-1 h-px w-6 bg-hairline/30 lg:hidden" />

        <NavItem
          icon={<House size={18} />}
          label="Home"
          active={state.activeView === "chat" && !expanded && !state.pluginsOpen && !state.appSettingsOpen}
          onClick={goHome}
        />
        <NavItem
          icon={<MessageSquare size={18} />}
          label="Chat"
          title={`${t("sidebar.aria") || "Agent Chats"}${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
          active={expanded}
          expandedState={expanded}
          onClick={onToggleExpanded}
          badge={unreadCount}
        />
        <NavItem
          icon={<FolderClosed size={18} />}
          label="Projects"
          title="Projects: the team map"
          active={state.activeView === "team-map"}
          onClick={() => dispatch(state.activeView === "team-map" ? { type: "showChat" } : { type: "showTeamMap" })}
        />
        <NavItem
          icon={<BookOpen size={18} />}
          label="Knowledge"
          title="Knowledge: tools, skills and connectors"
          active={state.pluginsOpen}
          onClick={() => dispatch({ type: "togglePlugins", open: true })}
        />
        <NavItem
          icon={<Settings size={18} />}
          label="Settings"
          // The profile menu has a "Settings" item; keep the rail's own name.
          ariaLabel="Open settings"
          title="Settings (⌘,)"
          active={state.appSettingsOpen}
          onClick={() => dispatch({ type: "toggleAppSettings", open: true })}
        />
      </div>

      <div className="flex flex-col items-center gap-2 lg:items-stretch lg:gap-3">
        <div className="flex flex-col items-center gap-2 lg:flex-row lg:justify-between lg:px-1.5">
          <button type="button" onClick={onNewConversation} aria-label="New conversation" title="New conversation (⌘N)" className={utility}>
            <Plus size={18} />
          </button>
          <button type="button" onClick={onOpenSearch} aria-label="Search or command palette" title="Search / Command Palette (⌘K)" className={utility}>
            <Search size={17} />
          </button>
          <button
            type="button"
            onClick={() => dispatch(state.activeView === "routines" ? { type: "showChat" } : { type: "showRoutines" })}
            aria-label="Routines and automations"
            aria-pressed={state.activeView === "routines"}
            title="Routines & Automations"
            className={cn(utility, state.activeView === "routines" && "bg-raised text-accent")}
          >
            <CalendarDays size={17} />
          </button>
          <button type="button" onClick={cycleAppearance} aria-label="Toggle theme appearance" title={`Appearance: ${appearance} (Click to toggle)`} className={utility}>
            {appearance === "light" ? <Sun size={17} /> : appearance === "dark" ? <Moon size={17} /> : <Monitor size={17} />}
          </button>
        </div>

        {/* The Agent Chats sidebar carries its own profile row while open. */}
        {!expanded && (
          <div className="aster-nav-profile relative mt-1 lg:mt-0">
            <SidebarProfileMenu compact={!wide} />
          </div>
        )}
      </div>
    </nav>
  );
});
