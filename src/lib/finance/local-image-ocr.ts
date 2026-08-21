"use client";

const OCR_ROOT = "/ocr/tesseract/7.0.0";
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 16_000_000;
const MAX_SOURCE_SIDE = 8_000;
const MAX_OCR_PIXELS = 4_000_000;
const MAX_OCR_SIDE = 2_400;
const OCR_TIMEOUT_MS = 30_000;
const HEADER_BYTES = 256 * 1024;

type OcrWorker = {
  setParameters(parameters: { tessedit_pageseg_mode: string; preserve_interword_spaces: string }): Promise<unknown>;
  recognize(image: HTMLCanvasElement): Promise<{ data: { text: string; confidence: number } }>;
  terminate(): Promise<unknown>;
};

type ImageMetadata = {
  format: "jpeg" | "png" | "webp";
  width: number;
  height: number;
};

type ProgressOptions = {
  onProgress?: (progress: number, status: string) => void;
};

let activeWorker: OcrWorker | null = null;
let pendingWorker: Promise<OcrWorker> | null = null;
let cancelActive: ((reason: Error) => void) | null = null;

export async function recognizeFinanceImage(file: File, options: ProgressOptions = {}) {
  await cancelFinanceImageRecognition();
  const onProgress = options.onProgress ?? (() => {});
  const resources: { canvas: HTMLCanvasElement | null } = { canvas: null };
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const cancelled = new Promise<never>((_, reject) => {
    cancelActive = reject;
  });
  const timedOut = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error("La lectura tardó demasiado. Intenta con una imagen más recortada o nítida.");
      void terminateActiveWorker();
      reject(error);
    }, OCR_TIMEOUT_MS);
  });

  const run = async () => {
    onProgress(3, "Validando la imagen…");
    const metadata = await validateFinanceImage(file);
    onProgress(7, "Preparando la imagen sin metadatos…");
    resources.canvas = await normalizeFinanceImage(file, metadata);
    onProgress(10, "Preparando el lector local…");

    const tesseract = await import("tesseract.js");
    const workerPromise = tesseract.createWorker("spa", tesseract.OEM.LSTM_ONLY, {
      workerPath: `${OCR_ROOT}/worker.min.js`,
      corePath: `${OCR_ROOT}/core`,
      langPath: `${OCR_ROOT}/lang`,
      cacheMethod: "write",
      gzip: true,
      legacyCore: false,
      legacyLang: false,
      workerBlobURL: false,
      logger: (message) => {
        const mapped = mapTesseractProgress(message.status, message.progress);
        onProgress(mapped.progress, mapped.status);
      },
    }) as Promise<OcrWorker>;
    pendingWorker = workerPromise;
    const worker = await workerPromise;
    pendingWorker = null;
    activeWorker = worker;

    await worker.setParameters({
      tessedit_pageseg_mode: tesseract.PSM.AUTO,
      preserve_interword_spaces: "1",
    });
    onProgress(64, "Buscando montos, fechas y comercios…");
    const result = await worker.recognize(resources.canvas);
    onProgress(99, "Organizando los datos detectados…");
    return {
      text: result.data.text,
      confidence: Math.max(0, Math.min(100, result.data.confidence || 0)),
    };
  };

  try {
    return await Promise.race([run(), cancelled, timedOut]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    cancelActive = null;
    if (resources.canvas) {
      resources.canvas.width = 0;
      resources.canvas.height = 0;
    }
    await terminateActiveWorker();
  }
}

export async function cancelFinanceImageRecognition() {
  const cancellation = cancelActive;
  cancelActive = null;
  cancellation?.(new DOMException("Lectura cancelada", "AbortError"));
  await terminateActiveWorker();
}

export async function validateFinanceImage(file: File): Promise<ImageMetadata> {
  if (!file || file.size <= 0) throw new Error("La imagen está vacía. Elige otra foto.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("La imagen supera 12 MB. Toma otra foto o reduce su tamaño.");
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) {
    throw new Error("Usa una imagen JPG, PNG o WebP.");
  }

  const bytes = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
  const metadata = inspectImageHeader(bytes);
  if (!metadata) throw new Error("El archivo no es una imagen JPG, PNG o WebP válida.");
  const expectedMime = metadata.format === "jpeg" ? "image/jpeg" : `image/${metadata.format}`;
  if (file.type !== expectedMime) throw new Error("El tipo del archivo no coincide con el contenido de la imagen.");
  if (metadata.width > MAX_SOURCE_SIDE || metadata.height > MAX_SOURCE_SIDE || metadata.width * metadata.height > MAX_SOURCE_PIXELS) {
    throw new Error("La imagen tiene dimensiones demasiado grandes. Usa una foto de hasta 16 megapíxeles.");
  }
  return metadata;
}

export function inspectImageHeader(bytes: Uint8Array): ImageMetadata | null {
  return inspectPng(bytes) ?? inspectJpeg(bytes) ?? inspectWebp(bytes);
}

async function normalizeFinanceImage(file: File, metadata: ImageMetadata) {
  const decoded = await decodeImage(file);
  try {
    const orientedWidth = decoded.width || metadata.width;
    const orientedHeight = decoded.height || metadata.height;
    const scale = Math.min(
      1,
      MAX_OCR_SIDE / Math.max(orientedWidth, orientedHeight),
      Math.sqrt(MAX_OCR_PIXELS / (orientedWidth * orientedHeight)),
    );
    const width = Math.max(1, Math.round(orientedWidth * scale));
    const height = Math.max(1, Math.round(orientedHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Este navegador no pudo preparar la imagen.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(decoded.source, 0, 0, width, height);
    return canvas;
  } finally {
    decoded.close();
  }
}

async function decodeImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // WebKit versions without this option continue through the safe image fallback.
    }
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("No pudimos abrir la imagen. Puede estar dañada."));
      image.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function terminateActiveWorker() {
  const worker = activeWorker;
  const workerPromise = pendingWorker;
  activeWorker = null;
  pendingWorker = null;
  try {
    const target = worker ?? (workerPromise ? await workerPromise : null);
    await target?.terminate();
  } catch {
    // A worker can reject while it is being initialized or terminated. No user data is retained.
  }
}

function mapTesseractProgress(status: string, rawProgress: number) {
  const progress = Math.max(0, Math.min(1, Number.isFinite(rawProgress) ? rawProgress : 0));
  if (status === "loading tesseract core") return { progress: 10 + progress * 18, status: "Cargando el lector local…" };
  if (status === "loading language traineddata") return { progress: 28 + progress * 24, status: "Preparando el idioma español…" };
  if (status === "initializing tesseract" || status === "initializing api") return { progress: 52 + progress * 12, status: "Iniciando el reconocimiento…" };
  if (status === "recognizing text") return { progress: 64 + progress * 34, status: "Leyendo la imagen en este dispositivo…" };
  return { progress: 10 + progress * 50, status: "Preparando la lectura local…" };
}

function inspectPng(bytes: Uint8Array): ImageMetadata | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) return null;
  const width = readUint32Be(bytes, 16);
  const height = readUint32Be(bytes, 20);
  return validDimensions(width, height) ? { format: "png", width, height } : null;
}

function inspectJpeg(bytes: Uint8Array): ImageMetadata | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 8 < bytes.length) {
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
    if (marker === 0xda || offset + 2 > bytes.length) break;
    const length = readUint16Be(bytes, offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (startOfFrame.has(marker) && length >= 7) {
      const height = readUint16Be(bytes, offset + 3);
      const width = readUint16Be(bytes, offset + 5);
      return validDimensions(width, height) ? { format: "jpeg", width, height } : null;
    }
    offset += length;
  }
  return null;
}

function inspectWebp(bytes: Uint8Array): ImageMetadata | null {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return null;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunk = ascii(bytes, offset, 4);
    const chunkLength = readUint32Le(bytes, offset + 4);
    const data = offset + 8;
    if (data + chunkLength > bytes.length) return null;
    if (chunk === "VP8X" && chunkLength >= 10) {
      const width = 1 + readUint24Le(bytes, data + 4);
      const height = 1 + readUint24Le(bytes, data + 7);
      return validDimensions(width, height) ? { format: "webp", width, height } : null;
    }
    if (chunk === "VP8L" && chunkLength >= 5 && bytes[data] === 0x2f) {
      const width = 1 + (((bytes[data + 2] & 0x3f) << 8) | bytes[data + 1]);
      const height = 1 + (((bytes[data + 4] & 0x0f) << 10) | (bytes[data + 3] << 2) | ((bytes[data + 2] & 0xc0) >> 6));
      return validDimensions(width, height) ? { format: "webp", width, height } : null;
    }
    if (chunk === "VP8 " && chunkLength >= 10 && bytes[data + 3] === 0x9d && bytes[data + 4] === 0x01 && bytes[data + 5] === 0x2a) {
      const width = readUint16Le(bytes, data + 6) & 0x3fff;
      const height = readUint16Le(bytes, data + 8) & 0x3fff;
      return validDimensions(width, height) ? { format: "webp", width, height } : null;
    }
    offset = data + chunkLength + (chunkLength % 2);
  }
  return null;
}

function validDimensions(width: number, height: number) {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0;
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function readUint16Be(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint16Le(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint24Le(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUint32Be(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

function readUint32Le(bytes: Uint8Array, offset: number) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}
