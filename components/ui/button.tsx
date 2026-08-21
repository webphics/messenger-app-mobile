import { TextClassContext } from "@/components/ui/text";
import {
  TactilePressable,
  type TactilePressableProps,
} from "@/components/ui/tactile-pressable";
import { cn } from "@/lib/cn";
import { cva, type VariantProps } from "class-variance-authority";
import { Platform } from "react-native";

const buttonVariants = cva(
  cn(
    "group shrink-0 flex-row items-center justify-center gap-2 rounded-xl shadow-none",
    Platform.select({
      web: "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive whitespace-nowrap outline-none transition-all focus-visible:ring-[3px] disabled:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    }),
  ),
  {
    variants: {
      variant: {
        default: cn(
          "bg-primary active:bg-primary/95 shadow-sm shadow-primary/25 active:shadow-none",
          Platform.select({ web: "hover:bg-primary/90" }),
        ),
        destructive: cn(
          "bg-destructive active:bg-destructive/95 shadow-sm shadow-danger/25 active:shadow-none",
          Platform.select({
            web: "hover:bg-destructive/90 focus-visible:ring-destructive/20",
          }),
        ),
        outline: cn(
          "border-line/80 bg-surface active:bg-line/35 border shadow-xs shadow-black/8 active:shadow-none",
          Platform.select({
            web: "hover:bg-primary-soft/30",
          }),
        ),
        secondary: cn(
          "bg-primary-soft active:bg-primary-soft/80 shadow-xs shadow-primary/15 active:shadow-none",
          Platform.select({ web: "hover:bg-primary-soft/80" }),
        ),
        ghost: cn(
          "active:bg-line/35",
          Platform.select({ web: "hover:bg-primary-soft/30" }),
        ),
        link: "",
      },
      size: {
        default: cn("h-12 px-5 py-2.5 rounded-xl", Platform.select({ web: "has-[>svg]:px-3" })),
        sm: cn("h-9 gap-1.5 rounded-lg px-3.5", Platform.select({ web: "has-[>svg]:px-2.5" })),
        lg: cn("h-13 rounded-2xl px-6", Platform.select({ web: "has-[>svg]:px-4" })),
        icon: "h-11 w-11 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const buttonTextVariants = cva(
  cn(
    "text-foreground text-base font-semibold",
    Platform.select({ web: "pointer-events-none transition-colors" }),
  ),
  {
    variants: {
      variant: {
        default: "text-primary-foreground",
        destructive: "text-white",
        outline: cn(
          "text-ink group-active:text-primary",
          Platform.select({ web: "group-hover:text-primary" }),
        ),
        secondary: "text-primary",
        ghost: "text-ink group-active:text-primary",
        link: cn(
          "text-primary group-active:underline",
          Platform.select({ web: "underline-offset-4 hover:underline group-hover:underline" }),
        ),
      },
      size: {
        default: "text-base font-semibold",
        sm: "text-sm font-medium",
        lg: "text-base font-semibold",
        icon: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = TactilePressableProps &
  VariantProps<typeof buttonVariants>;

function Button({
  className,
  variant,
  size,
  activeScale = 0.98,
  haptic = "none",
  ...props
}: ButtonProps) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
      <TactilePressable
        activeScale={activeScale}
        haptic={haptic}
        className={cn(
          props.disabled && "opacity-50",
          buttonVariants({ variant, size }),
          className,
        )}
        accessibilityRole="button"
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export { Button, buttonTextVariants, buttonVariants };
export type { ButtonProps };
