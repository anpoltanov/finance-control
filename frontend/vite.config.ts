import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
    base: "/static/",
    plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Finance Control",
        short_name: "Finance",
        description: "Personal finance tracker",
        theme_color: "#4f46e5",
        background_color: "#f4f6fb",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,ico,png,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /\/api\/v1\//,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 86400 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
  build: {
    outDir: "../backend/static/frontend",
    emptyOutDir: true,
  },
});
