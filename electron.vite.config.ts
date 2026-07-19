import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Config do electron-vite: 3 alvos de build (main, preload, renderer).
export default defineConfig({
  main: {
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'electron/main/index.ts') } }
    }
  },
  preload: {
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'electron/preload/index.ts') } }
    }
  },
  renderer: {
    root: 'src',
    resolve: { alias: { '@shared': resolve(__dirname, 'shared') } },
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/index.html') } }
    },
    plugins: [react()]
  }
})
