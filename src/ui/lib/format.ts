/** Seconds → "m:ss". */
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** Integer with thousands separators, e.g. 12,480. */
export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** 0..1 → "87%". */
export function formatPercent(v: number, digits = 0): string {
  const clamped = Math.min(1, Math.max(0, v));
  return `${(clamped * 100).toFixed(digits)}%`;
}
