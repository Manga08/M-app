import { describe, expect, it } from "vitest";
import { inspectImageHeader, validateFinanceImage } from "./local-image-ocr";

describe("validación local de imágenes financieras", () => {
  it("lee dimensiones PNG desde su cabecera", () => {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    bytes.set([0x00, 0x00, 0x04, 0x38], 16);
    bytes.set([0x00, 0x00, 0x07, 0x80], 20);
    expect(inspectImageHeader(bytes)).toEqual({ format: "png", width: 1080, height: 1920 });
  });

  it("lee dimensiones JPEG desde el primer marcador SOF", () => {
    const bytes = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x07, 0x80, 0x04, 0x38, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    ]);
    expect(inspectImageHeader(bytes)).toEqual({ format: "jpeg", width: 1080, height: 1920 });
  });

  it("lee dimensiones WebP extendidas", () => {
    const bytes = new Uint8Array(30);
    bytes.set([..."RIFF"].map((char) => char.charCodeAt(0)), 0);
    bytes.set([..."WEBPVP8X"].map((char) => char.charCodeAt(0)), 8);
    bytes.set([10, 0, 0, 0], 16);
    bytes.set([0, 0, 0, 0, 0x37, 0x04, 0x00, 0x7f, 0x07, 0x00], 20);
    expect(inspectImageHeader(bytes)).toEqual({ format: "webp", width: 1080, height: 1920 });
  });

  it("rechaza contenido cuya firma no coincide con el MIME", async () => {
    const fake = new File([new Uint8Array(32)], "captura.png", { type: "image/png" });
    await expect(validateFinanceImage(fake)).rejects.toThrow("no es una imagen JPG, PNG o WebP válida");
  });

  it("rechaza bombas de dimensiones antes de decodificarlas", async () => {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    bytes.set([0x00, 0x00, 0x1f, 0x40], 16);
    bytes.set([0x00, 0x00, 0x1f, 0x40], 20);
    const huge = new File([bytes], "enorme.png", { type: "image/png" });
    await expect(validateFinanceImage(huge)).rejects.toThrow("hasta 16 megapíxeles");
  });
});
