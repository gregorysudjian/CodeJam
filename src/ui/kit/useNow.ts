import { useEffect, useState } from 'react';

/** The current time, refreshed every `intervalMs`: for "5 MIN AGO" labels on screens that stay
 *  open (the kiosk runs for an hour). One re-render per tick, never per frame. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
