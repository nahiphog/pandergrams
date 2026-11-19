import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/pandergrams/' : '/',
  plugins: [react()],
  build: {
    rollupOptions: { input: { main: 'index.html', ladder: 'word-ladder.html', pandergrams: 'pandergrams.html' } },
  },
}))
