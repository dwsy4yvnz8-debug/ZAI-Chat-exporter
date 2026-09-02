// Build script: minifies src/exporter.js with terser and wraps the
// result as a `javascript:...` bookmarklet URL, written to dist/.
//
// Usage:
//   npm install
//   npm run build

const fs = require("fs");
const path = require("path");
const { minify } = require("terser");

const SRC = path.join(__dirname, "..", "src", "exporter.js");
const OUT_DIR = path.join(__dirname, "..", "dist");
const OUT_FILE = path.join(OUT_DIR, "bookmarklet.txt");

async function build() {
  const source = fs.readFileSync(SRC, "utf8");

  const result = await minify(source, {
    compress: true,
    mangle: true,
  });

  if (result.error) {
    console.error("Minification failed:", result.error);
    process.exit(1);
  }

  const bookmarklet = "javascript:" + encodeURIComponent(result.code);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, bookmarklet, "utf8");

  console.log(`Wrote bookmarklet (${bookmarklet.length} chars) to ${OUT_FILE}`);
}

build();
