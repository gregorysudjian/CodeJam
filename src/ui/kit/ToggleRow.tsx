import * as React from "react";
import { Switch } from "@/ui/components/ui/switch";
import { cn } from "@/ui/lib/utils";

export interface ToggleRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** Settings row: label + description + switch, the whole row is clickable. */
export const ToggleRow = React.forwardRef<HTMLDivElement, ToggleRowProps>(
  ({ label, description, checked, onCheckedChange, disabled = false, className, ...props }, ref) => {
    const id = React.useId();
    return (
      <div
        ref={ref}
        className={cn(
          "glass flex min-h-20 items-center justify-between gap-6 rounded-[20px] px-6 py-4 transition-colors",
          checked && "border-lime/40",
          disabled && "opacity-50",
          className,
        )}
        {...props}
      >
        <label htmlFor={id} className={cn("flex flex-1 flex-col gap-1", disabled ? "cursor-not-allowed" : "cursor-pointer")}>
          <span className="font-display text-title font-bold uppercase leading-none">{label}</span>
          {description ? <span className="text-caption text-text-muted">{description}</span> : null}
        </label>
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          size="lg"
          className="focus-ring data-[state=unchecked]:bg-text/25"
        />
      </div>
    );
  },
);
ToggleRow.displayName = "ToggleRow";
