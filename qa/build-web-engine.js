// Build step: engine/ludo.js (CommonJS) -> web/js/ludo.esm.js (ESM). Single source of truth.
import { readFileSync, writeFileSync } from "fs";
const src = readFileSync("/home/hatch/workspace/ludo-royale/engine/ludo.js", "utf8");
const m = src.match(/module\.exports\s*=\s*\{([\s\S]*?)\};\s*$/);
if (!m) throw new Error("module.exports block not found");

const lines = [];
for (const em of m[1].matchAll(/^\s*([A-Za-z_$][\w$]*)\s*(?::\s*([^,]+))?,?\s*$/gm)) {
  const name = em[1], expr = em[2] && em[2].trim();
  if (!expr || expr === name) {
    lines.push(`export { ${name} };`);
  } else {
    lines.push(`const __exp_${name} = (${expr});`);
    lines.push(`export { __exp_${name} as ${name} };`);
  }
}
const esm = src.slice(0, m.index) + lines.join("\n") + "\n";
writeFileSync("/home/hatch/workspace/ludo-royale/web/js/ludo.esm.js", esm);
console.log("ludo.esm.js written,", lines.length, "export statements");
