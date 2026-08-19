import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("relative grid size-8 place-items-center", className)} aria-hidden="true">
      <span className="absolute left-[4px] h-5 w-[7px] -skew-x-[18deg] rounded-sm bg-primary" />
      <span className="absolute right-[4px] h-5 w-[7px] skew-x-[18deg] rounded-sm bg-primary/55" />
      <span className="absolute bottom-[5px] h-[5px] w-4 rounded-full bg-primary" />
    </span>
  );
}
