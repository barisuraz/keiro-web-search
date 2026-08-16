// Build the publishable `lib/` layout from `src/`.
//
// The source is plain ESM JavaScript plus hand-written `.d.ts` declarations
// (same shape the shipped `@deepseek-ai/dsh-web-search-deepseek` publishes:
// `lib/index.js` + type declarations). No bundler is needed; this copies the
// source files verbatim so `lib/` is always the exact code npm publishes.
//
// Run via `npm run build`, `prepare`, or `prepack`.
import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const srcDir = join(root, "src");
const libDir = join(root, "lib");

// Clean rebuild so stale files never ship.
rmSync(libDir, { recursive: true, force: true });
mkdirSync(libDir, { recursive: true });

for (const file of readdirSync(srcDir)) {
  if (file.endsWith(".js") || file.endsWith(".d.ts")) {
    copyFileSync(join(srcDir, file), join(libDir, file));
  }
}

console.log(`built lib/ from src/ (${readdirSync(libDir).length} files)`);
