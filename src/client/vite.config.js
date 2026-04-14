import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'pwa-icon.png'],
      manifest: {
        name: 'AranyaAI Management',
        short_name: 'AranyaAI',
        description: 'Advanced AI Infrastructure Management Portal',
        theme_color: '#2d5f3f',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-icon.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-icon.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
      '/uploads': 'http://localhost:5000',
    }
  },
  build: {
    // Optimization: Manual chunking to split large dependencies
    // This reduces the main chunk size significantly for faster initial loading
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-charts': ['recharts'],
          'vendor-utils': ['axios', 'framer-motion', 'lucide-react'],
          'vendor-markdown': ['react-markdown', 'remark-gfm', 'rehype-raw'],
          'vendor-pdf': ['jspdf', 'jspdf-autotable'],
          'vendor-core': ['react', 'react-dom', 'react-router-dom'],
        }
      }
    },
    chunkSizeWarningLimit: 1000 // Raise warning limit to 1MB from 500KB since we know they are large
  }
})
