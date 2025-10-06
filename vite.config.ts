import { defineConfig } from "vite";
import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [dyadComponentTagger(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    // Re-adicionando 'date-fns-tz' à exclusão. Isso é uma prática comum para resolver
    // problemas de importação com esta biblioteca em ambientes Vite.
    exclude: ['date-fns-tz'], 
  },
}));