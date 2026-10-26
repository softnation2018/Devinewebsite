import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    // Unit tests by default. Database tests (*.int.test.ts) need a running
    // PostgreSQL and run with `npm run test:db`.
    include: process.env.VITEST_DB ? ['src/**/*.int.test.ts'] : ['src/**/*.test.ts'],
    exclude: process.env.VITEST_DB ? [] : ['src/**/*.int.test.ts', 'node_modules/**'],
    setupFiles: ['dotenv/config'],
  },
})
