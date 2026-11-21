// Owner: A. Webcam access. Video stays on the device (AGENTS.md rule 5).
import { VIDEO_HEIGHT, VIDEO_WIDTH } from './tuning';

/** Asks for the front camera and resolves once the video has its first frame. */
export async function openCamera(video: HTMLVideoElement): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: 'user', width: { ideal: VIDEO_WIDTH }, height: { ideal: VIDEO_HEIGHT } },
  });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return stream;
}

export function closeCamera(video: HTMLVideoElement, stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}
