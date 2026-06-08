import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        viteStaticCopy({
            targets: [
                {
                    src: 'node_modules/pdfjs-dist/cmaps/*',
                    dest: 'pdfjs/cmaps',
                },
                {
                    src: 'node_modules/pdfjs-dist/standard_fonts/*',
                    dest: 'pdfjs/standard_fonts',
                },
                {
                    src: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
                    dest: 'pdfjs',
                },
            ],
        }),
        VitePWA({
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw.js',
            registerType: 'autoUpdate',
            injectRegister: false,
            manifest: {
                name: 'Gigatel ERP',
                short_name: 'Gigatel ERP',
                description: 'Gigatel ERP — terenowe zarządzanie zleceniami',
                theme_color: '#0b1220',
                background_color: '#0b1220',
                display: 'standalone',
                orientation: 'any',
                lang: 'pl',
                start_url: '/',
                scope: '/',
                icons: [
                    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                    { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
            },
            injectManifest: {
                globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
                maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
                rollupFormat: 'iife',
            },
            devOptions: {
                enabled: false,
            },
        }),
    ],
    optimizeDeps: {
        exclude: ['pdfjs-dist'],
    },
    server: {
        host: true,
        port: 5173,
        strictPort: true,
        allowedHosts: 'all',
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
    },
    preview: {
        port: 4173,
        strictPort: true,
        proxy: {
            '/api': {
                target: process.env.VITE_API_TARGET || 'http://127.0.0.1:3005',
                changeOrigin: true,
                secure: false,
            }
        }
    }
})
