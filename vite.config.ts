import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base matches the GitHub Pages project path: usace-wrises.github.io/resst-dev/
export default defineConfig({
  base: "/resst-dev/",
  // Another session may hold 5173; the launcher injects PORT when it picks a free one.
  server: { port: Number(process.env.PORT) || 5173 },
  plugins: [react()],
  build: { outDir: "dist", sourcemap: true },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The report embeds report.css via ?inline; without this vitest resolves
    // CSS imports to empty strings and reportHtml.test.ts would go vacuous.
    css: true,
  },
});
