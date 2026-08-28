import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base matches the GitHub Pages project path: usace-wrises.github.io/resst-dev/
export default defineConfig({
  base: "/resst-dev/",
  plugins: [react()],
  build: { outDir: "dist", sourcemap: true },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
