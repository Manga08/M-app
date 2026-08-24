import sharp from "sharp";
import { monevaIconSvg, normalizeHexColor } from "@/lib/custom-theme";

export const runtime = "nodejs";

const ALLOWED_SIZES = new Set([32, 180, 192, 512]);

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const color = normalizeHexColor(searchParams.get("color"));
  const size = Number(searchParams.get("size"));
  const maskable = searchParams.get("maskable") === "1";
  if (!color || !ALLOWED_SIZES.has(size)) return new Response("Parámetros inválidos", { status: 400 });

  const image = await sharp(Buffer.from(monevaIconSvg(color, { maskable })))
    .resize(size, size)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  return new Response(new Uint8Array(image), {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "image/png",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
