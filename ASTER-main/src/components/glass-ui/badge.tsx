// Vendored from Glass UI (https://github.com/crenspire/glass-ui, components/ui),
// MIT License, Crenspire Technologies. Changed: import paths, and shadcn's
// colour tokens (primary, foreground, ring...) mapped to ASTER's skin tokens,
// which are the only ones Tailwind generates utilities for here. See
// third_party/glass-ui/NOTICE.

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/cn"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-accent shadow hover:bg-accent/80",
        glass:
          "glass-bg backdrop-blur-[var(--blur-sm)] border border-[var(--glass-border)] text-ink shadow-[var(--glass-shadow-sm)]",
        glassSubtle:
          "glass-bg backdrop-blur-[var(--blur-sm)] border border-[var(--glass-border)] text-ink shadow-[var(--glass-shadow-sm)] opacity-50",
        frosted:
          "glass-frosted backdrop-blur-[var(--blur-frosted)] border border-[var(--glass-frosted-border)] text-ink shadow-[var(--glass-frosted-shadow)]",
        fluted:
          "glass-fluted backdrop-blur-[var(--blur)] border border-[var(--glass-border)] text-ink shadow-[var(--glass-shadow-sm)]",
        crystal:
          "glass-crystal backdrop-blur-[var(--blur-crystal)] border border-[var(--glass-crystal-border)] text-ink shadow-[var(--glass-crystal-shadow)]",
        secondary:
          "border-transparent bg-control text-ink hover:bg-control/80",
        destructive:
          "border-transparent bg-danger shadow hover:bg-danger/80",
        outline: "text-ink",
      },
    },
    defaultVariants: {
      variant: "glass",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }

