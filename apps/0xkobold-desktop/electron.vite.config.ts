import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'path';

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: resolve(__dirname, 'src/main/index.ts'),
        formats: ['es'],
        fileName: () => 'index.js',
      },
      outDir: 'dist/main',
      rollupOptions: {
        output: {
          format: 'es',
        },
      },
    },
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@main': resolve(__dirname, 'src/main'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
  },
  preload: {
    build: {
      lib: {
        entry: resolve(__dirname, 'src/preload/index.ts'),
        formats: ['es'],
        fileName: () => 'index.js',
      },
      outDir: 'dist/preload',
      rollupOptions: {
        output: {
          format: 'es',
        },
      },
    },
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@preload': resolve(__dirname, 'src/preload'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
  },
});
