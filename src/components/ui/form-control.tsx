"use client";

import * as React from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const controlFrame = "group/form-control relative flex h-[52px] w-full min-w-0 items-center overflow-hidden rounded-[14px] border border-input bg-control text-control-foreground transition-[border-color,box-shadow,background-color] duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] focus-within:border-ring focus-within:bg-background focus-within:ring-3 focus-within:ring-ring/30 has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-3 has-[[aria-invalid=true]]:ring-destructive/20 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55";
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const selectedDateFormatter = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
const monthTitleFormatter = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "UTC" });
const monthOptionFormatter = new Intl.DateTimeFormat("es-CO", { month: "short", timeZone: "UTC" });
const calendarDayFormatter = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const emptySelectSentinel = "__moneva-empty-option__";

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
        (type === "date" || type === "month") && "min-w-[9.5rem] tabular-nums",
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
  onValueChange,
  ...props
}: Omit<React.ComponentProps<"select">, "onChange"> & {
  leading?: React.ReactNode;
  containerClassName?: string;
  onValueChange?: (value: string) => void;
}) {
  const desktopPicker = useDesktopPicker();
  const options = optionChildren(children);
  const hasEnabledEmptyOption = options.some((option) => option.value === "" && !option.disabled);
  const desktopSections = optionSections(options.filter((option) => option.value !== "" || !option.disabled));

  return (
    <FormControl className={containerClassName}>
      {leading ? <FormControlAdornment>{leading}</FormControlAdornment> : null}
      {desktopPicker ? (
        <Select
          key={options.map((option) => option.value).join("|")}
          value={props.value === undefined ? undefined : desktopSelectValue(String(props.value), hasEnabledEmptyOption)}
          defaultValue={props.defaultValue === undefined ? undefined : desktopSelectValue(String(props.defaultValue), hasEnabledEmptyOption)}
          onValueChange={(value) => onValueChange?.(value === emptySelectSentinel ? "" : value)}
          disabled={props.disabled}
          required={props.required}
          name={props.name}
        >
          <SelectTrigger
            id={props.id}
            aria-label={props["aria-label"]}
            aria-describedby={props["aria-describedby"]}
            aria-invalid={props["aria-invalid"]}
            className={cn(
              "h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-3.5 text-base shadow-none focus-visible:border-0 focus-visible:ring-0 sm:text-sm dark:bg-transparent dark:hover:bg-transparent",
              className,
            )}
          >
            <SelectValue placeholder={options.find((option) => option.value === "")?.label ?? "Selecciona"} />
          </SelectTrigger>
          <SelectContent
            position="popper"
            align="start"
            sideOffset={6}
            className="max-h-80 min-w-[var(--radix-select-trigger-width)] border border-border/80 bg-popover/98 p-1 shadow-xl backdrop-blur-xl"
          >
            {desktopSections.map((section) => section.group ? (
              <SelectGroup key={section.key}>
                <SelectLabel>{section.group}</SelectLabel>
                {section.options.map((option) => <DesktopSelectItem key={`${section.key}:${option.value || emptySelectSentinel}`} option={option} hasEnabledEmptyOption={hasEnabledEmptyOption} />)}
              </SelectGroup>
            ) : section.options.map((option) => <DesktopSelectItem key={`${section.key}:${option.value || emptySelectSentinel}`} option={option} hasEnabledEmptyOption={hasEnabledEmptyOption} />))}
          </SelectContent>
        </Select>
      ) : (
        <FormControlSelect className={className} {...props} onChange={(event) => onValueChange?.(event.target.value)}>
          {children}
        </FormControlSelect>
      )}
    </FormControl>
  );
}

function DateControl({
  id,
  value,
  onValueChange,
  containerClassName,
  disabled,
  required,
  min,
  max,
  ...props
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  containerClassName?: string;
  disabled?: boolean;
  required?: boolean;
  min?: string;
  max?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-label"?: string;
}) {
  const desktopPicker = useDesktopPicker();
  const [open, setOpen] = React.useState(false);
  const [viewMonth, setViewMonth] = React.useState(() => firstOfMonth(parseIsoDate(value) ?? new Date()));

  if (!desktopPicker) {
    return (
      <FormControl className={containerClassName}>
        <FormControlInput
          id={id}
          type="date"
          value={value}
          min={min}
          max={max}
          disabled={disabled}
          required={required}
          onChange={(event) => onValueChange(event.target.value)}
          {...props}
        />
      </FormControl>
    );
  }

  const selected = parseIsoDate(value);
  return (
    <Popover open={open} onOpenChange={(next) => {
      if (next) setViewMonth(firstOfMonth(selected ?? new Date()));
      setOpen(next);
    }}>
      <FormControl className={containerClassName}>
        <FormControlAdornment><CalendarDays /></FormControlAdornment>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            role="combobox"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={`${id}-calendar`}
            disabled={disabled}
            aria-required={required || undefined}
            aria-describedby={props["aria-describedby"]}
            aria-invalid={props["aria-invalid"]}
            aria-label={props["aria-label"]}
            className="flex h-full min-w-0 flex-1 items-center justify-between gap-3 px-3.5 text-left text-sm outline-none"
          >
            <span className={cn("truncate tabular-nums", !selected && "text-muted-foreground")}>{selected ? formatSelectedDate(selected) : "Selecciona una fecha"}</span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </PopoverTrigger>
      </FormControl>
      <CalendarPopover
        contentId={`${id}-calendar`}
        selected={selected}
        viewMonth={viewMonth}
        onViewMonthChange={setViewMonth}
        min={min}
        max={max}
        onSelect={(next) => { onValueChange(next); setOpen(false); }}
      />
    </Popover>
  );
}

function MonthControl({ id, value, onValueChange, containerClassName, disabled, required, min, max, ...props }: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  containerClassName?: string;
  disabled?: boolean;
  required?: boolean;
  min?: string;
  max?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-label"?: string;
}) {
  const desktopPicker = useDesktopPicker();
  const [open, setOpen] = React.useState(false);
  const [viewYear, setViewYear] = React.useState(() => parseIsoMonth(value)?.getUTCFullYear() ?? new Date().getFullYear());
  const selected = parseIsoMonth(value);

  if (!desktopPicker) {
    return <FormControl className={containerClassName}><FormControlInput id={id} type="month" value={value} min={min} max={max} disabled={disabled} required={required} onChange={(event) => onValueChange(event.target.value)} {...props} /></FormControl>;
  }

  const selectedLabel = selected ? monthTitleFormatter.format(selected) : "Selecciona un mes";
  return <Popover open={open} onOpenChange={(next) => { if (next) setViewYear(selected?.getUTCFullYear() ?? new Date().getFullYear()); setOpen(next); }}>
    <FormControl className={containerClassName}>
      <FormControlAdornment><CalendarDays /></FormControlAdornment>
      <PopoverTrigger asChild><button id={id} type="button" role="combobox" aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-months`} aria-required={required || undefined} aria-describedby={props["aria-describedby"]} aria-invalid={props["aria-invalid"]} aria-label={props["aria-label"]} disabled={disabled} className="flex h-full min-w-0 flex-1 items-center justify-between gap-3 px-3.5 text-left text-sm outline-none"><span className={cn("truncate capitalize tabular-nums", !selected && "text-muted-foreground")}>{selectedLabel}</span><ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /></button></PopoverTrigger>
    </FormControl>
    <PopoverContent id={`${id}-months`} role="dialog" aria-label="Elegir mes" align="start" sideOffset={6} className="w-80 gap-3 rounded-2xl border border-border/80 bg-popover/98 p-3 shadow-xl backdrop-blur-xl" onOpenAutoFocus={(event) => { event.preventDefault(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-month-value="${value || `${viewYear}-${String(new Date().getMonth() + 1).padStart(2, "0")}`}"]`)?.focus()); }}>
      <div className="flex items-center justify-between"><button type="button" className="grid size-10 place-items-center rounded-xl text-muted-foreground transition-colors duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/40" aria-label="Año anterior" onClick={() => setViewYear((year) => year - 1)}><ChevronLeft className="size-4" /></button><p className="font-medium tabular-nums">{viewYear}</p><button type="button" className="grid size-10 place-items-center rounded-xl text-muted-foreground transition-colors duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/40" aria-label="Año siguiente" onClick={() => setViewYear((year) => year + 1)}><ChevronRight className="size-4" /></button></div>
      <div className="grid grid-cols-3 gap-1.5">{Array.from({ length: 12 }, (_, month) => {
        const monthValue = `${viewYear}-${String(month + 1).padStart(2, "0")}`;
        const selectedMonth = monthValue === value;
        const unavailable = Boolean(min && monthValue < min || max && monthValue > max);
        return <button key={monthValue} type="button" data-month-value={monthValue} disabled={unavailable} aria-pressed={selectedMonth} className={cn("coarse-target min-h-10 rounded-xl px-2 text-sm font-medium capitalize transition-colors duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-30", selectedMonth && "bg-primary text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground")} onClick={() => { onValueChange(monthValue); setOpen(false); }}>{monthOptionFormatter.format(new Date(Date.UTC(viewYear, month, 1))).replace(".", "")}</button>;
      })}</div>
    </PopoverContent>
  </Popover>;
}

function parseIsoMonth(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  if (month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month - 1, 1));
}

function CalendarPopover({ contentId, selected, viewMonth, onViewMonthChange, min, max, onSelect }: {
  contentId: string;
  selected: Date | null;
  viewMonth: Date;
  onViewMonthChange: (date: Date) => void;
  min?: string;
  max?: string;
  onSelect: (value: string) => void;
}) {
  const first = firstOfMonth(viewMonth);
  const offset = (first.getUTCDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, index) => addUtcDays(first, index - offset));
  const selectedIso = selected ? dateToIso(selected) : "";
  const todayIso = dateToIso(new Date());
  const focusIso = days.some((date) => dateToIso(date) === selectedIso) ? selectedIso : days.find((date) => date.getUTCMonth() === first.getUTCMonth()) ? dateToIso(days.find((date) => date.getUTCMonth() === first.getUTCMonth())!) : dateToIso(first);

  function focusDate(date: Date) {
    const nextMonth = firstOfMonth(date);
    if (nextMonth.getTime() !== first.getTime()) onViewMonthChange(nextMonth);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-calendar-date="${dateToIso(date)}"]`)?.focus());
  }

  return (
    <PopoverContent
      id={contentId}
      role="dialog"
      aria-label="Elegir fecha"
      align="start"
      sideOffset={6}
      className="w-80 gap-3 rounded-2xl border border-border/80 bg-popover/98 p-3 shadow-xl backdrop-blur-xl"
      onOpenAutoFocus={(event) => { event.preventDefault(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-calendar-date="${focusIso}"]`)?.focus()); }}
    >
      <div className="flex items-center justify-between">
        <button type="button" className="grid size-10 place-items-center rounded-xl text-muted-foreground transition-colors duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/40" aria-label="Mes anterior" onClick={() => onViewMonthChange(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() - 1, 1)))}><ChevronLeft className="size-4" /></button>
        <p className="font-medium capitalize">{monthTitleFormatter.format(first)}</p>
        <button type="button" className="grid size-10 place-items-center rounded-xl text-muted-foreground transition-colors duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/40" aria-label="Mes siguiente" onClick={() => onViewMonthChange(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1)))}><ChevronRight className="size-4" /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground" aria-hidden="true">{["L", "M", "X", "J", "V", "S", "D"].map((day) => <span key={day} className="py-1">{day}</span>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((date) => {
          const iso = dateToIso(date);
          const outside = date.getUTCMonth() !== first.getUTCMonth();
          const selectedDay = iso === selectedIso;
          const disabled = Boolean(min && iso < min || max && iso > max);
          return <button
            key={iso}
            type="button"
            data-calendar-date={iso}
            tabIndex={iso === focusIso ? 0 : -1}
            disabled={disabled}
            aria-pressed={selectedDay}
            aria-current={iso === todayIso ? "date" : undefined}
            aria-label={calendarDayFormatter.format(date)}
            className={cn("grid size-9 place-items-center rounded-xl text-sm tabular-nums transition-colors duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-30", outside && "text-muted-foreground", selectedDay && "bg-primary text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground", iso === todayIso && !selectedDay && "font-semibold text-primary")}
            onClick={() => onSelect(iso)}
            onKeyDown={(event) => {
              const offsets: Partial<Record<React.KeyboardEvent["key"], number>> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
              const dayOffset = offsets[event.key];
              if (dayOffset === undefined) return;
              event.preventDefault();
              focusDate(addUtcDays(date, dayOffset));
            }}
          >{date.getUTCDate()}</button>;
        })}
      </div>
      <button type="button" className="min-h-10 rounded-xl text-sm font-medium text-primary transition-colors duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/40" onClick={() => onSelect(todayIso)}>Usar hoy</button>
    </PopoverContent>
  );
}

function parseIsoDate(value: string) {
  if (!isoDatePattern.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function firstOfMonth(date: Date) { return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)); }
function addUtcDays(date: Date, days: number) { return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days)); }
function dateToIso(date: Date) { return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`; }
function formatSelectedDate(date: Date) { return selectedDateFormatter.format(date); }

type NormalizedSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
  group?: string;
};

function optionChildren(children: React.ReactNode, group?: string): NormalizedSelectOption[] {
  return React.Children.toArray(children).flatMap((child) => {
    if (!React.isValidElement(child)) return [];
    if (child.type === React.Fragment) return optionChildren((child.props as { children?: React.ReactNode }).children, group);
    if (child.type === "optgroup") {
      const props = child.props as React.ComponentProps<"optgroup">;
      return optionChildren(props.children, String(props.label ?? ""));
    }
    if (child.type !== "option") return [];
    const props = child.props as React.ComponentProps<"option">;
    return [{ value: String(props.value ?? ""), label: React.Children.toArray(props.children).join(""), disabled: props.disabled, group }];
  });
}

function optionSections(options: NormalizedSelectOption[]) {
  const sections = new Map<string, NormalizedSelectOption[]>();
  for (const option of options) {
    const key = option.group ?? "";
    const section = sections.get(key);
    if (section) section.push(option);
    else sections.set(key, [option]);
  }
  return [...sections.entries()].map(([group, sectionOptions], index) => ({
    key: group || `ungrouped-${index}`,
    group: group || undefined,
    options: sectionOptions,
  }));
}

function DesktopSelectItem({ option, hasEnabledEmptyOption }: { option: NormalizedSelectOption; hasEnabledEmptyOption: boolean }) {
  return <SelectItem value={desktopSelectValue(option.value, hasEnabledEmptyOption)} disabled={option.disabled} className="min-h-10 px-3 pr-9">
    {option.label}
  </SelectItem>;
}

function desktopSelectValue(value: string, hasEnabledEmptyOption: boolean) {
  return value === "" && hasEnabledEmptyOption ? emptySelectSentinel : value;
}

const desktopPickerQuery = "(min-width: 640px) and (pointer: fine)";

function subscribeDesktopPicker(onStoreChange: () => void) {
  const media = window.matchMedia(desktopPickerQuery);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function useDesktopPicker() {
  return React.useSyncExternalStore(
    subscribeDesktopPicker,
    () => window.matchMedia(desktopPickerQuery).matches,
    () => false,
  );
}

function focusNestedControl(event: React.MouseEvent<HTMLDivElement>) {
  if ((event.target as HTMLElement).closest("input, select, textarea, button")) return;
  const control = event.currentTarget.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>("input, select, textarea, button");
  control?.focus({ preventScroll: true });

  if (control instanceof HTMLButtonElement) {
    control.click();
    return;
  }

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
  DateControl,
  MonthControl,
  InputControl,
  SelectControl,
};
