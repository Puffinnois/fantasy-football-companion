import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: { ...shared, '@main': resolve('src/main') } },
    build: {
      rollupOptions: {
        external: ['node:sqlite'],
        // The trade search runs in a worker thread (slice 6b spec §6), bundled beside the main entry.
        input: {
          index: resolve('src/main/index.ts'),
          tradeWorker: resolve('src/main/trade/worker.ts')
        }
      }
    }
  },
  preload: {
    resolve: { alias: shared }
  },
  renderer: {
    resolve: { alias: { ...shared, '@': resolve('src/renderer/src') } },
    plugins: [react(), tailwindcss()]
  }
})
