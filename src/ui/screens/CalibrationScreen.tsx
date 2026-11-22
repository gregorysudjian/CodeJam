import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowBigDown, ArrowBigUp, Check, Keyboard, X } from 'lucide-react';
import type { CalibrationStatus, PlayMode } from '@/contracts';
import {
  BustOutline,
  EASE_ARENA,
  Eyebrow,
  GameButton,
  GlassPanel,
  MoveFigure,
  ProgressRing,
  Screen,
  useHotkey,
} from '@/ui/kit';
import { formatPercent } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';

export interface CalibrationScreenProps {
  status: CalibrationStatus;
  mode: PlayMode;
  /** Live camera element, already mirrored by the camera module. */
  videoSlot?: React.ReactNode;
  /** Pose skeleton canvas, layered exactly over the video. */
  skeletonSlot?: React.ReactNode;
  onCancel(): void;
  onUseKeyboard?(): void;
}

type Step = CalibrationStatus['step'];
type CheckState = 'todo' | 'active' | 'done';

/** The guide is drawn on the video, so it uses the stage's own (dark, bright-accent) tokens:
 *  `.calibration-stage` in theme.css redefines --na-*, while ACCENT_HEX is the light page's
 *  maple red and ochre, which go dark on a camera image. */
function guideColor(step: Step): string {
  if (step === 'noBody') return 'var(--na-text-dim)';
  if (step === 'tooClose' || step === 'tooFar') return 'var(--na-amber)';
  return 'var(--na-lime)';
}

/** Same glow as `.calibration-stage .move-figure`, for the treadmill bust (BustOutline's own
 *  glow appends hex alpha to the colour, which a var() can't take). */
const GUIDE_GLOW =
  'drop-shadow(0 0 6px color-mix(in srgb, currentColor 66%, transparent)) drop-shadow(0 0 18px color-mix(in srgb, currentColor 33%, transparent))';

/** Checklist state for IN FRAME / RIGHT DISTANCE / HOLD STILL. */
export function calibrationChecklist(step: Step): [CheckState, CheckState, CheckState] {
  switch (step) {
    case 'noBody':
      return ['active', 'todo', 'todo'];
    case 'tooClose':
    case 'tooFar':
      return ['done', 'active', 'todo'];
    case 'holdStill':
      return ['done', 'done', 'active'];
    case 'done':
      return ['done', 'done', 'done'];
  }
}

const ease = { ease: EASE_ARENA } as const;

function Corners() {
  const base = 'pointer-events-none absolute size-14 border-lime';
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-5 z-40"
      style={{ filter: 'drop-shadow(0 0 8px color-mix(in srgb, var(--na-lime) 53%, transparent))' }}
    >
      <span className={cn(base, 'left-0 top-0 rounded-tl-2xl border-l-4 border-t-4')} />
      <span className={cn(base, 'right-0 top-0 rounded-tr-2xl border-r-4 border-t-4')} />
      <span className={cn(base, 'bottom-0 left-0 rounded-bl-2xl border-b-4 border-l-4')} />
      <span className={cn(base, 'bottom-0 right-0 rounded-br-2xl border-b-4 border-r-4')} />
    </div>
  );
}

/** Camera framing screen: live stage with body guide, status message, checklist and fallbacks. */
export function CalibrationScreen({
  status,
  mode,
  videoSlot,
  skeletonSlot,
  onCancel,
  onUseKeyboard,
}: CalibrationScreenProps) {
  const reduce = useReducedMotion();
  const t = (d: number) => ({ duration: reduce ? 0 : d, ...ease });
  const { step } = status;
  const color = guideColor(step);
  const checks = calibrationChecklist(step);
  const distance = step === 'tooClose' || step === 'tooFar';

  useHotkey('Escape', onCancel);
  useHotkey('k', () => onUseKeyboard?.(), Boolean(onUseKeyboard));

  const items = [
    { label: 'In frame', state: checks[0] },
    { label: 'Distance', state: checks[1] },
    { label: 'Still', state: checks[2] },
  ];

  return (
    <Screen backdrop="arena" className="calibration-screen">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-3">
          <Eyebrow>{mode === 'floor' ? 'Floor' : 'Treadmill'}</Eyebrow>
          <h1 className="font-display-italic pr-[0.06em] text-display-sm">Get in position</h1>
        </div>
      </header>

      {/* The player reads this from the mark and can't scroll: the stage is sized from the screen
          height (theme.css .calibration-stage) and the checklist sits beside it from 1024 px. */}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_280px] min-[1440px]:grid-cols-[minmax(0,1fr)_340px]">
        {/* Stage */}
        <div className="calibration-stage relative mx-auto aspect-video w-full overflow-hidden rounded-[24px] border-4 border-[color:var(--na-page-card)] bg-bg-raised shadow-[var(--na-page-shadow)]">
          {videoSlot ? (
            <div className="absolute inset-0 [&>*]:size-full [&>*]:object-cover">{videoSlot}</div>
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_center,var(--na-bg-raised),var(--na-bg))]">
              <div className="scanline" aria-hidden="true" />
              {/* Read while walking to the mark (QA A3). */}
              <p className="absolute inset-x-0 top-[9%] text-center font-display-italic text-display-sm text-text">
                Camera starting…
              </p>
            </div>
          )}
          {skeletonSlot ? (
            <div className="pointer-events-none absolute inset-0 [&>*]:size-full">
              {skeletonSlot}
            </div>
          ) : null}

          {/* Body guide */}
          <div className="pointer-events-none absolute inset-0 z-10 flex justify-center">
            <motion.div
              className={cn(
                'flex justify-center',
                mode === 'floor'
                  ? 'h-full items-start pt-[3%]'
                  : 'h-[55%] w-[46%] items-end pt-[6%]',
              )}
              animate={
                step === 'noBody' && !reduce
                  ? { opacity: [0.35, 0.8, 0.35] }
                  : { opacity: step === 'done' ? 0.35 : 1 }
              }
              transition={
                step === 'noBody' && !reduce
                  ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }
                  : t(0.3)
              }
            >
              {mode === 'floor' ? (
                <MoveFigure
                  pose="stand"
                  dashed
                  color={color}
                  size={360}
                  className="h-[70%] w-auto transition-[filter] duration-300"
                />
              ) : (
                <BustOutline
                  color={color}
                  className="h-full w-auto"
                  style={{ color, filter: GUIDE_GLOW }}
                />
              )}
            </motion.div>
          </div>

          {/* Step overlays */}
          <AnimatePresence mode="wait">
            {distance ? (
              <motion.div
                key={step}
                initial={reduce ? false : { opacity: 0, y: step === 'tooClose' ? -24 : 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={
                  reduce
                    ? { opacity: 0, transition: { duration: 0 } }
                    : { opacity: 0, y: step === 'tooClose' ? 24 : -24 }
                }
                transition={t(0.35)}
                className="absolute left-[5%] top-[12%] z-20 flex"
              >
                <span className="flex items-center gap-3 rounded-2xl border border-amber/60 bg-bg/80 px-6 py-3 font-display-italic text-display-sm text-amber shadow-[0_0_40px_-6px_var(--na-amber)] backdrop-blur-md">
                  {step === 'tooClose' ? (
                    <ArrowBigDown aria-hidden="true" className="size-10 fill-current" />
                  ) : (
                    <ArrowBigUp aria-hidden="true" className="size-10 fill-current" />
                  )}
                  <span className="pr-[0.06em]">
                    {step === 'tooClose' ? 'Step back' : 'Step closer'}
                  </span>
                </span>
              </motion.div>
            ) : null}

            {step === 'holdStill' ? (
              <motion.div
                key="hold"
                initial={reduce ? false : { opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={
                  reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 1.05 }
                }
                transition={t(0.35)}
                className="absolute inset-y-0 right-0 z-20 flex w-1/3 items-center justify-center"
              >
                <ProgressRing
                  value={status.progress}
                  size={180}
                  thickness={12}
                  accent="lime"
                  label="Hold still progress"
                  className="rounded-full bg-bg/70 backdrop-blur-md"
                >
                  <span className="flex flex-col items-center">
                    <span className="font-display-italic text-display-sm leading-none text-lime tabular-nums">
                      {formatPercent(status.progress)}
                    </span>
                  </span>
                </ProgressRing>
              </motion.div>
            ) : null}

            {step === 'done' ? (
              <motion.div
                key="done"
                initial={false}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-20 grid place-items-center"
              >
                <motion.div
                  aria-hidden="true"
                  className="absolute inset-0 bg-lime"
                  initial={{ opacity: reduce ? 0 : 0.45 }}
                  animate={{ opacity: 0 }}
                  transition={t(0.6)}
                />
                <motion.div
                  aria-hidden="true"
                  className="absolute size-[60%] rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--na-lime)_45%,transparent),transparent_65%)]"
                  initial={reduce ? false : { scale: 0.3, opacity: 1 }}
                  animate={{ scale: 1.6, opacity: 0.5 }}
                  transition={t(0.8)}
                />
                <motion.div
                  className="relative flex flex-col items-center gap-2 pb-[10%]"
                  initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={
                    reduce ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 18 }
                  }
                >
                  <span className="grid size-20 place-items-center rounded-full bg-lime text-bg shadow-glow-lime">
                    <Check className="size-12" strokeWidth={3.5} />
                  </span>
                  <span className="font-display-italic pr-[0.06em] text-display-lg text-lime text-glow-lime lg:text-display-xl">
                    Go!
                  </span>
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Message band */}
          <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-bg via-bg/85 to-transparent px-8 pb-7 pt-20 md:px-12">
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={status.message}
                role="status"
                initial={reduce ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -12 }}
                transition={t(0.28)}
                className="font-display-italic text-on-video line-clamp-2 pr-[0.06em] text-center text-display-sm text-balance text-text tight:text-title"
              >
                {status.message}
              </motion.p>
            </AnimatePresence>
          </div>

          <Corners />
        </div>

        {/* Rail */}
        <div className="grid gap-6 md:max-lg:grid-cols-2">
          <GlassPanel padding="md" className="flex flex-col gap-2">
            <Eyebrow accent="muted" className="mb-2">
              Checklist
            </Eyebrow>
            <ol className="flex flex-col gap-2">
              {items.map((it, i) => {
                const active = it.state === 'active';
                const accent = i === 1 ? 'amber' : 'lime';
                return (
                  <li
                    key={it.label}
                    className={cn(
                      'flex items-center gap-4 rounded-2xl border px-4 py-3 transition-colors duration-300',
                      active
                        ? accent === 'amber'
                          ? 'border-amber/50 bg-amber/10'
                          : 'border-lime/50 bg-lime/10'
                        : 'border-transparent',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-9 shrink-0 place-items-center rounded-full border-2 font-display-italic text-[18px] transition-colors duration-300',
                        it.state === 'done' && 'border-lime bg-lime text-bg',
                        active &&
                          (accent === 'amber'
                            ? 'border-amber text-amber'
                            : 'border-lime text-lime'),
                        it.state === 'todo' && 'border-glass-border text-text-dim',
                      )}
                    >
                      {it.state === 'done' ? (
                        <Check className="size-5" strokeWidth={3} aria-hidden="true" />
                      ) : (
                        i + 1
                      )}
                    </span>
                    <span
                      className={cn(
                        'flex-1 font-display-italic text-title leading-none',
                        it.state === 'todo' ? 'text-text-dim' : 'text-text',
                      )}
                    >
                      {it.label}
                    </span>
                    {active && i === 2 ? (
                      <span className="font-display-italic text-title tabular-nums text-lime">
                        {formatPercent(status.progress)}
                      </span>
                    ) : null}
                    <span className="sr-only">
                      {it.state === 'done' ? 'done' : active ? 'in progress' : 'not yet'}
                    </span>
                  </li>
                );
              })}
            </ol>
          </GlassPanel>
          {/* tight: the message on the stage already says this. */}
          <GlassPanel padding="md" glow="cyan" className="flex flex-col gap-3 tight:hidden">
            <Eyebrow accent="cyan">{mode === 'floor' ? 'Floor setup' : 'Treadmill setup'}</Eyebrow>
            <p className="text-body text-text">
              {mode === 'floor'
                ? 'About 1.5 m back. Head to knees in view.'
                : '1–1.5 m back. Head and shoulders in view.'}
            </p>
          </GlassPanel>
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-glass-border pt-6">
        <GameButton variant="ghost" size="lg" leadingIcon={X} keyHint="ESC" onClick={onCancel}>
          Cancel
        </GameButton>
        {onUseKeyboard ? (
          <GameButton
            variant="secondary"
            size="lg"
            leadingIcon={Keyboard}
            keyHint="K"
            onClick={onUseKeyboard}
          >
            Play with keyboard
          </GameButton>
        ) : null}
      </footer>
    </Screen>
  );
}
