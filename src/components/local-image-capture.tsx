"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, ImagePlus, Images, RefreshCw, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { CaptureCandidate } from "@/lib/finance/local-image-capture";
import { cn } from "@/lib/utils";

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ACCEPTED_IMAGES = "image/jpeg,image/png,image/webp";
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

type CapturePhase = "idle" | "reading" | "ready" | "error";

export function LocalImageCapture({
  referenceDate,
  onCandidate,
  disabled = false,
}: {
  referenceDate: string;
  onCandidate: (candidate: CaptureCandidate) => void;
  disabled?: boolean;
}) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const runIdRef = useRef(0);
  const recognitionActiveRef = useRef(false);
  const [phase, setPhase] = useState<CapturePhase>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("La imagen se procesa únicamente en este dispositivo.");
  const [candidate, setCandidate] = useState<CaptureCandidate | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    runIdRef.current += 1;
    if (recognitionActiveRef.current) {
      void import("@/lib/finance/local-image-ocr")
        .then(({ cancelFinanceImageRecognition }) => cancelFinanceImageRecognition())
        .catch(() => undefined);
    }
  }, []);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function readImage(file?: File) {
    clearInputValues();
    if (!file) return;

    const validationError = validateImage(file);
    if (validationError) {
      setPreviewUrl(null);
      setFileName(file.name || "Imagen no compatible");
      setProgress(0);
      setPhase("error");
      setError(validationError);
      setStatus(validationError);
      setCandidate(null);
      return;
    }

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setPreviewUrl(URL.createObjectURL(file));
    setFileName(file.name || "Imagen capturada");
    setCandidate(null);
    setError(null);
    setProgress(2);
    setStatus("Preparando la imagen…");
    setPhase("reading");
    recognitionActiveRef.current = true;

    try {
      const [{ recognizeFinanceImage }, { analyzeOcrText }] = await Promise.all([
        import("@/lib/finance/local-image-ocr"),
        import("@/lib/finance/local-image-capture"),
      ]);
      if (runIdRef.current !== runId) return;
      const result = await recognizeFinanceImage(file, {
        onProgress: (nextProgress: number, nextStatus: string) => {
          if (runIdRef.current !== runId) return;
          setProgress(clampProgress(nextProgress));
          setStatus(nextStatus || "Leyendo la imagen…");
        },
      });
      if (runIdRef.current !== runId) return;

      const nextCandidate = analyzeOcrText(result.text, { referenceDate });
      setCandidate(nextCandidate);
      setProgress(100);
      setStatus(candidateStatus(nextCandidate));
      setPhase("ready");
      onCandidate(nextCandidate);
    } catch (cause) {
      if (runIdRef.current !== runId) return;
      const message = cause instanceof Error && cause.message
        ? cause.message
        : "No pudimos leer esta imagen. Intenta con una foto más nítida.";
      setPreviewUrl(null);
      setError(message);
      setStatus(message);
      setPhase("error");
    } finally {
      if (runIdRef.current === runId) recognitionActiveRef.current = false;
    }
  }

  function discardImage() {
    runIdRef.current += 1;
    if (recognitionActiveRef.current) {
      recognitionActiveRef.current = false;
      void import("@/lib/finance/local-image-ocr")
        .then(({ cancelFinanceImageRecognition }) => cancelFinanceImageRecognition())
        .catch(() => undefined);
    }
    setPreviewUrl(null);
    setFileName("");
    setProgress(0);
    setCandidate(null);
    setError(null);
    setStatus("La imagen se procesa únicamente en este dispositivo.");
    setPhase("idle");
    clearInputValues();
  }

  function clearInputValues() {
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }

  return <section className="mt-5 border-y border-border/70 py-4" aria-labelledby="local-image-capture-title" aria-busy={phase === "reading"}>
    <input ref={cameraInputRef} type="file" accept={ACCEPTED_IMAGES} capture="environment" className="hidden" onChange={(event) => void readImage(event.target.files?.[0])} />
    <input ref={galleryInputRef} type="file" accept={ACCEPTED_IMAGES} className="hidden" onChange={(event) => void readImage(event.target.files?.[0])} />

    {phase === "idle" ? <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary" aria-hidden="true"><ImagePlus className="size-5" /></span>
        <div className="min-w-0">
          <h3 id="local-image-capture-title" className="text-sm font-medium">Rellenar desde una imagen</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Toma una foto o elige una captura. Nada se sube ni se guarda automáticamente.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex" role="group" aria-label="Agregar imagen">
        <Button type="button" variant="secondary" className="h-11 rounded-xl" disabled={disabled} onClick={() => cameraInputRef.current?.click()}><Camera className="size-4" />Cámara</Button>
        <Button type="button" variant="outline" className="h-11 rounded-xl" disabled={disabled} onClick={() => galleryInputRef.current?.click()}><Images className="size-4" />Galería</Button>
      </div>
    </div> : <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:items-center">
      <div className="relative size-16 overflow-hidden rounded-2xl bg-secondary sm:size-[72px]">
        {previewUrl ? <Image src={previewUrl} alt={`Vista previa de ${fileName}`} fill sizes="72px" unoptimized className="object-cover" /> : <span className="grid size-full place-items-center text-muted-foreground" aria-hidden="true"><ImagePlus className="size-5" /></span>}
        <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-foreground/10" aria-hidden="true" />
      </div>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <StateIcon phase={phase} />
          <h3 id="local-image-capture-title" className="truncate text-sm font-medium">{phase === "reading" ? "Leyendo la imagen" : phase === "ready" ? "Datos listos para revisar" : "No pudimos leerla"}</h3>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{fileName}</p>
        {phase === "reading" ? <Progress className="mt-2" label="Progreso de lectura de la imagen" value={progress} valueText={`${Math.round(progress)}%. ${status}`} /> : null}
        {phase === "ready" && candidate ? <CandidateSummary candidate={candidate} /> : null}
        {phase === "error" && error ? <p className="mt-2 text-xs leading-5 text-destructive" role="alert"><TriangleAlert className="mr-1 inline size-3.5" aria-hidden="true" />{error}</p> : null}
      </div>

      <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-1 sm:flex">
        {phase !== "reading" ? <Button type="button" variant="secondary" className="h-11 rounded-xl" disabled={disabled} onClick={() => galleryInputRef.current?.click()}><RefreshCw className="size-4" />{phase === "error" ? "Reintentar" : "Otra imagen"}</Button> : null}
        <Button type="button" variant="ghost" className={cn("h-11 rounded-xl", phase === "reading" && "col-span-2")} disabled={disabled} onClick={discardImage}><Trash2 className="size-4" />{phase === "reading" ? "Cancelar lectura" : "Descartar imagen"}</Button>
      </div>
    </div>}

    {phase !== "error" ? <p className="sr-only" aria-live="polite" aria-atomic="true">{status}</p> : null}
    <div className="mt-3 flex items-start gap-2 rounded-xl bg-warning/8 px-3 py-2.5 text-xs leading-5 text-warning" role="note" aria-label="Función de lectura de imágenes en beta"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /><p><strong className="font-semibold">Función en beta.</strong> Puede interpretar datos de forma incorrecta. Confirma monto, fecha, cuenta y categoría antes de guardar.</p></div>
    <p className="mt-3 flex items-center gap-2 text-[11px] leading-4 text-muted-foreground"><ShieldCheck className="size-3.5 shrink-0 text-positive" aria-hidden="true" />Lectura local: la foto no sale de este dispositivo.</p>
  </section>;
}

function CandidateSummary({ candidate }: { candidate: CaptureCandidate }) {
  const amount = candidate.amount
    ? new Intl.NumberFormat("es-CO", { style: "currency", currency: candidate.currencyCode, maximumFractionDigits: 0 }).format(candidate.amount)
    : null;
  const summary = [amount, candidate.merchant].filter(Boolean).join(" · ");
  const warnings = candidate.warnings.slice(0, 2);

  return <div className="mt-2">
    {summary ? <p className="truncate text-xs font-medium tabular-nums">{summary}</p> : null}
    {warnings.length ? <ul className="mt-1 space-y-1 text-[11px] leading-4 text-warning" aria-label="Campos por revisar">{warnings.map((warning) => <li key={`${warning.code}-${warning.field ?? "source"}`} className="flex items-start gap-1.5"><TriangleAlert className="mt-px size-3 shrink-0" aria-hidden="true" /><span>{warning.message}</span></li>)}</ul> : <p className="mt-1 flex items-center gap-1.5 text-[11px] leading-4 text-positive"><CheckCircle2 className="size-3 shrink-0" aria-hidden="true" />Completamos los campos confiables; confirma antes de guardar.</p>}
  </div>;
}

function StateIcon({ phase }: { phase: CapturePhase }) {
  if (phase === "ready") return <CheckCircle2 className="size-4 shrink-0 text-positive" aria-hidden="true" />;
  if (phase === "error") return <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />;
  return <RefreshCw className="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />;
}

function validateImage(file: File) {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) return "Usa una imagen JPG, PNG o WebP.";
  if (file.size <= 0) return "La imagen está vacía. Elige otra foto.";
  if (file.size > MAX_IMAGE_BYTES) return "La imagen supera 12 MB. Toma otra foto o reduce su tamaño.";
  return null;
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function candidateStatus(candidate: CaptureCandidate) {
  if (!candidate.amount) return "Leímos la imagen, pero falta confirmar el monto en el formulario.";
  if (candidate.warnings.length) return "Completamos los campos confiables. Revisa las advertencias antes de guardar.";
  return "Lectura terminada. Revisa y confirma los datos antes de guardar.";
}
