// ?dev=pose: host for A's pose debug view. Wired to mountPoseDebug once abdo-1 is merged.
export function DevPose() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h2 className="text-3xl font-bold">?dev=pose</h2>
      <p className="opacity-70">Pose debug view lands with the src/pose merge.</p>
    </div>
  );
}
