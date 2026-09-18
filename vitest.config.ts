import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // The cron tests dynamic-import @/lib/cron in beforeAll; under load (tsc + agents)
    // that import exceeded the 10s default and failed spuriously.
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
