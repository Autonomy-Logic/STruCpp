import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./scripts/rebuild-libs.mjs"],
    globals: true,
    environment: "node",
    // The forks pool loses the last onTaskUpdate under coverage and the run exits 1.
    pool: "threads",
    include: ["tests/**/*.test.ts", "tests/**/*.spec.ts"],
    exclude: ["node_modules", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/*.test.ts",
        "src/cli.ts", // untested — CLI entry point
      ],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 75,
        statements: 75,
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
