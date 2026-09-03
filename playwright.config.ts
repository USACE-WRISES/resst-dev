import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:4173/resst-dev/",
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    // Test against the production build, served the way Pages serves it.
    command: "npm run build:data && npx vite build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173/resst-dev/",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
