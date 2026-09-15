import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@main': resolve('src/main'),
      '@shared': resolve('src/shared')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // node:sqlite is experimental in Node 22; keep test output clean
    execArgv: ['--disable-warning=ExperimentalWarning']
  }
})
