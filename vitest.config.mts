import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", coverage: { reporter: ["text", "json", "html"], include: ["src/lib/finance/**/*.ts"] } },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
});
