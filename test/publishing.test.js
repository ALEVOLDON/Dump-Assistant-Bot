process.env.NODE_ENV = "test";
const { describe, it, mock } = require("node:test");
const assert = require("node:assert/strict");
const { handlePostCommand, generatePostFromLinkContent } = require("../src/publishing");

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
});
