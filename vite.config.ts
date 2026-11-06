/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5178,
    host: '127.0.0.1',
  },
  preview: {
    port: 4178,
    host: '127.0.0.1',
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
  },
});
