import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/ui/lib/utils";
import { DURATION, EASE_ARENA } from "./tokens";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "md" | "lg";
  className?: string;
  "aria-label"?: string;
  ref?: React.Ref<HTMLDivElement>;
}

/** Big glass segmented toggle with a sliding highlight; arrow keys move the selection. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "lg",
  className,
  ref,
  ...aria
}: SegmentedControlProps<T>) {
  const id = React.useId();
  const reduce = useReducedMotion();
  const btns = React.useRef<(HTMLButtonElement | null)[]>([]);

  const move = (from: number, dir: 1 | -1) => {
    const n = options.length;
    for (let step = 1; step <= n; step++) {
      const i = (from + dir * step + n) % n;
      const opt = options[i];
      if (opt && !opt.disabled) {
        onChange(opt.value);
        btns.current[i]?.focus();
        return;
      }
    }
  };

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={aria["aria-label"]}
      className={cn("glass inline-flex w-fit max-w-full gap-1 rounded-[20px] p-1.5", className)}
    >
      {options.map((opt, i) => {
        const selected = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              btns.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={opt.disabled}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(i, -1);
              }
            }}
            className={cn(
              "focus-ring relative flex cursor-pointer whitespace-nowrap items-center justify-center gap-2 rounded-[14px] font-display-italic leading-none tracking-[0.03em] transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-35",
              size === "lg" ? "h-16 min-w-[160px] px-7 text-[26px]" : "h-12 min-w-[120px] px-5 text-[20px]",
              selected ? "text-bg" : "text-text-muted hover:text-text",
            )}
          >
            {selected ? (
              <motion.span
                layoutId={`seg-${id}`}
                /* A selected segment is a position indicator, not a call to
                   action: flat fill, no halo. */
                className="absolute inset-0 rounded-[14px] bg-lime-fill"
                transition={{ duration: reduce ? 0 : DURATION.base, ease: EASE_ARENA }}
              />
            ) : null}
            {Icon ? <Icon aria-hidden="true" strokeWidth={2.75} className="relative size-[0.9em]" /> : null}
            <span className="relative pr-[0.06em]">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
