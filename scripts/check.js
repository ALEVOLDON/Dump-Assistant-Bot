const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function getJsFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(getJsFiles(file));
    } else if (file.endsWith(".js")) {
      results.push(file);
    }
  });
  return results;
}

try {
  const srcDir = path.join(__dirname, "..", "src");
  const files = getJsFiles(srcDir);
  console.log(`Checking syntax of ${files.length} files in src/...`);
  for (const file of files) {
    execSync(`node --check "${file}"`, { stdio: "inherit" });
  }
  console.log("✓ All syntax checks passed!");
} catch (err) {
  console.error("❌ Syntax check failed:", err.message);
  process.exit(1);
}
