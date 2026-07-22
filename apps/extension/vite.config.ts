import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./src/manifest";

const packageJson = JSON.parse(readFileSync("./package.json", "utf8")) as {
  version: string;
};

const buildVersion = process.env.BUILD_VERSION || packageJson.version;

export default defineConfig({
  define: {
    __FIELDCRAFT_VERSION__: JSON.stringify(buildVersion),
  },
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
