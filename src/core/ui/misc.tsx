import * as AvatarPrimitive from '@radix-ui/react-avatar';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset [&_svg]:size-3',
  {
    variants: {
      tone: {
        primary: 'bg-primary/12 text-primary ring-primary/25',
        secondary: 'bg-secondary text-secondary-foreground ring-border',
        success: 'bg-success/12 text-success ring-success/25',
        warning: 'bg-warning/15 text-warning ring-warning/30',
        danger: 'bg-destructive/12 text-destructive ring-destructive/25',
        info: 'bg-info/12 text-info ring-info/25',
        gray: 'bg-muted text-muted-foreground ring-border',
      },
    },
    defaultVariants: { tone: 'gray' },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('border-border bg-card text-card-foreground rounded-xl border', className)}
      {...props}
    />
  );
}

export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('bg-muted animate-pulse rounded-md', className)} {...props} />;
}

export const Separator = React.forwardRef<
  React.ComponentRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    decorative={decorative}
    orientation={orientation}
    className={cn(
      'bg-border shrink-0',
      orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
      className,
    )}
    {...props}
  />
));
Separator.displayName = 'Separator';

export function Avatar({
  src,
  fallback,
  className,
}: {
  src?: string | null;
  fallback: string;
  className?: string;
}) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        'bg-muted relative flex size-8 shrink-0 overflow-hidden rounded-full',
        className,
      )}
    >
      {src ? (
        <AvatarPrimitive.Image src={src} className="aspect-square size-full object-cover" alt="" />
      ) : null}
      <AvatarPrimitive.Fallback className="text-muted-foreground flex size-full items-center justify-center text-xs font-medium">
        {fallback}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('text-muted-foreground size-4 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
