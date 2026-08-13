import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker, type DayPickerProps } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { buttonVariants } from './button';

export function Calendar({ className, classNames, ...props }: DayPickerProps) {
  return (
    <DayPicker
      className={cn('p-1', className)}
      classNames={{
        months: 'flex flex-col gap-4',
        month: 'space-y-3',
        month_caption: 'flex h-8 items-center justify-center',
        caption_label: 'text-sm font-medium',
        nav: 'flex items-center gap-1 absolute right-1 top-1 z-10',
        button_previous: cn(
          buttonVariants({ variant: 'ghost', size: 'iconSm' }),
          'opacity-70 hover:opacity-100',
        ),
        button_next: cn(
          buttonVariants({ variant: 'ghost', size: 'iconSm' }),
          'opacity-70 hover:opacity-100',
        ),
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'w-8 text-[0.7rem] font-normal text-muted-foreground',
        week: 'mt-1 flex w-full',
        day: 'size-8 p-0 text-center text-sm',
        day_button: cn(
          buttonVariants({ variant: 'ghost', size: 'iconSm' }),
          'size-8 font-normal aria-selected:opacity-100',
        ),
        selected:
          '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button:hover]:bg-primary',
        today: '[&>button]:ring-1 [&>button]:ring-primary/60',
        outside: 'text-muted-foreground/50',
        disabled: 'text-muted-foreground/40',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...rest }) =>
          orientation === 'left' ? (
            <ChevronLeft className="size-4" {...rest} />
          ) : (
            <ChevronRight className="size-4" {...rest} />
          ),
      }}
      {...props}
    />
  );
}
