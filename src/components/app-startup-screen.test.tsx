import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppStartupScreen } from "./app-startup-screen";

describe("AppStartupScreen", () => {
  it("comunica una carga indeterminada sin inventar porcentajes", () => {
    const markup = renderToStaticMarkup(<AppStartupScreen state="loading" />);

    expect(markup).toContain('data-app-startup-screen="true"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("Preparando tu espacio");
    expect(markup).toContain("Cuentas · movimientos · planes");
    expect(markup).not.toMatch(/\b\d+%/);
  });

  it("convierte el fallo de arranque en un estado accionable", () => {
    const markup = renderToStaticMarkup(<AppStartupScreen state="unavailable" error="No pudimos recuperar la copia." onRetry={vi.fn()} />);

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Tus datos siguen protegidos");
    expect(markup).toContain("No pudimos recuperar la copia.");
    expect(markup).toContain("Intentar de nuevo");
    expect(markup).not.toContain('aria-busy="true"');
  });
});
