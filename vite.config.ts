import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          // React core — değişmez, tarayıcı cache'ler
          'vendor-react': [
            'react',
            'react-dom',
            'react-router-dom',
          ],
          // Firebase Auth + Core
          'vendor-firebase-core': [
            'firebase/app',
            'firebase/auth',
          ],
          // Firebase Firestore — en büyük parça
          'vendor-firebase-firestore': [
            'firebase/firestore',
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  define: {
    'process.env': {}
  }
})
