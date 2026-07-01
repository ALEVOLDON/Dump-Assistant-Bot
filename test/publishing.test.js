process.env.NODE_ENV = "test";
const { describe, it, mock } = require("node:test");
const assert = require("node:assert/strict");
const { handlePostCommand, generatePostFromLinkContent, publishToChannel } = require("../src/publishing");

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

  it("publishes long post with sourceUrl using sendMessage and link_preview_options", async () => {
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
      { ogImage: "https://example.com/cover.jpg" },
      "https://example.com/article"
    );

    assert.equal(postLink, "https://t.me/mychannel/456");
    assert.equal(mockBot.api.sendMessage.mock.callCount(), 1);
    
    const calls = mockBot.api.sendMessage.mock.calls[0];
    assert.equal(calls.arguments[0], "-1001234567");
    assert.match(calls.arguments[1], /href="https:\/\/example\.com\/article"/);
    assert.deepEqual(calls.arguments[2].link_preview_options, {
      is_disabled: false,
      url: "https://example.com/article",
      prefer_large_media: true,
      show_above_text: true
    });
  });
});

