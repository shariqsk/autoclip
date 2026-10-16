/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// The same build serves three places: the web (root), GitHub Pages (a sub-path, via BASE_PATH) and the
// Electron desktop app (`--mode desktop`), which has no use for a service worker.
export default defineConfig(({ mode }) => ({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    tailwindcss(),
    // Installable, and the app shell works offline. Speech and voice models are cached separately by
    // transformers.js in the Cache API after their first download.
    VitePWA({
      disable: mode === 'desktop',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'AutoClip',
        short_name: 'AutoClip',
        description: 'Drop in a song and your clips. AutoClip cuts a beat-synced edit on its own.',
        theme_color: '#0b0b0f',
        background_color: '#0b0b0f',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The speech and voice workers are big and optional: cache them when first used instead.
        globIgnores: ['**/ml.worker-*.js', '**/tts.worker-*.js'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /(ml|tts)\.worker-.*\.js$/,
            handler: 'CacheFirst',
            options: { cacheName: 'model-workers', expiration: { maxEntries: 6 } },
          },
          {
            // The ONNX runtime's WebAssembly is large; cache it on first use instead of precaching.
            urlPattern: /\.wasm$/,
            handler: 'CacheFirst',
            options: { cacheName: 'onnx-runtime', expiration: { maxEntries: 6 } },
          },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  // The ML workers bundle transformers.js and kokoro and are loaded on demand, off the main thread.
  build: { chunkSizeWarningLimit: 1200 },
  optimizeDeps: { exclude: ['@huggingface/transformers', 'kokoro-js'] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'electron/**/*.test.mjs'],
  },
}))
