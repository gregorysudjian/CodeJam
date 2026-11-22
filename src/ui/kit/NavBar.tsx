import { Play, TrendingUp, Trophy, type LucideIcon } from "lucide-react";
import { cn } from "@/ui/lib/utils";

/** Where the nav bar can take the player. "profile" is the player chip. */
export type NavTarget = "play" | "progress" | "leaderboard" | "profile";

export interface NavBarProps {
  /** The item for the screen on show (marked as the current page), or null for none (results). */
  current: NavTarget | null;
  onNavigate(target: NavTarget): void;
  /** The signed-in player, for the chip on the right; null or absent: no chip. */
  player?: { displayName: string } | null;
  /** The name beside the logo (App.tsx APP_NAME). */
  appName?: string;
  className?: string;
}

const ITEMS: readonly { target: Exclude<NavTarget, "profile">; label: string; icon: LucideIcon }[] = [
  { target: "play", label: "PLAY", icon: Play },
  { target: "progress", label: "PROGRESS", icon: TrendingUp },
  { target: "leaderboard", label: "LEADERBOARD", icon: Trophy },
];

/** The top bar of the menu screens: logo, PLAY · PROGRESS · LEADERBOARD, the player chip.
 *  Neon look: a solid dark card, the current item underlined in lime. */
export function NavBar({ current, onNavigate, player, appName = "Neon Arena", className }: NavBarProps) {
  return (
    <nav
      aria-label="Main"
      data-navbar=""
      className={cn(
        "glass flex h-14 items-center gap-3 rounded-2xl pr-2 pl-3 sm:gap-6 short:h-12 tight:h-11",
        className,
      )}
    >
      <span className="flex shrink-0 items-center gap-2.5">
        <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-lime text-bg tight:size-8">
          <Play className="size-[18px] fill-current" strokeWidth={2.5} />
        </span>
        <span className="hidden pr-[0.06em] font-display-italic text-[26px] leading-none lg:inline">
          {appName}
        </span>
      </span>

      <ul className="flex min-w-0 items-center gap-1">
        {ITEMS.map(({ target, label, icon: Icon }) => {
          const on = current === target;
          return (
            <li key={target}>
              <button
                type="button"
                aria-current={on ? "page" : undefined}
                aria-label={label.charAt(0) + label.slice(1).toLowerCase()}
                onClick={() => onNavigate(target)}
                className={cn(
                  "focus-ring relative flex h-10 items-center gap-2 rounded-xl px-3 font-display-italic text-[22px] leading-none transition-colors duration-200 sm:px-4 tight:h-9 tight:text-[19px]",
                  on ? "bg-lime/[0.08] text-lime" : "text-text-muted hover:bg-text/[0.06] hover:text-text",
                )}
              >
                <Icon aria-hidden="true" className="size-5 shrink-0" strokeWidth={2.5} />
                <span className="hidden pr-[0.06em] sm:inline">{label}</span>
                {on && (
                  <span aria-hidden="true" className="absolute inset-x-3 -bottom-[7px] h-[3px] rounded-full bg-lime sm:inset-x-4 short:-bottom-[4px] tight:-bottom-[4px]" />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {player ? (
        <button
          type="button"
          aria-current={current === "profile" ? "page" : undefined}
          aria-label={`Profile: ${player.displayName}`}
          onClick={() => onNavigate("profile")}
          className={cn(
            "focus-ring ml-auto flex h-10 min-w-0 shrink items-center gap-2.5 rounded-full border py-1 pr-4 pl-1 transition-colors duration-200 tight:h-9",
            current === "profile"
              ? "border-lime text-lime"
              : "border-glass-border bg-glass-strong text-text hover:border-text/30",
          )}
        >
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-cyan font-display-italic text-[18px] leading-none text-bg tight:size-7">
            {player.displayName.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <span className="min-w-0 truncate pr-[0.06em] font-display-italic text-[20px] leading-none">
            {player.displayName}
          </span>
        </button>
      ) : null}
    </nav>
  );
}
