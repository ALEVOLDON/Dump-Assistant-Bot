const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildPublicMediaUrl,
  buildStoredFileName,
  isMediaStorageConfigured,
  sanitizeExtension
} = require("../src/services/mediaStorage");

describe("sanitizeExtension", () => {
  it("keeps safe extensions from file names", () => {
    assert.equal(sanitizeExtension("clip.MP4", "video"), ".mp4");
    assert.equal(sanitizeExtension("image.PNG", "photo"), ".png");
  });

  it("falls back to media type defaults", () => {
    assert.equal(sanitizeExtension("", "photo"), ".jpg");
    assert.equal(sanitizeExtension("no-extension", "animation"), ".gif");
  });
});

describe("buildStoredFileName", () => {
  it("creates telegram subfolders with extension", () => {
    const stored = buildStoredFileName("photo", "cover.webp");
    assert.match(stored, /^telegram\/\d{4}\/\d{2}\/.+\.webp$/);
  });
});

describe("buildPublicMediaUrl", () => {
  it("joins base url and relative media path", () => {
    const url = buildPublicMediaUrl(
      { mediaPublicBaseUrl: "https://alevoldon.com/media" },
      "telegram/2026/06/file.jpg"
    );
    assert.equal(url, "https://alevoldon.com/media/telegram/2026/06/file.jpg");
  });
});

describe("isMediaStorageConfigured", () => {
  it("requires storage dir and public base url", () => {
    assert.equal(isMediaStorageConfigured({
      mediaStorageDir: "/tmp/media",
      mediaPublicBaseUrl: "https://alevoldon.com/media"
    }), true);
    assert.equal(isMediaStorageConfigured({
      mediaStorageDir: "",
      mediaPublicBaseUrl: "https://alevoldon.com/media"
    }), false);
  });
});