import path from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const directory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(directory, "src") },
  },
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
    coverage: {
      reporter: ["text", "json", "html"],
      include: ["src/lib/finance/**/*.ts"],
    },
  },
});
