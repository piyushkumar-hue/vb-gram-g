
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],

  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'leaflet',
              test: /node_modules[\\/](leaflet|react-leaflet|@react-leaflet)[\\/]/,
              priority: 30,
            },
            {
              name: 'recharts',
              test: /node_modules[\\/](recharts|victory-vendor|d3-[^\\/]+)[\\/]/,
              priority: 20,
            },
            {
              name: 'vendor',
              test: /node_modules[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },

  server: {
    host: 'localhost',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
