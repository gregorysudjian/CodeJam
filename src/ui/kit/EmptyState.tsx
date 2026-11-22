import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/ui/lib/utils";

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: React.ReactNode;
}

/** Centred placeholder for empty lists: icon in a tinted disc, title, body and optional action. */
export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon: Icon, title, body, action, className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col items-center gap-5 px-6 py-12 text-center", className)} {...props}>
      <div className="grid size-20 place-items-center rounded-full border border-cyan/40 bg-cyan/10 text-cyan">
        <Icon aria-hidden="true" className="size-9" strokeWidth={2.25} />
      </div>
      <h3 className="font-display-italic pr-[0.06em] text-display-sm">{title}</h3>
      {body ? <p className="max-w-md text-body text-text-muted">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  ),
);
EmptyState.displayName = "EmptyState";
