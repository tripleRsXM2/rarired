import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Ensure JSX uses the automatic runtime (React 17+ style). Without this,
  // vitest's esbuild transform falls back to classic runtime which expects
  // `React` to be in scope, and our components don't import React.
  esbuild: { jsx: "automatic" },
  // Dummy Vite env — the supabase client is instantiated at module load
  // and throws if URL/anon key are missing. Tests never hit the network.
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("http://localhost:54321"),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("test-anon-key"),
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.js"],
    include: ["src/**/*.{test,spec}.{js,jsx}"],
    testTimeout: 8000,
  },
});
