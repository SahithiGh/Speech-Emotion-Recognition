const fs = require("fs");
const css = fs.readFileSync("frontend/src/styles.css", "utf8");
let depth = 0;
const lines = css.split("\n");
lines.forEach((line, idx) => {
  for (const ch of line) {
    if (ch === "{") depth++;
    if (ch === "}") depth--;
  }
  if (depth < 0) {
    console.log(`Unmatched } at line ${idx + 1}: ${line}`);
    depth = 0;
  }
});
console.log(`Final depth: ${depth}`);

