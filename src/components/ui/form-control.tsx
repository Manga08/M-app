import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const controlFrame = "group/form-control relative flex h-[52px] w-full min-w-0 items-center overflow-hidden rounded-[14px] border border-input bg-secondary/25 transition-[border-color,box-shadow,background-color] focus-within:border-ring focus-within:bg-background focus-within:ring-3 focus-within:ring-ring/30 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 dark:bg-input/25";

function InputControl({ leading, containerClassName, className, ...props }: React.ComponentProps<typeof Input> & { leading?: React.ReactNode; containerClassName?: string }) {
  return <div data-slot="form-control" className={cn(controlFrame, containerClassName)} onClick={focusNestedControl}>
    {leading ? <span data-slot="form-control-leading" className="pointer-events-none grid h-full w-12 shrink-0 place-items-center text-muted-foreground [&_svg]:size-[18px]">{leading}</span> : null}
    <Input className={cn("h-full flex-1 rounded-none border-0 bg-transparent px-4 shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent", leading && "pl-0", className)} {...props} />
  </div>;
}

function SelectControl({ leading, containerClassName, className, children, ...props }: React.ComponentProps<"select"> & { leading?: React.ReactNode; containerClassName?: string }) {
  return <div data-slot="form-control" className={cn(controlFrame, containerClassName)} onClick={focusNestedControl}>
    {leading ? <span data-slot="form-control-leading" className="pointer-events-none grid h-full w-12 shrink-0 place-items-center text-muted-foreground [&_svg]:size-[18px]">{leading}</span> : null}
    <select className={cn("h-full min-w-0 flex-1 appearance-none bg-transparent px-4 pr-11 text-base outline-none sm:text-sm", leading && "pl-0", className)} {...props}>{children}</select>
    <span className="pointer-events-none -ml-11 grid h-full w-11 shrink-0 place-items-center text-muted-foreground"><ChevronDown className="size-4" /></span>
  </div>;
}

function focusNestedControl(event: React.MouseEvent<HTMLDivElement>) {
  if ((event.target as HTMLElement).closest("input, select, textarea, button")) return;
  const control = event.currentTarget.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea");
  control?.focus();
  if (control instanceof HTMLSelectElement) {
    try { (control as HTMLSelectElement & { showPicker?: () => void }).showPicker?.(); } catch { /* Some browsers expose showPicker without allowing programmatic opening. */ }
  }
}

export { InputControl, SelectControl };
