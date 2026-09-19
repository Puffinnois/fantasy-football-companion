import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@main': resolve('src/main'),
      '@shared': resolve('src/shared'),
      '@': resolve('src/renderer/src')
    }
  },
  // Component tests are .tsx; the root tsconfig is a solution file, so tell esbuild about the runtime.
  esbuild: { jsx: 'automatic' },
  test: {
    // Node by default; a component test opts into jsdom with `// @vitest-environment jsdom`.
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    // node:sqlite is experimental in Node 22; keep test output clean
    execArgv: ['--disable-warning=ExperimentalWarning']
  }
})
