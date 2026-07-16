import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./src/manifest";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    sourcemap: false,
    target: "es2022",
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          if (id.includes("/node_modules/@ai-sdk/")) return "ai-providers";
          if (id.includes("/node_modules/ai/")) return "ai-core";
        },
      },
    },
  },
});
