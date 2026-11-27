import { defineConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import netlify from '@netlify/vite-plugin-tanstack-start'

export default defineConfig(({ mode }) => ({
  resolve: { tsconfigPaths: true },
  plugins: [
    mode === 'cloudflare' ? cloudflare({ viteEnvironment: { name: 'ssr' } }) : netlify(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
}))
