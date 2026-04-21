import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    optimizeDeps: {
        exclude: ['pdfjs-dist'],
    },
    server: {
        host: true,
        port: 5173,
        strictPort: true,
        allowedHosts: ['erp.gigatel.org', 'localhost'],
        watch: {
            usePolling: true,
            interval: 300,
        },
        proxy: {
            '/api': {
                target: process.env.VITE_API_TARGET || 'http://127.0.0.1:3005',
                changeOrigin: true,
                secure: false,
            }
        }
    }
})
