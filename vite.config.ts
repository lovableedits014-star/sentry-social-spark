import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      // Use our custom sw.js directly - no Workbox generation
      strategies: "injectManifest",
      srcDir: "public",
      filename: "sw.js",
      // Don't register automatically - we register manually with our own sw.js
      injectRegister: null,
      manifest: {
        name: "Portal do Apoiador",
        short_name: "Apoiador",
        description: "Portal de engajamento para apoiadores",
        theme_color: "#6366f1",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/pwa-start",
        icons: [
          {
            src: "/favicon.ico",
            sizes: "64x64",
            type: "image/x-icon",
          },
        ],
      },
      injectManifest: {
        globPatterns: [],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

