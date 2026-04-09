import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        host: true,
        port: 1001,
        https: {
            key: fs.readFileSync(path.resolve(__dirname, '../backend/key.pem')),
            cert: fs.readFileSync(path.resolve(__dirname, '../backend/cert.pem')),
        },
        proxy: {
            '/api': {
                target: 'https://127.0.0.1:1000',
                changeOrigin: true,
                secure: false, // Required for self-signed certificates
            }
        }
    }
})
