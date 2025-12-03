import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.ts',
        // Phase 0: Exclude placeholder files that will be implemented in later phases
        // These exclusions should be removed as each module is implemented
        'src/cli.ts', // CLI implementation - Phase 2+
        'src/ir/**', // IR module - Phase 3+
        'src/semantic/analyzer.ts', // Semantic analyzer - Phase 3+
        'src/backend/codegen.ts', // Code generator - Phase 3+
        'src/semantic/type-checker.ts', // Type checker - Phase 2+
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
