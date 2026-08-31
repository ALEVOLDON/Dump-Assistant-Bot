process.env.NODE_ENV = "test";
const { describe, it, mock } = require("node:test");
const assert = require("node:assert/strict");
const { buildCoverPrompt, generateCoverImage } = require("../src/services/imageGenerator");
const { extractArticleMetadata, buildArticleAnnouncement } = require("../src/services/publishing");

describe("Image Generator & Article Metadata", () => {
  it("builds a styled cover prompt from title or custom prompt", () => {
    const prompt1 = buildCoverPrompt("Neural network routing architecture", "Test Title");
    assert.match(prompt1, /Neural network routing architecture/);
    assert.match(prompt1, /modern tech editorial illustration/);
    assert.match(prompt1, /16:9/);

    const prompt2 = buildCoverPrompt("", "Autonomous Agents in 2026");
    assert.match(prompt2, /Autonomous Agents in 2026/);
    assert.match(prompt2, /sleek 3D render/);
  });

  it("extracts title, image prompt and hashtags from article markdown", () => {
    const markdown = `# 🚀 Будущее ИИ-агентов
<!-- image_prompt: Futuristic glowing nodes connecting AI models in a neural sphere -->

Это вводная часть статьи о развитии ИИ.

### 🔹 Архитектура
Здесь идет подробное описание архитектуры.

### 🎯 Итоги
Итоги статьи.

#AI #Tech #Agents #LLM`;

    const meta = extractArticleMetadata(markdown);
    assert.equal(meta.title, "Будущее ИИ-агентов");
    assert.equal(meta.imagePrompt, "Futuristic glowing nodes connecting AI models in a neural sphere");
    assert.equal(meta.hashtags, "#AI #Tech #Agents #LLM");
    assert.match(meta.teaser, /Это вводная часть статьи/);
    assert.doesNotMatch(meta.cleanMarkdown, /<!--\s*image_prompt/);
  });

  it("builds channel announcement post including Instant View link and hashtags", () => {
    const meta = {
      title: "Будущее ИИ",
      teaser: "Краткий тизер о технологиях будущего.",
      hashtags: "#AI #Future #Tech"
    };
    const articleUrl = "https://telegra.ph/Budushchee-II-08-31";

    const { post, title } = buildArticleAnnouncement(meta, articleUrl);
    assert.equal(title, "Будущее ИИ");
    assert.match(post, /Будущее ИИ/);
    assert.match(post, /Краткий тизер о технологиях будущего/);
    assert.match(post, /https:\/\/telegra\.ph\/Budushchee-II-08-31/);
    assert.match(post, /#AI #Future #Tech/);
  });

  it("generates cover image buffer with mocked fetch", async () => {
    const originalFetch = globalThis.fetch;
    const fakeImageData = Buffer.alloc(2048, 1);

    globalThis.fetch = mock.fn(async (url, options) => {
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => fakeImageData.buffer
      };
    });

    try {
      const result = await generateCoverImage({ prompt: "Test prompt", title: "Test Title" });
      assert.equal(result.mimeType, "image/jpeg");
      assert.equal(result.fileName, "cover.jpg");
      assert.equal(result.buffer.length, 2048);
      assert.equal(globalThis.fetch.mock.callCount(), 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
