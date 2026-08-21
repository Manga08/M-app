import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(projectRoot, "public", "ocr", "tesseract", "7.0.0");
const coreOutput = path.join(outputRoot, "core");
const languageOutput = path.join(outputRoot, "lang");

const tesseractRoot = path.dirname(require.resolve("tesseract.js/package.json"));
const tesseractModules = path.dirname(tesseractRoot);
const coreRoot = path.join(tesseractModules, "tesseract.js-core");
const spanishRoot = path.dirname(require.resolve("@tesseract.js-data/spa/package.json"));

const coreFiles = [
  "tesseract-core-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-relaxedsimd-lstm.wasm.js",
];

await rm(outputRoot, { recursive: true, force: true });
await Promise.all([
  mkdir(coreOutput, { recursive: true }),
  mkdir(languageOutput, { recursive: true }),
]);

await Promise.all([
  copyFile(path.join(tesseractRoot, "dist", "worker.min.js"), path.join(outputRoot, "worker.min.js")),
  copyFile(path.join(tesseractRoot, "LICENSE.md"), path.join(outputRoot, "LICENSE-tesseract-js.txt")),
  copyFile(path.join(coreRoot, "LICENSE"), path.join(outputRoot, "LICENSE-tesseract-core.txt")),
  copyFile(path.join(spanishRoot, "4.0.0_best_int", "spa.traineddata.gz"), path.join(languageOutput, "spa.traineddata.gz")),
  writeFile(path.join(outputRoot, "NOTICE.txt"), [
    "Moneva distribuye localmente Tesseract.js 7.0.0 y tesseract.js-core 7.0.0 bajo Apache-2.0.",
    "El modelo de idioma @tesseract.js-data/spa 1.0.0 se publica bajo MIT.",
    "Fuentes: https://github.com/naptha/tesseract.js y https://github.com/naptha/tessdata",
    "",
  ].join("\n")),
  ...coreFiles.map((file) => copyFile(path.join(coreRoot, file), path.join(coreOutput, file))),
]);

console.log("OCR local listo en public/ocr/tesseract/7.0.0");
