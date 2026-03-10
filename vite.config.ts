import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const configuredHmrPort = Number(process.env.VITE_HMR_PORT || '');
  const useConfiguredHmrPort = Number.isInteger(configuredHmrPort) && configuredHmrPort > 0;
  const resolvedHmrPort = useConfiguredHmrPort ? configuredHmrPort : 24700;

  const hmr = {
    port: resolvedHmrPort,
    clientPort: resolvedHmrPort,
    overlay: process.env.DISABLE_HMR !== 'true',
  };

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.npm_package_version || '1.0.0'),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr,
    },
    build: {
      // Optimize for production
      target: 'es2020',
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: mode === 'production',
          drop_debugger: mode === 'production',
        },
      },
      rollupOptions: {
        output: {
          manualChunks: {
            // Split vendor chunks for better caching
            'react-vendor': ['react', 'react-dom'],
            'chart-vendor': ['recharts'],
            'ui-vendor': ['lucide-react', 'motion'],
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
  };
});
