import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesium')
  },
  server: {
    host: '0.0.0.0',
    port: 3000
  }
});
