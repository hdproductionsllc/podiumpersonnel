import { defineConfig } from 'vitest/config'
import path from 'path'

// Database tests: a real Postgres with every migration replayed. Kept out of
// vitest.config.ts so "npm test" stays free of network and Docker. Run with
// "npm run test:db" (needs DB_TEST_URL; see docs/database-tests.md).
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/lib/__tests__/db/**/*.test.ts'],
    globalSetup: ['src/lib/__tests__/db/global-setup.ts'],
    // Replaying ~90 migrations takes a while on a cold runner.
    hookTimeout: 120000,
    testTimeout: 30000,
    // One database, tests share its tables: run files one at a time.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
