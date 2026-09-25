import { cn } from '@/lib/cn';
import { colors } from '@/lib/tokens';
import * as React from 'react';
import { Platform, TextInput } from 'react-native';

type InputProps = React.ComponentProps<typeof TextInput> & {
  /** RNR registry leftover (NativeWind). Not a Uniwind TextInput prop — stripped. */
  placeholderClassName?: string;
};

const Input = React.forwardRef(function Input(
  { className, placeholderClassName, ...props }: InputProps,
  ref: React.Ref<TextInput>,
) {
  return (
    <TextInput
      ref={ref}
      className={cn(
        'border border-line/80 bg-line/35 text-ink flex h-11 w-full min-w-0 flex-row items-center rounded-2xl px-3.5 py-2 font-normal text-base leading-5 dark:border-line/80 dark:bg-line/20 dark:text-ink',
        props.editable === false &&
          cn(
            'opacity-50',
            Platform.select({ web: 'disabled:pointer-events-none disabled:cursor-not-allowed' })
          ),
        Platform.select({
          web: cn(
            'placeholder:text-muted selection:bg-primary selection:text-primary-foreground outline-none transition-[color,box-shadow,border-color]',
            'focus-visible:border-primary focus-visible:ring-primary/20 focus-visible:ring-[3px]',
            'aria-invalid:ring-danger/20 aria-invalid:border-danger'
          ),
        }),
        className
      )}
      // Uniwind reads no `placeholder:` variant on native, so the class alone left Android's
      // default hint color, which is near-white when the phone is in dark mode.
      placeholderTextColor={colors.muted}
      {...props}
    />
  );
});

export { Input };
