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
      strategies: "generateSW",
      workbox: {
        // No navigation fallback - prevents "offline copy" error on install
        navigateFallback: null,
        navigateFallbackDenylist: [/^\/~oauth/],
        // No file caching - app always loads fresh from network
        globPatterns: [],
        runtimeCaching: [],
        skipWaiting: true,
        clientsClaim: true,
        // Import our push notification handler
        importScripts: ["/push-handler.js"],
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
        // Opens PwaStart which redirects to /portal/:clientId via localStorage
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
