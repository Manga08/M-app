"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-grid size-11 shrink-0 touch-manipulation place-items-center rounded-full border border-transparent bg-transparent p-0 transition-[border-color,box-shadow] duration-150 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <span data-slot="switch-track" className="pointer-events-none relative inline-flex items-center rounded-full p-0.5 transition-colors duration-150 group-data-[size=default]/switch:h-5 group-data-[size=default]/switch:w-9 group-data-[size=sm]/switch:h-4 group-data-[size=sm]/switch:w-7 group-data-[state=checked]/switch:bg-primary group-data-[state=unchecked]/switch:bg-input max-sm:group-data-[size=default]/switch:h-6 max-sm:group-data-[size=default]/switch:w-11 max-sm:group-data-[size=sm]/switch:h-5 max-sm:group-data-[size=sm]/switch:w-9 dark:group-data-[state=unchecked]/switch:bg-input/80">
        <SwitchPrimitive.Thumb
          data-slot="switch-thumb"
          className="pointer-events-none block rounded-full bg-background ring-0 transition-transform duration-150 group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 group-data-[size=default]/switch:data-checked:translate-x-[14.4px] group-data-[size=sm]/switch:data-checked:translate-x-[10.4px] max-sm:group-data-[size=default]/switch:size-5 max-sm:group-data-[size=sm]/switch:size-4 max-sm:group-data-[size=default]/switch:data-checked:translate-x-[18.4px] max-sm:group-data-[size=sm]/switch:data-checked:translate-x-[14.4px] dark:data-checked:bg-primary-foreground group-data-[size=default]/switch:data-unchecked:translate-x-0 group-data-[size=sm]/switch:data-unchecked:translate-x-0 dark:data-unchecked:bg-foreground"
        />
      </span>
    </SwitchPrimitive.Root>
  )
}

export { Switch }
