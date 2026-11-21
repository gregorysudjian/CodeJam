import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Lock, QrCode, Trophy, ArrowRight, Play, UserPlus } from "lucide-react";
import type { LeaderboardEntry } from "@/contracts";
import {
  EASE_ARENA,
  Eyebrow,
  GameButton,
  GlassPanel,
  MOVE_ORDER,
  MODE_LABELS,
  MoveFigureCycle,
  Screen,
  WORKOUT_LABELS,
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
    <Screen backdrop="track">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="grid size-12 place-items-center rounded-2xl bg-lime text-bg shadow-glow-lime">
            <Play className="size-6 fill-current" strokeWidth={2.5} />
          </span>
          <span className="font-display-italic pr-[0.06em] text-[32px] leading-none">{appName}</span>
        </div>
        {onLeaderboard ? (
          <GameButton variant="ghost" size="md" leadingIcon={Trophy} onClick={onLeaderboard}>
            Leaderboard
          </GameButton>
        ) : null}
      </header>

      {/* Hero */}
      <section className="grid items-stretch gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] xl:gap-16">
        <div className="flex min-w-0 flex-col justify-center gap-8">
          <Eyebrow>Webcam fitness game</Eyebrow>
          <motion.h1
            initial={reduce ? false : { opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.6, ease: EASE_ARENA, delay: reduce ? 0 : 0.1 }}
            className="font-display-italic pr-[0.06em] text-display-md sm:text-display-lg 2xl:text-display-xl"
          >
            Your body
            <br />
            is the <span className="text-lime text-glow-lime">controller</span>
          </motion.h1>
          <p className="max-w-xl text-body text-text-muted">
            Sidestep, jump, squat and reach through a neon obstacle course. Just you and your laptop's webcam.
          </p>

          <div className="flex flex-col gap-5">
            {isReturning && returning ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-4">
                  <GameButton size="xl" keyHint="ENTER" trailingIcon={ArrowRight} pulse onClick={onContinue} className="max-w-full">
                    <span className="block max-w-[11ch] truncate sm:max-w-[16ch]">Continue as {returning.displayName}</span>
                  </GameButton>
                  <GameButton variant="secondary" size="lg" leadingIcon={UserPlus} onClick={onPlayAsGuest}>
                    New guest
                  </GameButton>
                </div>
                {returning.bestScore != null ? (
                  <p className="flex items-baseline gap-3">
                    <span className="eyebrow text-text-muted">Best</span>
                    <span className="font-display-italic text-title tabular-nums text-lime">{formatNumber(returning.bestScore)}</span>
                  </p>
                ) : null}
              </div>
            ) : (
              <div>
                <GameButton size="xl" keyHint="ENTER" leadingIcon={Play} pulse onClick={onPlayAsGuest}>
                  Play as guest
                </GameButton>
              </div>
            )}
            <p className="flex items-center gap-2 text-caption text-text-muted">
              <Lock aria-hidden="true" className="size-4 text-cyan" />
              Tracking runs on this laptop. Your video never leaves it.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/[0.08] pt-6 font-display-italic text-title">
            {[["6", "moves"], ["4", "workouts"], ["0", "equipment"]].map(([n, l], i) => (
              <React.Fragment key={l}>
                {i > 0 ? <span aria-hidden="true" className="h-8 w-px bg-white/15" /> : null}
                <span>
                  <span className="text-lime">{n}</span> <span className="text-text">{l}</span>
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>

        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reduce ? 0 : 0.6, ease: EASE_ARENA, delay: reduce ? 0 : 0.45 }}
          className="min-w-0"
        >
          <GlassPanel glow="lime" padding="lg" className="flex h-full min-h-[560px] flex-col items-center justify-between gap-6">
            <div className="flex w-full items-center justify-between">
              <Eyebrow>How you play</Eyebrow>
              <span className="eyebrow text-text-dim">Mirror view</span>
            </div>
            <MoveFigureCycle moves={MOVE_ORDER} size={320} className="flex-1 justify-center" />
          </GlassPanel>
        </motion.div>
      </section>

      {/* Bottom row */}
      <section className={cn("grid gap-6", scores.length > 0 && "lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] xl:gap-16")}>
        {scores.length > 0 ? (
          <GlassPanel padding="lg" className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <Eyebrow accent="cyan">Today's top</Eyebrow>
              <Trophy aria-hidden="true" className="size-5 text-amber" />
            </div>
            <ol className="flex flex-col divide-y divide-white/[0.06]">
              {scores.map((s, i) => (
                <li key={`${s.displayName}-${s.at}`} className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-4 py-3">
                  <span className={cn("font-display-italic text-display-sm leading-none", i === 0 ? "text-amber" : "text-text-dim")}>
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-display text-title font-bold uppercase italic leading-tight">{s.displayName}</span>
                    <span className="text-caption text-text-muted">
                      {WORKOUT_LABELS[s.workout]} · {MODE_LABELS[s.mode]}
                    </span>
                  </span>
                  <span className="font-display-italic pr-[0.06em] text-display-sm tabular-nums text-lime">{formatNumber(s.score)}</span>
                </li>
              ))}
            </ol>
          </GlassPanel>
        ) : null}
        <GlassPanel padding="lg" className="flex items-center gap-8">
          <div className="grid size-40 shrink-0 place-items-center overflow-hidden rounded-2xl">
            {qrSlot ?? (
              <div className="grid size-full place-items-center rounded-2xl border-2 border-dashed border-white/20 text-text-dim">
                <QrCode aria-hidden="true" className="size-14" />
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <Eyebrow accent="magenta">Play on your own laptop</Eyebrow>
            <p className="font-display-italic text-title">Scan, open, move.</p>
            {publicUrl ? <p className="truncate text-caption text-text-muted">{publicUrl}</p> : null}
          </div>
        </GlassPanel>
      </section>
    </Screen>
  );
}
