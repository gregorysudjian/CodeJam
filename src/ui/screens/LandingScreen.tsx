import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Lock, Trophy, ArrowRight, Play, UserPlus } from "lucide-react";
import type { LeaderboardEntry } from "@/contracts";
import {
  EASE_ARENA,
  Eyebrow,
  GameButton,
  MOVE_ORDER,
  MoveFigureCycle,
  Screen,
  useHotkey,
} from "@/ui/kit";
import { formatNumber } from "@/ui/lib/format";
import { cn } from "@/ui/lib/utils";

export interface LandingScreenProps {
  appName: string;
  onPlayAsGuest(): void;
  returning?: { displayName: string; bestScore?: number } | null;
  onContinue?(): void;
  onLeaderboard?(): void;
  topScores?: LeaderboardEntry[];
  qrSlot?: React.ReactNode;
  publicUrl?: string;
}

/** First screen: poster-style hero, guest/continue CTA, move demo, top scores and QR. */
export function LandingScreen({
  appName,
  onPlayAsGuest,
  returning,
  onContinue,
  onLeaderboard,
  topScores,
  qrSlot,
  publicUrl,
}: LandingScreenProps) {
  const reduce = useReducedMotion();
  const isReturning = Boolean(returning && onContinue);
  useHotkey("Enter", () => (isReturning && onContinue ? onContinue() : onPlayAsGuest()));
  const scores = (topScores ?? []).slice(0, 3);

  return (
    <Screen backdrop="track" className="landing-screen polish-screen">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-12 place-items-center rounded-2xl bg-lime text-bg shadow-glow-lime"
          >
            <Play className="size-6 fill-current" strokeWidth={2.5} />
          </span>
          <span className="font-display-italic pr-[0.06em] text-[32px] leading-none">
            {appName}
          </span>
        </div>
        {onLeaderboard ? (
          <GameButton variant="ghost" size="md" leadingIcon={Trophy} onClick={onLeaderboard}>
            Leaderboard
          </GameButton>
        ) : null}
      </header>

      {/* Hero */}
      <section className="grid items-stretch gap-12 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col justify-center gap-8">
          <Eyebrow>Webcam fitness game</Eyebrow>
          <motion.h1
            initial={reduce ? false : { opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.6, ease: EASE_ARENA, delay: reduce ? 0 : 0.1 }}
            className="font-display-italic pr-[0.06em] text-display-md sm:text-display-lg"
          >
            Your body
            <br />
            is the <span className="text-lime text-glow-lime">controller</span>
          </motion.h1>
          <p className="max-w-xl text-body text-text-muted">
            Move through the arena. Just you and your webcam.
          </p>

          <div className="flex flex-col gap-5">
            {isReturning && returning ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-4">
                  <GameButton
                    size="xl"
                    keyHint="ENTER"
                    trailingIcon={ArrowRight}
                    pulse
                    onClick={onContinue}
                    className="max-w-full"
                  >
                    <span className="block max-w-[11ch] truncate sm:max-w-[16ch]">
                      Continue as {returning.displayName}
                    </span>
                  </GameButton>
                  <GameButton
                    variant="ghost"
                    size="md"
                    leadingIcon={UserPlus}
                    onClick={onPlayAsGuest}
                  >
                    New guest
                  </GameButton>
                </div>
              </div>
            ) : (
              <div>
                <GameButton
                  size="xl"
                  keyHint="ENTER"
                  leadingIcon={Play}
                  pulse
                  onClick={onPlayAsGuest}
                >
                  Play as guest
                </GameButton>
              </div>
            )}
            <p className="flex items-center gap-2 text-caption text-text-muted">
              <Lock aria-hidden="true" className="size-4 text-cyan" />
              Tracking runs on this laptop. Your video never leaves it.
            </p>
          </div>
        </div>

        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reduce ? 0 : 0.6, ease: EASE_ARENA, delay: reduce ? 0 : 0.45 }}
          className="min-w-0"
        >
          <div className="flex h-full min-h-[460px] flex-col items-center justify-center gap-6">
            <div className="flex w-full items-center justify-between">
              <Eyebrow>How you play</Eyebrow>
            </div>
            <MoveFigureCycle moves={MOVE_ORDER} size={280} className="flex-1 justify-center" />
          </div>
        </motion.div>
      </section>

      {(scores.length > 0 || (qrSlot && publicUrl)) && (
        <section className="flex flex-wrap items-center justify-between gap-8 border-y border-glass-border py-4">
          {scores.length > 0 && (
            <div className="flex min-w-0 flex-wrap items-center gap-6">
              <Eyebrow accent="cyan">TODAY'S TOP</Eyebrow>
              <ol className="flex flex-wrap gap-6">
                {scores.map((entry, i) => (
                  <li
                    key={`${entry.displayName}-${entry.at}`}
                    className="flex items-baseline gap-2 font-display-italic text-[22px]"
                  >
                    <span className={cn(i === 0 ? "text-lime" : "text-text-dim")}>{i + 1}</span>
                    <span className="max-w-36 truncate">{entry.displayName}</span>
                    <span className="text-lime">{formatNumber(entry.score)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {qrSlot && publicUrl && (
            <div className="flex items-center gap-4">
              <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg">
                {qrSlot}
              </div>
              <div>
                <p className="font-display-italic text-[20px] text-cyan">PLAY ON YOUR LAPTOP</p>
                <p className="max-w-64 truncate text-caption text-text-muted">{publicUrl}</p>
              </div>
            </div>
          )}
        </section>
      )}
    </Screen>
  );
}
