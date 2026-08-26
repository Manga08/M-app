"use client";

import { Check } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return <CheckboxPrimitive.Root data-slot="checkbox" className={cn("grid size-5 shrink-0 place-items-center rounded-[6px] border border-input bg-background text-primary-foreground outline-none transition-colors duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary", className)} {...props}><CheckboxPrimitive.Indicator data-slot="checkbox-indicator"><Check className="size-3.5" strokeWidth={2.5} /></CheckboxPrimitive.Indicator></CheckboxPrimitive.Root>;
}

export { Checkbox };
