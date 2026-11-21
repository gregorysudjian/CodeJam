// Error states composed from the src/ui kit (src/ui itself is not edited). Every one of them
// offers the keyboard, the stand-in that always works (AGENTS.md rule 7).
import { CameraOff, Keyboard, RefreshCw, VideoOff, WifiOff } from 'lucide-react';
import { EmptyState, GameButton, GlassPanel } from '@/ui/kit';
import type { CameraErrorInfo } from './errors';

/** Full-screen: the camera could not start (blocked, missing, busy, other). */
export function CameraErrorOverlay({
  error,
  onUseKeyboard,
  onRetry,
}: {
  error: CameraErrorInfo;
  onUseKeyboard: () => void;
  onRetry: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={error.title}
      className="fixed inset-0 z-[90] grid place-items-center bg-bg/90 p-6 backdrop-blur-sm"
    >
      <GlassPanel className="w-full max-w-2xl">
        <EmptyState
          icon={error.kind === 'missing' ? VideoOff : CameraOff}
          title={error.title}
          body={error.body}
          action={
            <div className="flex flex-wrap items-center justify-center gap-4">
              <GameButton size="lg" leadingIcon={Keyboard} onClick={onUseKeyboard} autoFocus>
                Use keyboard
              </GameButton>
              <GameButton variant="secondary" size="lg" leadingIcon={RefreshCw} onClick={onRetry}>
                Try again
              </GameButton>
            </div>
          }
        />
      </GlassPanel>
    </div>
  );
}

/** Banner while the browser is offline. Rounds keep saving on this laptop and sync later. */
export function OfflineBanner({ onUseKeyboard }: { onUseKeyboard?: () => void }) {
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[80] flex flex-wrap items-center justify-center gap-3 bg-amber/15 px-4 py-2 text-sm text-text backdrop-blur"
    >
      <WifiOff aria-hidden="true" className="size-4 text-amber" />
      <span>Offline. Your rounds are saved on this laptop and sync when the wifi is back.</span>
      {onUseKeyboard && (
        <GameButton variant="ghost" size="md" leadingIcon={Keyboard} onClick={onUseKeyboard}>
          Use keyboard
        </GameButton>
      )}
    </div>
  );
}

/** Shown under GameHud's "step back into the frame" once the player has been lost a while. */
export function TrackingLostHint({ onUseKeyboard }: { onUseKeyboard: () => void }) {
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-28 z-30 flex justify-center">
      <GameButton
        variant="secondary"
        size="md"
        leadingIcon={Keyboard}
        keyHint="K"
        onClick={onUseKeyboard}
      >
        Can't see you? Use the keyboard
      </GameButton>
    </div>
  );
}
