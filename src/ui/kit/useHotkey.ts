import { useEffect, useRef } from "react";

const ALIASES: Record<string, string> = { esc: "escape", return: "enter", space: " ", spacebar: " " };

function normalize(key: string): string {
  const k = key.toLowerCase();
  return ALIASES[k] ?? k;
}

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
}

function isActivatable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.closest("button, a[href], [role='button'], [role='radio'], [role='tab'], [role='switch'], [role='checkbox']") !== null;
}

/** Window keydown hotkey (e.g. "Enter", "ESC", "S"). Ignored while typing; Enter/Space are left to a focused control. */
export function useHotkey(key: string, handler: () => void, enabled = true): void {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const target = normalize(key);
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (normalize(e.key) !== target) return;
      if (isTyping(e.target)) return;
      if ((target === "enter" || target === " ") && isActivatable(e.target)) return;
      e.preventDefault();
      ref.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, enabled]);
}
