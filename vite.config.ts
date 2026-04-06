import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const projectDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vite adds `crossorigin` to script/link tags. With Electrobun's `views://`
 * scheme, WKWebView can treat module scripts as opaque / CORS-blocked and
 * render a transparent window with no UI. Strip for production HTML only.
 */
function stripCrossoriginForElectrobunWebview(): Plugin {
  return {
    name: "strip-crossorigin-electrobun-webview",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(/\s+crossorigin(?:="[^"]*")?/gi, "");
    },
  };
}

export default defineConfig({
  plugins: [react(), stripCrossoriginForElectrobunWebview()],
  root: "src/mainview",
  // Relative `./assets/` per HTML so `views/indicator/` loads its mirrored bundle (not root `/assets/`).
  base: "./",
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(projectDir, "src/mainview/index.html"),
        indicator: path.resolve(projectDir, "src/mainview/indicator.html"),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {},
});
