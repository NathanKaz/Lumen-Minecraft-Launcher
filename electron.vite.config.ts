import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    build: {
      outDir: resolve(__dirname, 'dist/main'),
      rollupOptions: {
        // protodef (used by prismarine-nbt) builds its parsers with eval() and
        // relies on a `const native = this.native` local. Bundling/minifying
        // drops that local as unused, leaving `native` undefined at runtime.
        // Keep the package external so Node loads its original source.
        external: ['electron', 'fs-extra', 'adm-zip', 'prismarine-nbt']
      }
    }
  },
  preload: {
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    build: {
      outDir: resolve(__dirname, 'dist/preload')
    }
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    build: {
      outDir: resolve(__dirname, 'dist/renderer')
    }
  }
})
