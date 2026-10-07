import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(() => {
  return {
    build: { outDir: "build" },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.ico", "logo192.png", "logo512.png"],
        manifest: {
          name: "Herofolio",
          short_name: "Herofolio",
          start_url: "/",
          scope: "/",
          display: "standalone",
          theme_color: "#000000",
          background_color: "#ffffff",
          icons: [
            {
              src: "logo192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "logo512.png",
              sizes: "512x512",
              type: "image/png",
            },
          ],
        },
      }),
    ],
    server: {
      port: 3000,
      // The API runs separately on 4002 in development (npm run start:server).
      proxy: { "/api": "http://localhost:4002" },
    },
  };
});
