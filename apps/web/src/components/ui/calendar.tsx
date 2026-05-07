import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker, getDefaultClassNames } from 'react-day-picker';

import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        ...defaultClassNames,
        root: cn(defaultClassNames.root, 'w-fit'),
        months: cn(defaultClassNames.months, 'flex flex-col sm:flex-row gap-2'),
        month: cn(defaultClassNames.month, 'flex flex-col gap-3'),
        month_caption: cn(
          defaultClassNames.month_caption,
          'flex h-7 items-center justify-center pt-1 relative',
        ),
        caption_label: cn(
          defaultClassNames.caption_label,
          'text-[13px] font-medium text-foreground',
        ),
        nav: cn(defaultClassNames.nav, 'flex items-center gap-1 absolute inset-x-1 top-0'),
        button_previous: cn(
          buttonVariants({ variant: 'ghost' }),
          'size-7 bg-transparent p-0 opacity-70 hover:opacity-100',
        ),
        button_next: cn(
          buttonVariants({ variant: 'ghost' }),
          'size-7 bg-transparent p-0 opacity-70 hover:opacity-100 ml-auto',
        ),
        chevron: 'size-4',
        month_grid: cn(defaultClassNames.month_grid, 'w-full border-collapse'),
        weekdays: cn(defaultClassNames.weekdays, 'flex'),
        weekday: cn(
          defaultClassNames.weekday,
          'text-muted-foreground w-8 font-normal text-[11px]',
        ),
        week: cn(defaultClassNames.week, 'flex w-full mt-1'),
        day: cn(
          defaultClassNames.day,
          'relative size-8 p-0 text-center text-[12px] focus-within:relative focus-within:z-20',
        ),
        day_button: cn(
          buttonVariants({ variant: 'ghost' }),
          'size-8 p-0 font-normal aria-selected:opacity-100',
        ),
        range_start: cn(
          defaultClassNames.range_start,
          'day-range-start aria-selected:bg-primary aria-selected:text-primary-foreground',
        ),
        range_end: cn(
          defaultClassNames.range_end,
          'day-range-end aria-selected:bg-primary aria-selected:text-primary-foreground',
        ),
        selected: cn(
          defaultClassNames.selected,
          'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
        ),
        today: cn(
          defaultClassNames.today,
          'bg-accent text-accent-foreground rounded-md',
        ),
        outside: cn(
          defaultClassNames.outside,
          'day-outside text-muted-foreground aria-selected:text-muted-foreground',
        ),
        disabled: cn(defaultClassNames.disabled, 'text-muted-foreground opacity-50'),
        range_middle: cn(
          defaultClassNames.range_middle,
          'aria-selected:bg-accent aria-selected:text-accent-foreground',
        ),
        hidden: cn(defaultClassNames.hidden, 'invisible'),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: cls, ...iconProps }) => {
          if (orientation === 'left')
            return <ChevronLeft className={cn('size-4', cls)} {...iconProps} />;
          return <ChevronRight className={cn('size-4', cls)} {...iconProps} />;
        },
      }}
      {...props}
    />
  );
}

export { Calendar };
