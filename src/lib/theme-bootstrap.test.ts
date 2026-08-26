import { describe, expect, it, vi } from "vitest";
import { customThemeTokenCache, CUSTOM_THEME_STORAGE_KEY, CUSTOM_THEME_TOKENS_STORAGE_KEY } from "./custom-theme";
import { PWA_THEME_STORAGE_KEY } from "./pwa-theme";
import { THEME_BOOTSTRAP_SCRIPT, themeBootstrapMarkup } from "./theme-bootstrap";

function runBootstrap(values: Record<string, string>) {
  const dataset: Record<string, string> = { palette: "moneva" };
  const setProperty = vi.fn();
  const documentStub = { documentElement: { dataset, style: { setProperty } } };
  const storage = { getItem: (key: string) => values[key] ?? null };
  new Function("document", "localStorage", THEME_BOOTSTRAP_SCRIPT)(documentStub, storage);
  return { dataset, setProperty };
}

describe("arranque temprano del tema", () => {
  it("serializa un script con nonce sin aceptar atributos manipulados", () => {
    expect(themeBootstrapMarkup("abc123")).toContain('nonce="abc123"');
    expect(themeBootstrapMarkup('abc" onload="alert(1)')).not.toContain("onload");
    expect(themeBootstrapMarkup()).toContain('id="moneva-theme-bootstrap"');
  });

  it("aplica una paleta guardada antes de que React hidrate", () => {
    const result = runBootstrap({ [PWA_THEME_STORAGE_KEY]: "crimson" });
    expect(result.dataset.palette).toBe("crimson");
    expect(result.setProperty).not.toHaveBeenCalled();
  });

  it("restaura los tokens verificados del color personalizado", () => {
    const cache = customThemeTokenCache("#3366AA");
    const result = runBootstrap({
      [PWA_THEME_STORAGE_KEY]: "custom",
      [CUSTOM_THEME_STORAGE_KEY]: cache.color,
      [CUSTOM_THEME_TOKENS_STORAGE_KEY]: JSON.stringify(cache),
    });
    expect(result.dataset.palette).toBe("custom");
    expect(result.dataset.customColor).toBe("#3366AA");
    expect(result.setProperty).toHaveBeenCalledTimes(44);
  });

  it("ignora una caché personalizada manipulada", () => {
    const result = runBootstrap({
      [PWA_THEME_STORAGE_KEY]: "custom",
      [CUSTOM_THEME_STORAGE_KEY]: "#3366AA",
      [CUSTOM_THEME_TOKENS_STORAGE_KEY]: JSON.stringify({ color: "#3366AA", light: { background: "url(https://example.com)" }, dark: {} }),
    });
    expect(result.dataset.palette).toBe("moneva");
  });
});
