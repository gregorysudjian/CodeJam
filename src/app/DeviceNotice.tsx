// Full-screen notice for a device that can't (or shouldn't) play: a phone that scanned the QR
// code, Safari or Firefox, or a browser without WebGL 2. The leaderboard always opens from here.
// Built from the src/ui kit (src/ui itself is not edited). See deviceCheck.ts for the rules.
import { Globe, MonitorX, Smartphone, Trophy } from 'lucide-react';
import { EmptyState, GameButton, GlassPanel } from '@/ui/kit';
import type { DeviceCheck as DeviceCheckResult } from './deviceCheck';

const ICONS = { noWebGL: MonitorX, phone: Smartphone, browser: Globe } as const;

export function DeviceNotice({
  check,
  onLeaderboard,
  onPlayAnyway,
}: {
  check: DeviceCheckResult;
  onLeaderboard: () => void;
  /** Hides the notice and carries on to the landing screen as usual. */
  onPlayAnyway: () => void;
}) {
  if (check.verdict === 'ok') return null;
  // A laptop in another browser can still play, so playing comes first there. On a phone, or with
  // no WebGL, the leaderboard does.
  const playFirst = check.verdict === 'browser';
  const board = (
    <GameButton
      size="md"
      variant={playFirst ? 'secondary' : 'primary'}
      leadingIcon={Trophy}
      onClick={onLeaderboard}
      autoFocus={!playFirst}
    >
      See the leaderboard
    </GameButton>
  );
  const play = check.canPlayAnyway && (
    <GameButton
      size="md"
      variant={playFirst ? 'primary' : 'ghost'}
      onClick={onPlayAnyway}
      autoFocus={playFirst}
    >
      {playFirst ? 'Continue' : 'Play anyway'}
    </GameButton>
  );
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={check.title}
      className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-bg/90 p-4 backdrop-blur-sm"
    >
      <GlassPanel className="w-full max-w-xl">
        <EmptyState
          icon={ICONS[check.verdict]}
          title={check.title}
          body={check.body}
          action={
            <div className="flex flex-wrap items-center justify-center gap-4">
              {playFirst ? play : board}
              {playFirst ? board : play}
            </div>
          }
        />
      </GlassPanel>
    </div>
  );
}
