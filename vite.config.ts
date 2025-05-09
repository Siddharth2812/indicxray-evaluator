import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      // Proxy all /api requests to the Django backend
      '/api': {
        target: 'https://medical-backend-1056714537361.us-central1.run.app',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, 'api')
      }
    }
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify(mode === 'development' ? '/api' : 'https://medical-backend-1056714537361.us-central1.run.app/api')
  }
}));
