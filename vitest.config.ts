import { defineConfig } from "vitest/config";

// Separate from vite.config.ts so tests don't load the app's plugins (PWA, Tailwind).
export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
});
