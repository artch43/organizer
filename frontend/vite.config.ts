import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * The phone apps don't get the site's security headers (vercel.json), so their copy of index.html
 * carries the same Content-Security-Policy as a <meta> tag. (frame-ancestors only works as a header,
 * and isn't needed inside an app.)
 */
const APP_CSP = [
  "default-src 'self'",
  "script-src 'self' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "media-src 'self' blob: https://*.supabase.co",
  "frame-src https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/** The site's public address (canonical link and share preview). Set VITE_SITE_URL when the domain changes. */
const DEFAULT_SITE_URL = "https://organizerapp.vercel.app";

export default defineConfig(({ mode }) => {
  const siteUrl = (loadEnv(mode, process.cwd(), "VITE_").VITE_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
  return {
    plugins: [
      {
        name: "site-url",
        transformIndexHtml: (html: string) => html.replaceAll("%SITE_URL%", siteUrl),
      },
      {
        name: "app-csp",
        apply: "build",
        transformIndexHtml: (html) =>
          process.env.APP_BUILD === "1"
            ? html.replace(
                '<meta charset="UTF-8" />',
                `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${APP_CSP}" />`,
              )
            : html,
      },
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
          background_color: "#08090A",
          theme_color: "#08090A",
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
    resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
    build: {
      rollupOptions: {
        output: {
          // Heavy libraries in their own files: smaller downloads, and they stay cached across app updates.
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            const has = (...names: string[]) => names.some((n) => id.includes(`/node_modules/${n}`));
            if (has("@codemirror/", "@lezer/", "style-mod", "w3c-keyname", "crelt")) return "vendor-editor";
            if (has("katex")) return "vendor-math";
            if (
              has(
                "radix-ui",
                "@radix-ui/",
                "lucide-react",
                "cmdk",
                "sonner",
                "@floating-ui/",
                "react-remove-scroll",
                "aria-hidden",
              )
            )
              return "vendor-ui";
            if (has("jszip", "marked", "dompurify")) return "vendor-utils";
            if (has("@supabase/")) return "vendor-supabase";
            if (has("react/", "react-dom/", "scheduler")) return "vendor-react";
            if (has("zustand", "immer")) return "vendor-state";
          },
        },
      },
    },
  };
});
