import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const brand = JSON.parse(readFileSync("./brand.json", "utf8"));
const pkg = JSON.parse(readFileSync("./package.json", "utf8"));

/** Fills the app name and colour into index.html from brand.json. */
const brandHtml = (): Plugin => ({
  name: "brand-html",
  transformIndexHtml: (html) => html.replaceAll("__APP_NAME__", brand.name).replaceAll("__THEME_COLOR__", brand.themeColor).replaceAll("__DESCRIPTION__", brand.description),
});

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const path = id.replaceAll("\\", "/");
          if (/\/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run\/router)\//.test(path)) return "framework";
          if (path.includes("/node_modules/@supabase/")) return "supabase";
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    brandHtml(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "privacy.html", "icons/apple-touch-icon.png"],
      manifest: {
        id: "/",
        name: brand.name,
        short_name: brand.shortName,
        description: brand.description,
        lang: "en",
        dir: "ltr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        theme_color: brand.themeColor,
        background_color: brand.backgroundColor,
        categories: ["business", "productivity"],
        prefer_related_applications: false,
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          { name: "New sale", short_name: "Sell", url: "/sales" },
          { name: "Inventory", short_name: "Stock", url: "/inventory" },
        ],
        screenshots: [1, 2, 3, 4].map((n) => ({ src: `screenshots/phone-${n}.png`, sizes: "1080x1920", type: "image/png", form_factor: "narrow" })),
      },
      workbox: {
        // keep store screenshots out of the offline cache: they are for the install prompt, not for using the app
        globIgnores: ["screenshots/**"],
        // the privacy policy and the domain-verification file are real files, not app screens
        navigateFallbackDenylist: [/^\/privacy\.html$/, /^\/\.well-known\//],
      },
    }),
  ],
});
