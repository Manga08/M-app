"use client";

import * as React from "react";
import { DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type FormDialogVariant = "compact" | "flow";

/**
 * Canonical editor surface.
 *
 * Mobile intentionally treats every financial entity editor as a complete task.
 * The compact/flow distinction starts at the desktop breakpoint only.
 */
export function FormDialogContent({
  variant = "compact",
  className,
  ...props
}: React.ComponentProps<typeof DialogContent> & { variant?: FormDialogVariant }) {
  return (
    <DialogContent
      data-form-dialog={variant}
      className={cn(
        "fullscreen-dialog-close-safe flex max-h-[94dvh] flex-col gap-0 overflow-hidden p-0 max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:pb-0",
        variant === "compact" ? "sm:max-w-lg sm:rounded-3xl" : "sm:max-w-5xl sm:rounded-3xl",
        className,
      )}
      {...props}
    />
  );
}

export function FormDialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-form-dialog-body
      className={cn(
        "safe-dialog-top mobile-scroll min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pb-8 pt-5 min-[360px]:px-5 sm:px-7 sm:pb-7 sm:pt-7",
        className,
      )}
      {...props}
    />
  );
}

export function FormDialogActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-form-dialog-actions
      className={cn(
        "flex shrink-0 flex-col gap-2 border-t bg-popover/96 px-4 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-18px_44px_-34px_rgba(0,0,0,.7)] backdrop-blur-xl min-[360px]:px-5 sm:flex-row-reverse sm:px-7 sm:py-4 sm:shadow-none",
        className,
      )}
      {...props}
    />
  );
}
