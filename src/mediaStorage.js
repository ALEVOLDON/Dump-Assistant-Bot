const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { logger } = require("./logger");
const { deployWebsiteFile } = require("./siteDeploy");

const EXTENSION_BY_MEDIA_TYPE = {
  photo: ".jpg",
  video: ".mp4",
  animation: ".gif",
  document: ".bin"
};

function isMediaStorageConfigured(config) {
  return Boolean(config.mediaStorageDir && config.mediaPublicBaseUrl);
}

function sanitizeExtension(fileName, mediaType) {
  const fromName = path.extname(fileName || "").toLowerCase();
  if (/^\.[a-z0-9]{1,8}$/.test(fromName)) {
    return fromName;
  }
  return EXTENSION_BY_MEDIA_TYPE[mediaType] || ".bin";
}

function buildStoredFileName(mediaType, fileName) {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const suffix = crypto.randomBytes(4).toString("hex");
  const ext = sanitizeExtension(fileName, mediaType);
  return path.posix.join("telegram", year, month, `${stamp}-${suffix}${ext}`);
}

function buildPublicMediaUrl(config, storedRelativePath) {
  const base = config.mediaPublicBaseUrl.replace(/\/$/, "");
  const normalized = String(storedRelativePath).replace(/\\/g, "/").replace(/^\/+/, "");
  return `${base}/${normalized}`;
}

async function downloadTelegramFile(bot, config, mediaFileId) {
  const file = await bot.api.getFile(mediaFileId);
  const downloadUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;
  const downloadResponse = await fetch(downloadUrl);
  if (!downloadResponse.ok) {
    throw new Error(`Failed to download file from Telegram: ${downloadResponse.statusText}`);
  }
  const arrayBuffer = await downloadResponse.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function saveMediaBuffer(config, buffer, mediaType, fileName) {
  const relativePath = buildStoredFileName(mediaType, fileName);
  const absolutePath = path.join(config.mediaStorageDir, relativePath);
  await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.promises.writeFile(absolutePath, buffer);
  return { absolutePath, relativePath };
}

async function hostMediaForPost(bot, config, { mediaFileId, mediaType, fileName }) {
  if (!isMediaStorageConfigured(config)) {
    throw new Error("Media storage is not configured (MEDIA_STORAGE_DIR / MEDIA_PUBLIC_BASE_URL)");
  }

  const buffer = await downloadTelegramFile(bot, config, mediaFileId);
  const { absolutePath, relativePath } = await saveMediaBuffer(config, buffer, mediaType, fileName);
  const publicUrl = buildPublicMediaUrl(config, relativePath);

  logger.info(`[Media] Saved ${mediaType} to ${absolutePath}`);

  if (config.mediaAutoDeploy && config.websiteRepoPath) {
    await deployWebsiteFile(config, absolutePath);
  }

  return { publicUrl, relativePath, absolutePath };
}

module.exports = {
  isMediaStorageConfigured,
  sanitizeExtension,
  buildStoredFileName,
  buildPublicMediaUrl,
  hostMediaForPost
};