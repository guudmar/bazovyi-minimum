import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' lets the same build work on GitHub Pages under any repository name.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, strictPort: false },
});
