/**
 * Vite emits a single `dist/assets/` for all HTML entrypoints. Electrobun’s
 * `build.copy` map needs a distinct source path per destination, so we mirror
 * `dist/assets` to `dist/indicator-bundled-assets/` before packaging.
 */
import { cpSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const mainDir = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const src = join(mainDir, "dist", "assets");
const dest = join(mainDir, "dist", "indicator-bundled-assets");

if (!existsSync(src)) {
  console.warn(
    "[duplicate-dist-assets-for-indicator] dist/assets missing — skip (run vite build first)",
  );
  process.exit(0);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(join(mainDir, "dist"), { recursive: true });
cpSync(src, dest, { recursive: true });
console.log("[duplicate-dist-assets-for-indicator] dist/assets → dist/indicator-bundled-assets");
