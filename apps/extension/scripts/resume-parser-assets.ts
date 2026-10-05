import { createReadStream, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";

// Fixed local paths also let importScripts and Tesseract's language loader work
// without blob workers, CDN requests, or Vite's hashed sibling filenames.
export function resumeParserAssets(): Plugin {
  const require = createRequire(import.meta.url);
  const pdfRoot = dirname(require.resolve("pdfjs-dist/package.json"));
  const ocrRoot = dirname(require.resolve("tesseract.js/package.json"));
  const coreRoot = dirname(require.resolve("tesseract.js-core/package.json"));
  const languageRoot = dirname(require.resolve("@tesseract.js-data/eng/package.json"));
  const assets = new Map<string, string>([
    ["resume-parser/pdf.worker.mjs", join(pdfRoot, "build/pdf.worker.mjs")],
    ["resume-parser/ocr/worker.min.js", join(ocrRoot, "dist/worker.min.js")],
    // This distribution embeds its WASM; there is no implicit sibling fetch.
    ["resume-parser/ocr/tesseract-core-lstm.wasm.js", join(coreRoot, "tesseract-core-lstm.wasm.js")],
    ["resume-parser/ocr/eng.traineddata.gz", join(languageRoot, "4.0.0_best_int/eng.traineddata.gz")],
  ]);
  for (const folder of ["cmaps", "standard_fonts"]) {
    for (const name of readdirSync(join(pdfRoot, folder))) {
      assets.set(`resume-parser/${folder}/${name}`, join(pdfRoot, folder, name));
    }
  }
  return {
    name: "fieldcraft-local-resume-assets",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const key = (request.url || "").split("?")[0].replace(/^\//, "");
        const source = assets.get(key);
        if (!source) return next();
        response.setHeader("Content-Type", key.endsWith(".js") || key.endsWith(".mjs") ? "text/javascript" : "application/octet-stream");
        createReadStream(source).on("error", next).pipe(response);
      });
    },
    generateBundle() {
      for (const [fileName, source] of assets) {
        this.emitFile({ type: "asset", fileName, source: readFileSync(source) });
      }
    },
  };
}
