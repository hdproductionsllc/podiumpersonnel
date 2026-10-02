import { configDefaults, defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // The cron tests dynamic-import @/lib/cron in beforeAll; under load (tsc + agents)
    // that import exceeded the 10s default and failed spuriously.
    hookTimeout: 30000,
    // Needs a real Postgres; vitest.db.config.ts runs these (npm run test:db).
    exclude: [...configDefaults.exclude, 'src/lib/__tests__/db/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
