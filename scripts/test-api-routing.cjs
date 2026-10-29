const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync(require.resolve("../next.config.ts"), "utf8");
assert.match(source, /beforeFiles:\s*\[\{\s*source:\s*["']\/api\/:path\*["']/);
assert.match(source, /destination:\s*`\$\{operationalOrigin\}\/api\/:path\*`/);
assert.doesNotMatch(source, /return\s+\[\{\s*source:\s*["']\/api\/:path\*["']/);

console.log("PASS: Vercel API proxy runs before local API routes");
