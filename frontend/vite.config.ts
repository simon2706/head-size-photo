import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const backend = process.env.BACKEND_URL ?? 'http://127.0.0.1:8000'

// Phones only allow camera access in a secure context, so scripts/dev-mobile.sh serves the dev
// server over HTTPS on the LAN with an mkcert certificate passed in through these variables.
const { HTTPS_CERT, HTTPS_KEY } = process.env
const https = HTTPS_CERT && HTTPS_KEY ? { cert: readFileSync(HTTPS_CERT), key: readFileSync(HTTPS_KEY) } : undefined

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    https,
    // The browser only talks to the Vite origin; /api is forwarded to FastAPI.
    proxy: { '/api': backend },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
