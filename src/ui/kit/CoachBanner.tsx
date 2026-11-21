import { Sparkles } from "lucide-react";
import type { CoachAdvice, SessionConfig } from "@/contracts";
import { GameButton } from "@/ui/kit/GameButton";
import { MODE_LABELS, WORKOUT_LABELS } from "@/ui/kit/tokens";

/** Compact recommendation, never competing with the screen's main action. */
export function CoachBanner({
  advice,
  onPlay,
}: {
  advice: CoachAdvice;
  onPlay?: (config: SessionConfig) => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-4 border-y border-glass-border py-3">
      <Sparkles aria-hidden="true" className="size-5 shrink-0 text-lime" />
      <span className="font-display-italic text-[22px] text-lime">
        COACH'S PICK: {WORKOUT_LABELS[advice.next.workout]} · {MODE_LABELS[advice.next.mode]} ·{" "}
        {advice.next.durationSec} S
      </span>
      <p className="min-w-0 flex-1 truncate text-caption text-text-muted" title={advice.reason}>
        {advice.reason}
      </p>
      {onPlay && (
        <GameButton
          variant="secondary"
          size="md"
          className="h-10 px-4 text-[20px]"
          onClick={() => onPlay(advice.next)}
        >
          PLAY
        </GameButton>
      )}
    </div>
  );
}
