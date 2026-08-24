"use client";

import { useMemo, useState } from "react";
import { Check, Palette, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  applyCustomThemeToElement,
  customPwaTheme,
  DEFAULT_CUSTOM_THEME_COLOR,
  normalizeHexColor,
} from "@/lib/custom-theme";
import type { ColorTheme } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

const INSPIRATION_COLORS = ["#0F766E", "#2563EB", "#7C3AED", "#BE123C", "#B45309", "#334155"] as const;

export function CustomThemeDialog({
  activeTheme,
  savedColor,
  disabled,
  onApply,
}: {
  activeTheme: ColorTheme;
  savedColor: string;
  disabled?: boolean;
  onApply: (color: string) => Promise<boolean>;
}) {
  const normalizedSavedColor = normalizeHexColor(savedColor) ?? DEFAULT_CUSTOM_THEME_COLOR;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(normalizedSavedColor);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const validColor = normalizeHexColor(draft);
  const preview = useMemo(() => customPwaTheme(validColor ?? normalizedSavedColor), [normalizedSavedColor, validColor]);

  function previewColor(value: string) {
    const normalized = normalizeHexColor(value);
    setDraft(value);
    setError(normalized ? null : "Escribe un color HEX de 3 o 6 caracteres.");
    if (!normalized) return;
    const root = document.documentElement;
    applyCustomThemeToElement(root, normalized);
    root.dataset.palette = "custom";
  }

  function restoreSavedAppearance() {
    const root = document.documentElement;
    applyCustomThemeToElement(root, normalizedSavedColor);
    root.dataset.palette = activeTheme;
  }

  function openEditor() {
    setDraft(normalizedSavedColor);
    setError(null);
    setOpen(true);
    const root = document.documentElement;
    applyCustomThemeToElement(root, normalizedSavedColor);
    root.dataset.palette = "custom";
  }

  function closeEditor() {
    restoreSavedAppearance();
    setOpen(false);
  }

  async function applyColor() {
    const normalized = normalizeHexColor(draft);
    if (!normalized) {
      setError("Escribe un color HEX válido, por ejemplo #5B6EF5.");
      return;
    }
    setSaving(true);
    try {
      const saved = await onApply(normalized);
      if (saved) setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return <Dialog open={open} onOpenChange={(nextOpen) => nextOpen ? openEditor() : closeEditor()}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-pressed={activeTheme === "custom"}
          disabled={disabled}
          className={cn(
            "group flex min-h-16 items-center gap-3 py-3 text-left transition-colors hover:text-primary active:bg-secondary/55 disabled:opacity-65 sm:border-b",
            activeTheme === "custom" && "text-primary",
          )}
        >
          <ThemeMark color={normalizedSavedColor} className="size-11 shrink-0 rounded-[11px]" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Personalizado</span>
            <span className="block truncate text-xs text-muted-foreground">{normalizedSavedColor} · claro y oscuro</span>
          </span>
          {activeTheme === "custom" ? <Check className="size-4" /> : <Palette className="size-4 text-muted-foreground opacity-35 transition-opacity group-hover:opacity-100 sm:opacity-0" />}
        </button>
      </DialogTrigger>
      <DialogContent className="gap-5 sm:max-w-[31rem] sm:p-5" onEscapeKeyDown={restoreSavedAppearance} onPointerDownOutside={restoreSavedAppearance}>
        <DialogHeader>
          <DialogTitle>Tu color Moneva</DialogTitle>
          <DialogDescription>Elige el acento principal. Moneva adapta automáticamente contraste, superficies, gráficas e iconos para claro y oscuro.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 overflow-hidden rounded-2xl border" aria-label={`Vista previa del color ${validColor ?? normalizedSavedColor}`}>
          <div className="flex min-h-32 flex-col items-center justify-center gap-2 p-4" style={{ background: preview.themeLight, color: "#17201C" }}>
            <ThemeMark color={validColor ?? normalizedSavedColor} className="size-16 rounded-2xl shadow-sm" />
            <span className="text-xs font-medium">Claro</span>
          </div>
          <div className="flex min-h-32 flex-col items-center justify-center gap-2 p-4" style={{ background: preview.background, color: "#F5F5F0" }}>
            <ThemeMark color={validColor ?? normalizedSavedColor} className="size-16 rounded-2xl ring-1 ring-white/10" />
            <span className="text-xs font-medium">Oscuro</span>
          </div>
        </div>

        <div className="grid gap-4 min-[390px]:grid-cols-[3.5rem_minmax(0,1fr)] min-[390px]:items-end">
          <div>
            <Label htmlFor="custom-theme-picker" className="mb-2 min-[390px]:sr-only">Selector visual de color</Label>
            <input
              id="custom-theme-picker"
              type="color"
              value={validColor ?? normalizedSavedColor}
              onChange={(event) => previewColor(event.target.value)}
              className="moneva-color-input size-14 cursor-pointer rounded-[15px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-describedby="custom-theme-help"
            />
          </div>
          <div className="min-w-0">
            <Label htmlFor="custom-theme-hex">Código HEX</Label>
            <Input
              id="custom-theme-hex"
              value={draft}
              onChange={(event) => previewColor(event.target.value)}
              onBlur={() => {
                const normalized = normalizeHexColor(draft);
                if (normalized) setDraft(normalized);
              }}
              placeholder="#5B6EF5"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              maxLength={7}
              className="mt-2 font-mono uppercase tabular-nums"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "custom-theme-error custom-theme-help" : "custom-theme-help"}
            />
          </div>
        </div>
        <p id="custom-theme-help" className="text-xs leading-5 text-muted-foreground">Puedes probar el color en vivo. Solo se guarda al pulsar “Aplicar color”.</p>
        {error ? <p id="custom-theme-error" role="alert" className="text-xs font-medium text-destructive">{error}</p> : null}

        <fieldset>
          <legend className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground"><Sparkles className="size-3.5" />Inspiración</legend>
          <div className="grid grid-cols-3 gap-2 min-[390px]:grid-cols-6">
            {INSPIRATION_COLORS.map((color) => <button
              key={color}
              type="button"
              onClick={() => previewColor(color)}
              aria-label={`Probar color ${color}`}
              aria-pressed={validColor === color}
              className="relative aspect-square min-h-11 rounded-xl border border-foreground/10 transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              style={{ backgroundColor: color }}
            >{validColor === color ? <Check className="absolute inset-0 m-auto size-4 text-white drop-shadow-sm" /> : null}</button>)}
          </div>
        </fieldset>

        <DialogFooter className="sm:items-center sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => previewColor(DEFAULT_CUSTOM_THEME_COLOR)} disabled={saving} className="sm:mr-auto"><RotateCcw className="size-4" />Restablecer</Button>
          <Button type="button" variant="outline" onClick={closeEditor} disabled={saving}>Cancelar</Button>
          <Button type="button" onClick={() => void applyColor()} disabled={saving || !validColor} aria-busy={saving}>{saving ? "Guardando…" : "Aplicar color"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>;
}

function ThemeMark({ color, className }: { color: string; className?: string }) {
  const theme = customPwaTheme(color);
  return <svg viewBox="0 0 512 512" aria-hidden="true" className={className}>
    <rect width="512" height="512" rx="120" fill={theme.background} />
    <path d="M112 352 192 128h70l-80 224z" fill={theme.accent} />
    <path d="m250 128 70 0 80 224h-70z" fill={theme.accentDark} />
    <rect x="166" y="306" width="180" height="52" rx="26" fill={theme.accent} />
  </svg>;
}
