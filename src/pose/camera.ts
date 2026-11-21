// Owner: A. Webcam access. Video stays on the device (AGENTS.md rule 5).
import { VIDEO_HEIGHT, VIDEO_WIDTH } from './tuning';

/** Asks for the front camera. The caller must stopStream() it when done, even on errors. */
export function getCameraStream(): Promise<MediaStream> {
  if (!window.isSecureContext) {
    // Browsers only allow the camera on https or localhost (e.g. not http://192.168.x.x).
    return Promise.reject(
      new Error(
        'The camera needs https or localhost. Open the app via its https link or localhost.',
      ),
    );
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new Error('This browser cannot use the camera. Use Chrome.'));
  }
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: 'user', width: { ideal: VIDEO_WIDTH }, height: { ideal: VIDEO_HEIGHT } },
  });
}

/** Shows a stream in the video and resolves once it plays. */
export async function attachStream(video: HTMLVideoElement, stream: MediaStream): Promise<void> {
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
}

/** Stops the camera (the light goes off) and detaches it from the video if it is still shown. */
export function stopStream(video: HTMLVideoElement, stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
  if (stream && video.srcObject === stream) video.srcObject = null;
}

/** A readable message for camera errors (permission denied, no camera, camera busy). */
export function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError')
    return 'Camera permission was denied. Allow it in the address bar, or press K for the keyboard.';
  if (name === 'NotFoundError') return 'No camera found. Press K to play with the keyboard.';
  if (name === 'NotReadableError')
    return 'The camera is busy in another app or tab. Close it, or press K for the keyboard.';
  return err instanceof Error ? err.message : 'The camera could not start.';
}
