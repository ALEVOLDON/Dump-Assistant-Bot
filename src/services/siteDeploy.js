const { execSync } = require("child_process");
const path = require("path");
const { logger } = require("../core/logger");

function deployWebsiteFile(config, absoluteFilePath) {
  const repoPath = path.resolve(config.websiteRepoPath);
  const relativePath = path.relative(repoPath, path.resolve(absoluteFilePath)).replace(/\\/g, "/");

  if (!relativePath || relativePath.startsWith("..")) {
    throw new Error("Media file is outside WEBSITE_REPO_PATH");
  }

  logger.info(`[Deploy] Staging ${relativePath} in website repo...`);

  try {
    execSync("git --version", { stdio: "ignore" });
  } catch {
    throw new Error("Git is not available in PATH");
  }

  execSync(`git add "${relativePath}"`, { cwd: repoPath, stdio: "pipe" });

  const status = execSync(`git status --porcelain "${relativePath}"`, {
    cwd: repoPath,
    encoding: "utf8"
  }).trim();

  if (!status) {
    logger.info("[Deploy] Media file already committed, skipping push");
    return { pushed: false };
  }

  execSync('git commit -m "media: add telegram post asset"', {
    cwd: repoPath,
    stdio: "pipe"
  });
  execSync("git push", { cwd: repoPath, stdio: "pipe" });
  logger.info("[Deploy] Media pushed to website repo; Vercel redeploy started");

  return { pushed: true };
}

module.exports = { deployWebsiteFile };