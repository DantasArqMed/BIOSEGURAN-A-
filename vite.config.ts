import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
        manifest: {
          name: 'BioSegurança ArqMed',
          short_name: 'ArqMed',
          description: 'Sistema de BioSegurança ArqMed',
          theme_color: '#059669',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/login',
          icons: [
            {
              src: 'logo-favicon.png',
              sizes: '72x72',
              type: 'image/png'
            },
            {
              src: 'logo-favicon.png',
              sizes: '96x96',
              type: 'image/png'
            },
            {
              src: 'logo-favicon.png',
              sizes: '128x128',
              type: 'image/png'
            },
            {
              src: 'logo-favicon.png',
              sizes: '144x144',
              type: 'image/png'
            },
            {
              src: 'logo-favicon.png',
              sizes: '152x152',
              type: 'image/png'
            },
            {
              src: 'logo-favicon.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable'
            },
            {
              src: 'logo-favicon.png',
              sizes: '384x384',
              type: 'image/png'
            },
            {
              src: 'logo-favicon.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 // 5MB
        }
      })
    ],
    base: '/',
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
