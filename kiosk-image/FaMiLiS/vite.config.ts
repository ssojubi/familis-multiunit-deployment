import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'

const useHttps = process.env.USE_HTTPS === 'true'
const keyFile = process.env.SSL_KEY_FILE || '../certs/key.pem'
const certFile = process.env.SSL_CERT_FILE || '../certs/cert.pem'
const localApiTarget = useHttps ? 'https://localhost:8080' : 'http://localhost:8080'
const centralTarget = process.env.CENTRAL_SERVER_URL || 'http://localhost:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    https: useHttps
      ? {
          key: fs.readFileSync(keyFile),
          cert: fs.readFileSync(certFile),
        }
      : undefined,
    proxy: {
      '/api': {
        target: localApiTarget,
        changeOrigin: true,
        secure: false,
      },
      '/config': {
        target: localApiTarget,
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: localApiTarget,
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      '/central-api': {
        target: centralTarget,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/central-api/, ''),
      },
      '/central-ws': {
        target: centralTarget,
        changeOrigin: true,
        secure: false,
        ws: true,
        rewrite: (path) => path.replace(/^\/central-ws/, ''),
      },
    },
  },
})
