import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'billsplit-icon.svg'],
      manifest: {
        name: 'BillSplit',
        short_name: 'BillSplit',
        description: 'Split restaurant bills in shekels',
        theme_color: '#0c1222',
        background_color: '#0c1222',
        display: 'standalone',
        start_url: '/',
        lang: 'he',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
    }),
  ],
})
