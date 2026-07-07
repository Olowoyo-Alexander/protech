import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // bind all interfaces (IPv4 127.0.0.1 + IPv6) so localhost always resolves
    proxy: {
      // Proxy API + socket to the Express server during development
      '/api': 'http://localhost:5000',
      '/socket.io': { target: 'http://localhost:5000', ws: true },
    },
  },
});
