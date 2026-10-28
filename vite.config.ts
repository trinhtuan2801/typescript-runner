import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// The debugger pauses a Web Worker with Atomics.wait on a SharedArrayBuffer.
// SharedArrayBuffer is only handed out to cross origin isolated pages, which
// means these two headers have to be present on every response.
function crossOriginIsolation(): Plugin {
  const headers = (res: { setHeader: (k: string, v: string) => void }) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  }
  return {
    name: 'cross-origin-isolation',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        headers(res)
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((_req, res, next) => {
        headers(res)
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), crossOriginIsolation()],
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 4000 },
})
