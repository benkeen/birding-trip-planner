import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/main'
    },
    resolve: {
      alias: {
        '@main': path.resolve(__dirname, './src/main'),
        '@shared': path.resolve(__dirname, './src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        input: path.resolve(__dirname, 'src/main/preload.ts')
      }
    }
  },
  renderer: {
    build: {
      outDir: 'dist/renderer'
    },
    resolve: {
      alias: {
        '@renderer': path.resolve(__dirname, './src/renderer'),
        '@shared': path.resolve(__dirname, './src/shared')
      }
    },
    plugins: [react()]
  }
})
