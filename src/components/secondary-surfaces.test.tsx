import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OfflinePage from "@/app/offline/page";
import NotFound from "@/app/not-found";
import { getAccessChangeConfirmation, type AuthorizedUser } from "@/components/access-admin-page";
import { PageHeader } from "@/components/page-header";
import { normalizePagination, PaginationControls } from "@/components/pagination-controls";
import { isPwaUpdateReady } from "@/components/pwa-register";

const member: AuthorizedUser = {
  email: "persona@gmail.com",
  role: "member",
  enabled: true,
  createdAt: "2026-08-19T00:00:00Z",
  hasSignedIn: true,
};

describe("secondary surface contracts", () => {
  it("explains the impact before promoting or revoking access", () => {
    const promotion = getAccessChangeConfirmation(member, "admin", true);
    const revocation = getAccessChangeConfirmation(member, "member", false);

    expect(promotion.description).toContain("gestionar esta lista");
    expect(promotion.description).toContain("no le da acceso a los datos financieros");
    expect(promotion.destructive).toBe(false);
    expect(revocation.description).toContain("no se borrarán");
    expect(revocation.destructive).toBe(true);
  });

  it("renders one visible content heading at every breakpoint", () => {
    const markup = renderToStaticMarkup(<PageHeader eyebrow="Tu espacio" title="Cuentas" description="Dónde vive tu dinero." />);

    expect(markup.match(/<h1/g)).toHaveLength(1);
    expect(markup).toContain(">Cuentas</h1>");
    expect(markup).not.toContain("sr-only text-[clamp");
  });

  it("normalizes pagination and gives every control a specific destination", () => {
    expect(normalizePagination(9, 3, -2)).toEqual({ page: 3, pageCount: 3, total: 0 });
    const markup = renderToStaticMarkup(<PaginationControls page={2} pageCount={4} total={32} label="movimientos" onPageChange={() => undefined} />);

    expect(markup).toContain('aria-label="Paginación de movimientos"');
    expect(markup).toContain('aria-label="Ir a la página 1 de movimientos"');
    expect(markup).toContain('aria-label="Ir a la página 3 de movimientos"');
    expect(markup.match(/class="[^"]*size-11 rounded-xl/g)).toHaveLength(2);
    expect(markup).toContain('aria-live="polite"');
  });

  it("keeps the offline state recoverable and explicit", () => {
    const markup = renderToStaticMarkup(<OfflinePage />);

    expect(markup).toContain("Tu información sigue en este dispositivo");
    expect(markup).toContain("Comprobar conexión");
    expect(markup).toContain('aria-label="Qué ocurre sin conexión"');
  });

  it("gives unknown routes a branded and recoverable destination", () => {
    const markup = renderToStaticMarkup(<NotFound />);

    expect(markup).toContain("Esta dirección no lleva a una pantalla de Moneva");
    expect(markup).toContain("Ir al inicio");
    expect(markup).toContain('data-public-surface="true"');
  });

  it("only announces a PWA update after a controlled worker is installed", () => {
    expect(isPwaUpdateReady("installed", true)).toBe(true);
    expect(isPwaUpdateReady("installed", false)).toBe(false);
    expect(isPwaUpdateReady("installing", true)).toBe(false);
  });
});
