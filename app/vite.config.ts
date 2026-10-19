import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // shadcn/ui and our imports both use the "@/*" convention.
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    // The behavioural tests render React, so they need a DOM. They run
    // offline: Supabase is mocked in each test and never contacted.
    environment: "jsdom",
  },
})
