import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const API = "http://localhost:4300";

export default defineConfig({
  define: {
    // Busts the offline query cache when a new build ships.
    __APP_VERSION__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    VitePWA({
      // The manifest is hand-written in public/manifest.webmanifest.
      manifest: false,
      // Registered from src/lib/pwa.ts so the app can offer "Reload to update".
      injectRegister: false,
      registerType: "prompt",
      includeAssets: [
        "favicon.svg",
        "apple-touch-icon.png",
        "manifest.webmanifest",
      ],
      workbox: {
        // The whole app shell is precached, so it opens with no connection.
        globPatterns: ["**/*.{js,css,html,svg,png,webp,woff2,webmanifest}"],
        globIgnores: ["images/**"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/s\//],
        cleanupOutdatedCaches: true,
        // API data is kept offline by the app (IndexedDB), not the worker.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && url.pathname.startsWith("/images/"),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "images", expiration: { maxEntries: 30 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@api": fileURLToPath(new URL("../api/src", import.meta.url)),
      $: fileURLToPath(new URL("../api/src", import.meta.url)),
    },
  },
  server: {
    proxy: {
      "/api": { target: API, changeOrigin: true },
    },
  },
});
