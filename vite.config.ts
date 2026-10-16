/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// The face models (detector, landmarks, recognition) ship with the app under models/face/, copied
// from the face-api package at build time and served from it in dev, so finding people works offline.
const FACE_MODELS = ['ssd_mobilenetv1_model', 'face_landmark_68_model', 'face_recognition_model']
function faceModels(): Plugin {
  const dir = path.resolve('node_modules/@vladmandic/face-api/model')
  const files = FACE_MODELS.flatMap((m) => [`${m}-weights_manifest.json`, `${m}.bin`])
  return {
    name: 'autoclip-face-models',
    configureServer(server) {
      server.middlewares.use('/models/face', (req, res, next) => {
        const file = files.find((f) => req.url === `/${f}`)
        if (!file) return next()
        res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'application/octet-stream')
        res.end(readFileSync(path.join(dir, file)))
      })
    },
    generateBundle() {
      for (const file of files) this.emitFile({ type: 'asset', fileName: `models/face/${file}`, source: readFileSync(path.join(dir, file)) })
    },
  }
}

// Cutting people out of the frame (for text behind them): MediaPipe's runtime, copied from its package,
// and Google's selfie segmenter (Apache 2.0, 250 KB), kept in models/. Both ship under models/segment/
// so it works offline, like the face models.
const SEGMENT_FILES: Record<string, string> = {
  'vision_wasm_internal.js': 'node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js',
  'vision_wasm_internal.wasm': 'node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm',
  'selfie_segmenter.tflite': 'models/selfie_segmenter.tflite',
}
function segmentModels(): Plugin {
  const types: Record<string, string> = { js: 'text/javascript', wasm: 'application/wasm', tflite: 'application/octet-stream' }
  return {
    name: 'autoclip-segment-models',
    configureServer(server) {
      server.middlewares.use('/models/segment', (req, res, next) => {
        const name = req.url?.slice(1).split('?')[0] ?? ''
        const file = SEGMENT_FILES[name]
        if (!file) return next()
        res.setHeader('Content-Type', types[name.split('.').pop()!])
        res.end(readFileSync(path.resolve(file)))
      })
    },
    generateBundle() {
      for (const [name, file] of Object.entries(SEGMENT_FILES))
        this.emitFile({ type: 'asset', fileName: `models/segment/${name}`, source: readFileSync(path.resolve(file)) })
    },
  }
}

// The same build serves three places: the web (root), GitHub Pages (a sub-path, via BASE_PATH) and the
// Electron desktop app (`--mode desktop`), which has no use for a service worker.
export default defineConfig(({ mode }) => ({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    faceModels(),
    segmentModels(),
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
        globIgnores: ['**/ml.worker-*.js', '**/tts.worker-*.js', '**/faces.worker-*.js', '**/models/face/**', '**/models/segment/**'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /(ml|tts)\.worker-.*\.js$/,
            handler: 'CacheFirst',
            options: { cacheName: 'model-workers', expiration: { maxEntries: 6 } },
          },
          {
            urlPattern: /(faces\.worker-.*\.js|models\/(face|segment)\/.*)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'face-models', expiration: { maxEntries: 10 } },
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
