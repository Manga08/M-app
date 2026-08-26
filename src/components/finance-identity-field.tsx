"use client";

import { Check, Palette } from "lucide-react";
import { FinanceIconPicker, type IconKind } from "@/components/finance-icon-picker";
import { FormControl, FormControlAdornment, FormControlInput } from "@/components/ui/form-control";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const FINANCE_IDENTITY_COLORS = [
  "#34D399",
  "#F0445E",
  "#3B82F6",
  "#8B5CF6",
  "#F59E0B",
  "#14B8A6",
  "#FB7185",
  "#64748B",
] as const;

type FinanceColorPickerProps = {
  value: string;
  onValueChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
};

export function FinanceColorPicker({
  value,
  onValueChange,
  label = "Color",
  disabled = false,
  className,
}: FinanceColorPickerProps) {
  const normalized = normalizeColor(value);
  const isPreset = FINANCE_IDENTITY_COLORS.some((item) => item.toLowerCase() === normalized.toLowerCase());

  return (
    <fieldset className={cn("space-y-3", className)}>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2.5">
        {FINANCE_IDENTITY_COLORS.map((color) => {
          const selected = color.toLowerCase() === normalized.toLowerCase();
          return (
            <button
              key={color}
              type="button"
              disabled={disabled}
              aria-label={`Usar color ${color}`}
              aria-pressed={selected}
              onClick={() => onValueChange(color)}
              className="coarse-target grid size-11 place-items-center rounded-full ring-1 ring-inset ring-foreground/20 outline-none transition-[transform,box-shadow] duration-[var(--motion-duration-press)] ease-[var(--motion-ease-out)] focus-visible:ring-3 focus-visible:ring-ring/45 active:scale-[var(--motion-press-scale)] disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100"
              style={{
                backgroundColor: color,
                boxShadow: selected ? "0 0 0 3px var(--popover), 0 0 0 5px var(--foreground)" : undefined,
                color: swatchForeground(color),
              }}
            >
              {selected ? <Check className="size-4" strokeWidth={3} aria-hidden="true" /> : null}
            </button>
          );
        })}
        <label
          className={cn(
            "coarse-target relative grid size-11 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-foreground/35 bg-control text-foreground outline-none transition-[transform,box-shadow,border-color] duration-[var(--motion-duration-press)] ease-[var(--motion-ease-out)] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/45 active:scale-[var(--motion-press-scale)] motion-reduce:transition-none motion-reduce:active:scale-100",
            !isPreset && "border-solid",
            disabled && "pointer-events-none opacity-50",
          )}
          style={!isPreset ? { backgroundColor: normalized, color: swatchForeground(normalized), boxShadow: "0 0 0 3px var(--popover), 0 0 0 5px var(--foreground)" } : undefined}
        >
          <input
            type="color"
            value={normalized}
            onChange={(event) => onValueChange(event.target.value.toUpperCase())}
            disabled={disabled}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            aria-label={`Elegir un color personalizado. Color actual ${normalized}`}
          />
          {!isPreset ? <Check className="size-4" strokeWidth={3} aria-hidden="true" /> : <Palette className="size-[18px]" aria-hidden="true" />}
        </label>
      </div>
      <p className="text-[11px] leading-4 text-muted-foreground">Los tonos sugeridos combinan con Moneva; el último control permite elegir cualquier color.</p>
    </fieldset>
  );
}

type FinanceIdentityFieldProps = {
  id: string;
  label?: string;
  value: string;
  onValueChange: (value: string) => void;
  icon: string;
  onIconChange: (value: string) => void;
  color: string;
  onColorChange: (value: string) => void;
  placeholder?: string;
  helpText?: string;
  maxLength?: number;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  preferredKind?: IconKind;
  colorLabel?: string;
};

export function FinanceIdentityField({
  id,
  label = "Nombre e icono",
  value,
  onValueChange,
  icon,
  onIconChange,
  color,
  onColorChange,
  placeholder,
  helpText = "Toca el icono para personalizarlo y elige un color para reconocerlo más rápido.",
  maxLength = 100,
  required = false,
  disabled = false,
  autoFocus = false,
  preferredKind,
  colorLabel = "Color de identidad",
}: FinanceIdentityFieldProps) {
  const helpId = `${id}-identity-help`;
  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <FormControl className="mt-2">
          <FormControlAdornment interactive style={{ color }}>
            <FinanceIconPicker embedded preferredKind={preferredKind} value={icon} onValueChange={onIconChange} />
          </FormControlAdornment>
          <FormControlInput
            id={id}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            maxLength={maxLength}
            required={required}
            disabled={disabled}
            autoFocus={autoFocus}
            placeholder={placeholder}
            aria-describedby={helpId}
          />
        </FormControl>
        <p id={helpId} className="mt-1.5 text-[11px] leading-4 text-muted-foreground">{helpText}</p>
      </div>
      <FinanceColorPicker value={color} onValueChange={onColorChange} label={colorLabel} disabled={disabled} />
    </div>
  );
}

function normalizeColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : FINANCE_IDENTITY_COLORS[0];
}

function swatchForeground(color: string) {
  const normalized = normalizeColor(color).slice(1);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.58 ? "#111827" : "#FFFFFF";
}
