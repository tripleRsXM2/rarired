// Separate vitest config for running the SAME component tests inside a
// real Chromium via Playwright. Usage: `npm run test:browser`
//
// Catches real-browser event-order/touch bugs that jsdom can't simulate.

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("http://localhost:54321"),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("test-anon-key"),
  },
  esbuild: { jsx: "automatic" },
  test: {
    globals: true,
    setupFiles: ["./src/test/setup.js"],
    // Only the browser-relevant component tests — unit util tests stay in jsdom.
    include: ["src/features/people/components/Messages.test.jsx"],
    browser: {
      enabled: true,
      provider: "playwright",
      headless: true,
      instances: [{ browser: "chromium" }],
    },
    testTimeout: 20000,
  },
});
