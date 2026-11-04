import { capsText } from '@/lib/caps-text';
import { cn } from '@/lib/cn';
import { Slot } from '@rn-primitives/slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { Platform, Text as RNText, type Role } from 'react-native';

/** ChatRoute type roles — size/weight/leading only; color stays on the caller. */
const textVariants = cva(
  cn(
    'font-sans text-foreground',
    Platform.select({
      web: 'select-text',
    })
  ),
  {
    variants: {
      variant: {
        default: 'text-base font-normal leading-normal',
        display: 'text-2xl font-extrabold leading-tight tracking-tight',
        headline: 'text-xl font-extrabold leading-tight tracking-tight',
        title: 'text-base font-semibold leading-snug',
        body: 'text-base font-normal leading-normal',
        meta: 'text-sm font-normal leading-5',
        label: 'text-xs font-semibold leading-tight',
        mono: 'font-mono text-sm font-normal leading-5',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

type TextVariantProps = VariantProps<typeof textVariants>;

type TextVariant = NonNullable<TextVariantProps['variant']>;

const ROLE: Partial<Record<TextVariant, Role>> = {
  display: 'heading',
  headline: 'heading',
  title: 'heading',
};

const ARIA_LEVEL: Partial<Record<TextVariant, string>> = {
  display: '1',
  headline: '2',
  title: '3',
};

const TextClassContext = React.createContext<string | undefined>(undefined);

function Text({
  className,
  asChild = false,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof RNText> &
  React.RefAttributes<typeof RNText> &
  TextVariantProps & {
    asChild?: boolean;
  }) {
  const textClass = React.useContext(TextClassContext);
  const Component = asChild ? Slot : RNText;
  const merged = cn(textVariants({ variant }), textClass, className);
  // `uppercase` is applied to the string rather than left to `textTransform`,
  // which Android measures before it applies — see `lib/caps-text`.
  const caps = asChild ? null : capsText(merged, props.children);
  return (
    <Component
      className={caps?.className ?? merged}
      role={variant ? ROLE[variant] : undefined}
      aria-level={variant ? ARIA_LEVEL[variant] : undefined}
      aria-label={
        props['aria-label'] ?? props.accessibilityLabel ?? (caps?.label || undefined)
      }
      {...props}
      {...(caps ? { children: caps.children } : null)}
    />
  );
}

export { Text, TextClassContext, textVariants };
export type { TextVariant, TextVariantProps };
