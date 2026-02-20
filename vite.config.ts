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
      registerType: "autoUpdate",
      // Use injectManifest so we control the SW completely
      strategies: "injectManifest",
      srcDir: "public",
      filename: "sw-custom.js",
      injectManifest: {
        // Don't inject any precache manifest - we just want our push handler
        globPatterns: [],
      },
      manifest: {
        name: "Portal do Apoiador",
        short_name: "Apoiador",
        description: "Portal de engajamento para apoiadores",
        theme_color: "#6366f1",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        // Opens PwaStart page which reads clientId from localStorage
        start_url: "/pwa-start",
        icons: [
          {
            src: "/favicon.ico",
            sizes: "64x64",
            type: "image/x-icon",
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
