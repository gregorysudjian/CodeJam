import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/ui/components/ui/button';
import { cn } from '@/ui/lib/utils';
import { KeyHint } from './KeyHint';

export const gameButtonVariants = cva(
  'group relative isolate overflow-hidden rounded-2xl font-display-italic leading-none tracking-[0.02em] transition-[transform,box-shadow,background-color,border-color,color] duration-200 ease-arena active:scale-[0.97] focus-ring focus-visible:outline-solid disabled:opacity-40 disabled:saturate-50 disabled:shadow-none [&_svg]:size-[1em] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-lime text-bg shadow-glow-lime hover:brightness-110',
        secondary:
          'bg-glass border-2 border-text/25 text-text shadow-[var(--na-shadow)] hover:border-lime hover:text-lime',
        ghost: 'bg-transparent text-text-muted hover:bg-text/[0.07] hover:text-text',
        danger:
          'bg-danger/15 text-danger border border-danger/60 hover:bg-danger hover:text-bg hover:shadow-glow-danger',
      },
      size: {
        md: 'h-14 gap-2.5 px-6 text-[22px]',
        lg: 'h-[72px] gap-3 px-8 text-[28px]',
        xl: 'h-[88px] gap-3.5 px-10 text-[36px]',
      },
      pulse: { true: 'animate-cta-pulse', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'lg', pulse: false },
  },
);

export interface GameButtonProps
  extends
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'>,
    VariantProps<typeof gameButtonVariants> {
  children: React.ReactNode;
  leadingIcon?: LucideIcon;
  trailingIcon?: LucideIcon;
  /** Keyboard shortcut shown as a key cap, e.g. "ENTER". */
  keyHint?: string;
}

/** The hero call-to-action button: condensed type, soft shadow, sheen sweep and press scale. */
export const GameButton = React.forwardRef<HTMLButtonElement, GameButtonProps>(
  (
    {
      variant,
      size,
      pulse,
      leadingIcon: Lead,
      trailingIcon: Trail,
      keyHint,
      className,
      children,
      ...props
    },
    ref,
  ) => (
    <Button
      ref={ref}
      variant="unstyled"
      size="unstyled"
      className={cn(gameButtonVariants({ variant, size, pulse }), className)}
      {...props}
    >
      {variant === 'primary' || variant == null ? (
        <span
          aria-hidden="true"
          className="sheen -z-10 group-hover:translate-x-[120%] group-focus-visible:translate-x-[120%]"
        />
      ) : null}
      {Lead ? <Lead aria-hidden="true" strokeWidth={2.75} /> : null}
      <span className="pr-[0.08em]">{children}</span>
      {Trail ? <Trail aria-hidden="true" strokeWidth={2.75} /> : null}
      {keyHint && ['ENTER', 'ESC', 'K'].includes(keyHint.toUpperCase()) ? (
        <KeyHint
          keyLabel={keyHint}
          tone={variant === 'primary' || variant == null ? 'onLime' : 'default'}
          className="ml-1"
        />
      ) : null}
    </Button>
  ),
);
GameButton.displayName = 'GameButton';
