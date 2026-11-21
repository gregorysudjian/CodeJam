import * as React from "react";
import { Input } from "@/ui/components/ui/input";
import { cn } from "@/ui/lib/utils";

export interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label: string;
  hint?: string;
  error?: string | null;
  /** Right-side slot inside the field: a button or a unit. */
  trailing?: React.ReactNode;
}

/** Large glass text field with label, hint, error and an optional trailing slot. */
export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, hint, error, trailing, id, className, ...props }, ref) => {
    const auto = React.useId();
    const fieldId = id ?? auto;
    const descId = `${fieldId}-desc`;
    const hasDesc = Boolean(error || hint);
    return (
      <div className={cn("flex flex-col gap-3", className)}>
        <label htmlFor={fieldId} className="eyebrow text-text-muted">
          {label}
        </label>
        <div
          className={cn(
            "glass flex h-16 items-center gap-2 rounded-[18px] pr-2 transition-[border-color] duration-200 focus-within:border-lime/70",
            error && "border-danger/70 focus-within:border-danger focus-within:shadow-glow-danger",
          )}
        >
          <Input
            ref={ref}
            id={fieldId}
            aria-invalid={error ? true : undefined}
            aria-describedby={hasDesc ? descId : undefined}
            className="h-full flex-1 rounded-[18px] border-0 bg-transparent px-5 text-[24px] font-medium text-text shadow-none placeholder:text-text-dim focus-visible:ring-0 focus-visible:outline-none md:text-[24px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            {...props}
          />
          {trailing ? <div className="flex shrink-0 items-center">{trailing}</div> : null}
        </div>
        {hasDesc ? (
          <p id={descId} className={cn("text-caption", error ? "text-danger" : "text-text-muted")}>
            {error || hint}
          </p>
        ) : null}
      </div>
    );
  },
);
TextField.displayName = "TextField";
