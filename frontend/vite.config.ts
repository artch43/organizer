import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Installable app with offline support: the app shell is cached; data still syncs through Supabase.
    // The phone apps (npm run build:app) carry their files inside the app: no service worker there.
    VitePWA({
      disable: process.env.APP_BUILD === "1",
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Organizer",
        short_name: "Organizer",
        description: "Tarefas, calendário, afazeres, hábitos e anotações num só lugar.",
        lang: "pt-BR",
        start_url: "/",
        display: "standalone",
        background_color: "#1A1B1E",
        theme_color: "#1A1B1E",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/privacidade\.html/],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: {
    rollupOptions: {
      output: {
        // Heavy libraries in their own files: smaller downloads, and they stay cached across app updates.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          const has = (...names: string[]) => names.some((n) => id.includes(`/node_modules/${n}`));
          if (has("@codemirror/", "@lezer/", "style-mod", "w3c-keyname", "crelt")) return "vendor-editor";
          if (has("katex")) return "vendor-math";
          if (has("radix-ui", "@radix-ui/", "lucide-react", "cmdk", "sonner", "@floating-ui/", "react-remove-scroll", "aria-hidden"))
            return "vendor-ui";
          if (has("date-fns", "jszip", "marked", "dompurify", "react-day-picker")) return "vendor-utils";
          if (has("@supabase/")) return "vendor-supabase";
          if (has("react/", "react-dom/", "scheduler")) return "vendor-react";
          if (has("zustand", "immer")) return "vendor-state";
        },
      },
    },
  },
});
