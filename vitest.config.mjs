import path from "node:path";
import { defineConfig } from "vitest/config";
import { config } from "dotenv";

// Same precedence as Next.js: development overrides, then .env.local.
config({ path: ".env.development.local", quiet: true });
config({ path: ".env.local", quiet: true });

const alias = {
  "@": path.resolve(import.meta.dirname),
  "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.js"),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      { resolve: { alias }, test: { name: "unit", include: ["tests/unit/**/*.test.js"], environment: "node" } },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.js"],
          environment: "node",
          testTimeout: 30_000,
          hookTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
