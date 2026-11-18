// Relative paths, so the build runs from any address: GitHub Pages, a
// subfolder, or inside an iframe on the portfolio.
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  publicDir: false,
  server: { port: 5180 },
  build: {
    chunkSizeWarningLimit: 900,
  },
})
