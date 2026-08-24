import { monevaIconSvg, normalizeHexColor } from "@/lib/custom-theme";

export const runtime = "nodejs";

export function GET(request: Request) {
  const color = normalizeHexColor(new URL(request.url).searchParams.get("color"));
  if (!color) return new Response("Color inválido", { status: 400 });
  return new Response(monevaIconSvg(color), {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; style-src 'none'; sandbox",
      "Content-Type": "image/svg+xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
