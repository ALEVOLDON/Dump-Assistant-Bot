process.env.NODE_ENV = "test";
const { describe, it, mock } = require("node:test");
const assert = require("node:assert/strict");
const { handlePostCommand, generatePostFromLinkContent, publishToChannel, truncateHtmlSafely } = require("../src/services/publishing");

describe("Publishing Commands and LLM Formatting", () => {
  it("distinguishes regular post commands from postlink", async () => {
    // Mock bot, ctx, config
    const mockCtx = {
      reply: mock.fn(() => Promise.resolve()),
      message: { text: "/postlink https://example.com" }
    };
    const mockBot = {};
    const mockConfig = { channelChatId: "@channel" };

    // Since we ignore /postlink in handlePostCommand, it should return false
    const handled = await handlePostCommand(mockCtx, mockBot, mockConfig, mockCtx.message);
    assert.equal(handled, false);
    assert.equal(mockCtx.reply.mock.callCount(), 0);
  });

  it("handles empty post text correctly", async () => {
    const mockCtx = {
      reply: mock.fn(() => Promise.resolve()),
      message: { text: "/post" }
    };
    const mockBot = {};
    const mockConfig = { channelChatId: "@channel" };

    const handled = await handlePostCommand(mockCtx, mockBot, mockConfig, mockCtx.message);
    assert.equal(handled, true);
    assert.equal(mockCtx.reply.mock.callCount(), 1);
    assert.match(mockCtx.reply.mock.calls[0].arguments[0], /Текст поста пуст/);
  });

  it("generates post content using gemini provider with mocked fetch", async () => {
    const originalFetch = globalThis.fetch;
    
    // Mock fetch response for Gemini API
    globalThis.fetch = mock.fn(async (url, options) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      should_reply: true,
                      reply_text: "# 🚀 Test Post from Link\n\nThis is generated text.\n\n#test #tags",
                      reason: "success"
                    })
                  }
                ]
              }
            }
          ]
        })
      };
    });

    const mockConfig = {
      llmProvider: "gemini",
      geminiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
      geminiModel: "gemini-2.5-flash",
      geminiApiKey: "fake-key",
      llmTimeoutMs: 5000
    };

    try {
      const generated = await generatePostFromLinkContent(mockConfig, "https://example.com/mock", "Mock link page content");
      assert.equal(generated, "# 🚀 Test Post from Link\n\nThis is generated text.\n\n#test #tags");
      assert.equal(globalThis.fetch.mock.callCount(), 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("publishes with customMedia ogImage when present", async () => {
    const mockBot = {
      api: {
        sendPhoto: mock.fn(() => Promise.resolve({
          message_id: 123,
          chat: { id: -1001234567, username: "mychannel" }
        }))
      }
    };

    const mockConfig = {
      channelChatId: "-1001234567"
    };

    const { result, postLink } = await publishToChannel(
      mockBot,
      mockConfig,
      "Post content",
      null,
      { ogImage: "https://example.com/cover.jpg" }
    );

    assert.equal(postLink, "https://t.me/mychannel/123");
    assert.equal(mockBot.api.sendPhoto.mock.callCount(), 1);
    
    const calls = mockBot.api.sendPhoto.mock.calls[0];
    assert.equal(calls.arguments[0], "-1001234567");
    assert.equal(calls.arguments[1], "https://example.com/cover.jpg");
    assert.match(calls.arguments[2].caption, /Post content/);
  });

  it("publishes post with sourceUrl using sendMessage and link_preview_options when no ogImage is available", async () => {
    const mockBot = {
      api: {
        sendMessage: mock.fn(() => Promise.resolve({
          message_id: 456,
          chat: { id: -1001234567, username: "mychannel" }
        }))
      }
    };

    const mockConfig = {
      channelChatId: "-1001234567"
    };

    const longText = "a".repeat(1050);
    const { result, postLink } = await publishToChannel(
      mockBot,
      mockConfig,
      longText,
      null,
      null,
      "https://example.com/article"
    );

    assert.equal(postLink, "https://t.me/mychannel/456");
    assert.equal(mockBot.api.sendMessage.mock.callCount(), 1);
    
    const calls = mockBot.api.sendMessage.mock.calls[0];
    assert.equal(calls.arguments[0], "-1001234567");
    assert.match(calls.arguments[1], /href="https:\/\/example\.com\/article"/);
    assert.deepEqual(calls.arguments[2].link_preview_options, {
      is_disabled: false,
      prefer_large_media: true,
      show_above_text: true
    });
  });

  it("publishes YouTube link with native interactive video player when crawler succeeds", async () => {
    const mockBot = {
      api: {
        sendMessage: mock.fn(() => Promise.resolve({
          message_id: 789,
          chat: { id: -1001234567, username: "mychannel" },
          link_preview_options: {
            url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
          }
        })),
        sendPhoto: mock.fn(() => Promise.resolve({}))
      }
    };

    const mockConfig = {
      channelChatId: "-1001234567"
    };

    const shortPost = "Short post about video\n\n🔗 <a href=\"https://youtu.be/dQw4w9WgXcQ\">Источник</a>";
    const { result, postLink, mediaTypeSent } = await publishToChannel(
      mockBot,
      mockConfig,
      shortPost,
      null,
      { ogImage: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" },
      "https://youtu.be/dQw4w9WgXcQ"
    );

    assert.equal(postLink, "https://t.me/mychannel/789");
    assert.equal(mockBot.api.sendMessage.mock.callCount(), 1, "Should attempt sendMessage for interactive player");
    assert.equal(mockBot.api.sendPhoto.mock.callCount(), 0, "Should NOT call sendPhoto when player succeeds");
    assert.equal(mediaTypeSent, "video_player");

    const calls = mockBot.api.sendMessage.mock.calls[0];
    assert.equal(calls.arguments[0], "-1001234567");
    assert.deepEqual(calls.arguments[2].link_preview_options, {
      is_disabled: false,
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      prefer_large_media: true,
      show_above_text: true
    });
  });

  it("falls back to sendPhoto with video thumbnail when Telegram crawler fails or throws 429", async () => {
    const mockBot = {
      api: {
        sendMessage: mock.fn(() => Promise.reject(new Error("429: Too Many Requests: retry after 8"))),
        sendPhoto: mock.fn(() => Promise.resolve({
          message_id: 790,
          chat: { id: -1001234567, username: "mychannel" }
        }))
      }
    };

    const mockConfig = {
      channelChatId: "-1001234567"
    };

    const shortPost = "Short post about video\n\n🔗 <a href=\"https://youtu.be/uizaxuzgEAk\">Источник</a>";
    const { result, postLink, mediaTypeSent } = await publishToChannel(
      mockBot,
      mockConfig,
      shortPost,
      null,
      { ogImage: "https://i.ytimg.com/vi/uizaxuzgEAk/hqdefault.jpg" },
      "https://youtu.be/uizaxuzgEAk"
    );

    assert.equal(postLink, "https://t.me/mychannel/790");
    assert.equal(mockBot.api.sendMessage.mock.callCount(), 1);
    assert.equal(mockBot.api.sendPhoto.mock.callCount(), 1, "Should fall back to sendPhoto when sendMessage throws 429");
    assert.equal(mediaTypeSent, "photo");

    const photoCalls = mockBot.api.sendPhoto.mock.calls[0];
    assert.equal(photoCalls.arguments[0], "-1001234567");
    assert.equal(photoCalls.arguments[1], "https://i.ytimg.com/vi/uizaxuzgEAk/hqdefault.jpg");
  });

  it("falls back to sendPhoto with video thumbnail when Telegram returns empty link preview", async () => {
    const mockBot = {
      api: {
        sendMessage: mock.fn(() => Promise.resolve({
          message_id: 791,
          chat: { id: -1001234567, username: "mychannel" },
          link_preview_options: {}
        })),
        deleteMessage: mock.fn(() => Promise.resolve(true)),
        sendPhoto: mock.fn(() => Promise.resolve({
          message_id: 792,
          chat: { id: -1001234567, username: "mychannel" }
        }))
      }
    };

    const mockConfig = {
      channelChatId: "-1001234567"
    };

    const shortPost = "Short post about video\n\n🔗 <a href=\"https://youtu.be/7ZqwcaRX-c0\">Источник</a>";
    const { result, postLink, mediaTypeSent } = await publishToChannel(
      mockBot,
      mockConfig,
      shortPost,
      null,
      null,
      "https://youtu.be/7ZqwcaRX-c0"
    );

    assert.equal(postLink, "https://t.me/mychannel/792");
    assert.equal(mockBot.api.sendMessage.mock.callCount(), 1);
    assert.equal(mockBot.api.deleteMessage.mock.callCount(), 1, "Should delete empty text message");
    assert.equal(mockBot.api.sendPhoto.mock.callCount(), 1, "Should fall back to sendPhoto");
    assert.equal(mediaTypeSent, "photo");

    const photoCalls = mockBot.api.sendPhoto.mock.calls[0];
    assert.equal(photoCalls.arguments[0], "-1001234567");
    assert.equal(photoCalls.arguments[1], "https://i.ytimg.com/vi/7ZqwcaRX-c0/hqdefault.jpg");
  });

  it("truncates long HTML caption safely within 1024 chars preserving tags and footer", () => {
    const rawHtml = "<b>🚀 Title</b>\n\n" + "This is a long sentence with <i>nested tags</i> and <code>code</code>. ".repeat(25) + "\n\n🔗 <a href=\"https://youtu.be/123\">Источник</a>\n\n#AI #Tech";
    assert.ok(rawHtml.length > 1024, `rawHtml should be > 1024, got ${rawHtml.length}`);

    const truncated = truncateHtmlSafely(rawHtml, 1024);
    assert.ok(truncated.length <= 1024, `truncated must be <= 1024, got ${truncated.length}`);
    assert.ok(truncated.includes("<b>🚀 Title</b>"), "must preserve title");
    assert.ok(truncated.includes("🔗 <a href=\"https://youtu.be/123\">Источник</a>"), "must preserve source link");
    assert.ok(truncated.includes("#AI #Tech"), "must preserve hashtags");

    // Check that tags are balanced (no dangling open tags)
    const openB = (truncated.match(/<b>/g) || []).length;
    const closeB = (truncated.match(/<\/b>/g) || []).length;
    assert.equal(openB, closeB, "<b> tags must be balanced");

    const openI = (truncated.match(/<i>/g) || []).length;
    const closeI = (truncated.match(/<\/i>/g) || []).length;
    assert.equal(openI, closeI, "<i> tags must be balanced");

    const openCode = (truncated.match(/<code>/g) || []).length;
    const closeCode = (truncated.match(/<\/code>/g) || []).length;
    assert.equal(openCode, closeCode, "<code> tags must be balanced");
  });

  it("accurately updates usage metrics and schedules state write when state is provided", async () => {
    const originalFetch = globalThis.fetch;
    const { reformatPostWithLlm } = require("../src/services/publishing");

    globalThis.fetch = mock.fn(async (url, options) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      should_reply: true,
                      reply_text: "# 🚀 Formatted Draft",
                      reason: "formatted"
                    })
                  }
                ]
              }
            }
          ],
          usageMetadata: {
            promptTokenCount: 150,
            candidatesTokenCount: 50,
            totalTokenCount: 200
          }
        })
      };
    });

    const mockConfig = {
      llmProvider: "gemini",
      geminiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
      geminiModel: "gemini-2.5-flash",
      geminiApiKey: "fake-key",
      llmTimeoutMs: 5000,
      statePath: "test/temp-state.json"
    };

    const mockState = {
      usage: {
        requests: 791,
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500
      }
    };

    try {
      const result = await reformatPostWithLlm(mockConfig, "Raw text", mockState);
      assert.equal(result, "# 🚀 Formatted Draft");
      assert.equal(mockState.usage.requests, 792);
      assert.equal(mockState.usage.promptTokens, 1150);
      assert.equal(mockState.usage.completionTokens, 550);
      assert.equal(mockState.usage.totalTokens, 1700);
    } finally {
      globalThis.fetch = originalFetch;
      const fs = require("fs");
      if (fs.existsSync("test/temp-state.json")) {
        fs.unlinkSync("test/temp-state.json");
      }
    }
  });

  it("handles /article command correctly with empty text check", async () => {
    const { handleArticleCommand } = require("../src/services/publishing");
    const mockCtx = {
      reply: mock.fn(() => Promise.resolve()),
      message: { text: "/article" }
    };
    const mockBot = {};
    const mockConfig = { channelChatId: "@channel" };

    const handled = await handleArticleCommand(mockCtx, mockBot, mockConfig, mockCtx.message);
    assert.equal(handled, true);
    assert.equal(mockCtx.reply.mock.callCount(), 1);
    assert.match(mockCtx.reply.mock.calls[0].arguments[0], /Текст статьи пуст/);
  });

  it("creates and publishes article generating AI cover without scoping errors", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async (url, options) => {
      if (url.includes("/createPage")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            result: {
              path: "Test-Article-123",
              url: "https://telegra.ph/Test-Article-123",
              title: "Test Article"
            }
          })
        };
      }
      return {
        ok: true,
        headers: new Headers({ "content-type": "image/jpeg" }),
        arrayBuffer: async () => Buffer.alloc(2000)
      };
    });

    const mockBot = {
      api: {
        sendPhoto: mock.fn(() => Promise.resolve({
          message_id: 789,
          chat: { id: -1001234567, username: "mychannel" }
        })),
        sendMessage: mock.fn(() => Promise.resolve({
          message_id: 790,
          chat: { id: -1001234567, username: "mychannel" }
        }))
      }
    };

    const mockConfig = {
      channelChatId: "-1001234567",
      imageProvider: "flux"
    };

    const mockState = { telegraph_access_token: "test_token" };

    try {
      const { createAndPublishArticle } = require("../src/services/publishing");
      const result = await createAndPublishArticle(
        mockBot,
        mockConfig,
        "# Test Article\n\nArticle body paragraph.\n\n#test",
        {},
        mockState
      );

      assert.equal(result.articleUrl, "https://telegra.ph/Test-Article-123");
      assert.equal(result.postLink, "https://t.me/mychannel/789");
      assert.equal(result.coverGenerated, true);
      assert.equal(result.coverProvider, "pollinations");
      assert.equal(mockBot.api.sendPhoto.mock.callCount(), 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("publishes article without cover if image generation fails without scoping errors", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async (url, options) => {
      if (url.includes("/createPage")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            result: {
              path: "Test-Article-456",
              url: "https://telegra.ph/Test-Article-456",
              title: "Test Article Failed Image"
            }
          })
        };
      }
      return {
        ok: false,
        status: 500,
        statusText: "Internal Server Error"
      };
    });

    const mockBot = {
      api: {
        sendPhoto: mock.fn(() => Promise.resolve({
          message_id: 791,
          chat: { id: -1001234567, username: "mychannel" }
        })),
        sendMessage: mock.fn(() => Promise.resolve({
          message_id: 792,
          chat: { id: -1001234567, username: "mychannel" }
        }))
      }
    };

    const mockConfig = {
      channelChatId: "-1001234567",
      imageProvider: "flux"
    };

    const mockState = { telegraph_access_token: "test_token" };

    try {
      const { createAndPublishArticle } = require("../src/services/publishing");
      const result = await createAndPublishArticle(
        mockBot,
        mockConfig,
        "# Test Article Failed Image\n\nArticle body paragraph.\n\n#test",
        {},
        mockState
      );

      assert.equal(result.articleUrl, "https://telegra.ph/Test-Article-456");
      assert.equal(result.postLink, "https://t.me/mychannel/792");
      assert.equal(result.coverGenerated, false);
      assert.equal(result.coverProvider, null);
      assert.equal(mockBot.api.sendMessage.mock.callCount(), 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});


