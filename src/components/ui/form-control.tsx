import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const controlFrame = "group/form-control relative flex h-[52px] w-full min-w-0 items-center overflow-hidden rounded-[14px] border border-input bg-control text-control-foreground transition-[border-color,box-shadow,background-color] duration-150 focus-within:border-ring focus-within:bg-background focus-within:ring-3 focus-within:ring-ring/30 has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-3 has-[[aria-invalid=true]]:ring-destructive/20 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55";

function FormControl({ className, onClick, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="form-control"
      className={cn(controlFrame, className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) focusNestedControl(event);
      }}
      {...props}
    />
  );
}

function FormControlAdornment({
  className,
  interactive = false,
  side = "leading",
  ...props
}: React.ComponentProps<"div"> & {
  interactive?: boolean;
  side?: "leading" | "trailing";
}) {
  return (
    <div
      data-slot={`form-control-${side}`}
      data-interactive={interactive ? "true" : "false"}
      aria-hidden={interactive ? undefined : true}
      className={cn(
        "relative grid h-full w-[52px] shrink-0 place-items-center text-muted-foreground after:pointer-events-none after:absolute after:inset-y-0 after:w-px after:bg-input [&_svg]:size-[18px]",
        side === "leading" ? "order-first after:right-0" : "order-last after:left-0",
        interactive
          ? "pointer-events-auto p-0 [&>[data-slot=dialog-trigger]]:h-full [&>[data-slot=dialog-trigger]]:w-full [&>[data-slot=dialog-trigger]]:rounded-none [&>[data-slot=dialog-trigger]]:border-0"
          : "pointer-events-none",
        className,
      )}
      {...props}
    />
  );
}

function FormControlInput({ className, type, ...props }: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="form-control-input"
      type={type}
      className={cn(
        "h-full flex-1 rounded-none border-0 bg-transparent px-3.5 shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent",
        type === "date" && "min-w-[9.5rem] tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

function FormControlSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <>
      <select
        data-slot="form-control-select"
        className={cn(
          "h-full min-w-0 flex-1 appearance-none bg-transparent px-3.5 pr-11 text-base outline-none sm:text-sm",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <span
        data-slot="form-control-native-indicator"
        aria-hidden="true"
        className="pointer-events-none -ml-11 grid h-full w-11 shrink-0 place-items-center text-muted-foreground"
      >
        <ChevronDown className="size-4" />
      </span>
    </>
  );
}

function InputControl({
  leading,
  trailing,
  containerClassName,
  className,
  type,
  ...props
}: React.ComponentProps<typeof Input> & {
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  containerClassName?: string;
}) {
  // Keep one calendar only: the native date affordance remains visible and interactive.
  const visibleLeading = type === "date" ? null : leading;

  return (
    <FormControl className={containerClassName}>
      {visibleLeading ? <FormControlAdornment>{visibleLeading}</FormControlAdornment> : null}
      <FormControlInput
        type={type}
        className={cn(visibleLeading && "pl-3.5", trailing && "pr-2", className)}
        {...props}
      />
      {trailing ? <FormControlAdornment side="trailing">{trailing}</FormControlAdornment> : null}
    </FormControl>
  );
}

function SelectControl({
  leading,
  containerClassName,
  className,
  children,
  ...props
}: React.ComponentProps<"select"> & {
  leading?: React.ReactNode;
  containerClassName?: string;
}) {
  return (
    <FormControl className={containerClassName}>
      {leading ? <FormControlAdornment>{leading}</FormControlAdornment> : null}
      <FormControlSelect className={className} {...props}>{children}</FormControlSelect>
    </FormControl>
  );
}

function focusNestedControl(event: React.MouseEvent<HTMLDivElement>) {
  if ((event.target as HTMLElement).closest("input, select, textarea, button")) return;
  const control = event.currentTarget.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea");
  control?.focus({ preventScroll: true });

  if (control instanceof HTMLSelectElement || (control instanceof HTMLInputElement && control.type === "date")) {
    try {
      (control as (HTMLSelectElement | HTMLInputElement) & { showPicker?: () => void }).showPicker?.();
    } catch {
      // Some browsers expose showPicker without allowing programmatic opening.
    }
  }
}

export {
  FormControl,
  FormControlAdornment,
  FormControlInput,
  FormControlSelect,
  InputControl,
  SelectControl,
};
