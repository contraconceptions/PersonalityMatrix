import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Three entry points: the side panel page, the MV3 service worker and the chat-capture content script
// (the last two get fixed names, which the manifest and chrome.scripting refer to).
// public/manifest.json is copied as-is into dist/.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(import.meta.dirname, "sidepanel.html"),
        background: resolve(import.meta.dirname, "src/background/index.ts"),
        capture: resolve(import.meta.dirname, "src/content/capture.ts"),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "background" || chunk.name === "capture" ? `${chunk.name}.js` : "assets/[name]-[hash].js",
      },
    },
  },
  server: { open: "/sidepanel.html" },
  test: { environment: "node" },
});
