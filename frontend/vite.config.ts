import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Absolute base: the SPA serves nested routes like /reception/today, so relative asset paths would break.
  base: '/',
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': 'http://localhost:8000' } },
  test: { environment: 'jsdom', globals: true, setupFiles: './src/test-setup.ts' },
});
