import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/ui/lib/utils";

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: React.ReactNode;
  /**
   * Short lines explaining what will fill this space once it has data. An
   * empty screen is still a screen: with nothing here the page was ~85%
   * background, and the backdrop ended up carrying the composition.
   */
  hints?: readonly string[];
}

/** Centred placeholder for an empty list: what this is, what fills it, and the way in. */
export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon: Icon, title, body, action, hints, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-col items-center gap-5 px-6 py-12 text-center", className)}
      {...props}
    >
      <div className="grid size-20 place-items-center rounded-full border border-line-strong bg-bg-raised text-text-muted">
        <Icon aria-hidden="true" className="size-9" strokeWidth={2.25} />
      </div>
      <h3 className="font-display-italic pr-[0.06em] text-display-sm">{title}</h3>
      {body ? <p className="max-w-md text-body text-text-muted">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
      {hints?.length ? (
        <ul className="mt-6 grid gap-px overflow-hidden rounded-[18px] border border-line bg-line text-left sm:grid-cols-3">
          {hints.map((hint, i) => (
            <li
              key={hint}
              className="flex items-start gap-3 bg-bg-raised px-5 py-4 text-caption text-text-muted"
            >
              <span
                aria-hidden="true"
                className="mt-px font-display-italic text-[15px] leading-5 text-text-dim tabular-nums"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{hint}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  ),
);
EmptyState.displayName = "EmptyState";
