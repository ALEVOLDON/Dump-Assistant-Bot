process.env.NODE_ENV = "test";
const { describe, it, mock } = require("node:test");
const assert = require("node:assert/strict");
const { htmlToTelegraphNodes, getOrCreateTelegraphToken, createTelegraphArticle } = require("../src/services/telegraph");

describe("Telegraph Service & Node Converter", () => {
  it("converts basic HTML into Telegraph Node format", () => {
    const html = "<p>Привет <b>мир</b>! Вот <a href=\"https://example.com\">ссылка</a>.</p>";
    const nodes = htmlToTelegraphNodes(html);

    assert.equal(Array.isArray(nodes), true);
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].tag, "p");

    const children = nodes[0].children;
    assert.equal(children[0], "Привет ");
    assert.equal(children[1].tag, "b");
    assert.equal(children[1].children[0], "мир");
    assert.equal(children[2], "! Вот ");
    assert.equal(children[3].tag, "a");
    assert.equal(children[3].attrs.href, "https://example.com");
  });

  it("maps unsupported heading tags h1/h2 to h3", () => {
    const html = "<h1>Главный заголовок</h1><h2>Подзаголовок</h2><h3>H3</h3>";
    const nodes = htmlToTelegraphNodes(html);

    assert.equal(nodes.length, 3);
    assert.equal(nodes[0].tag, "h3");
    assert.equal(nodes[0].children[0], "Главный заголовок");
    assert.equal(nodes[1].tag, "h3");
    assert.equal(nodes[1].children[0], "Подзаголовок");
    assert.equal(nodes[2].tag, "h3");
    assert.equal(nodes[2].children[0], "H3");
  });

  it("handles code blocks, lists and blockquotes", () => {
    const html = "<blockquote>Цитата</blockquote><pre><code>const x = 10;</code></pre><ul><li>Пункт 1</li><li>Пункт 2</li></ul>";
    const nodes = htmlToTelegraphNodes(html);

    assert.equal(nodes.length, 3);
    assert.equal(nodes[0].tag, "blockquote");
    assert.equal(nodes[0].children[0], "Цитата");

    assert.equal(nodes[1].tag, "pre");
    assert.equal(nodes[1].children[0].tag, "code");

    assert.equal(nodes[2].tag, "ul");
    assert.equal(nodes[2].children.length, 2);
    assert.equal(nodes[2].children[0].tag, "li");
  });

  it("creates Telegraph page using API with mocked fetch", async () => {
    const originalFetch = globalThis.fetch;
    const mockState = { telegraph_access_token: "test_token_123" };
    const mockConfig = { channelUsername: "@testchannel", statePath: "data/state.json" };

    globalThis.fetch = mock.fn(async (url, options) => {
      if (url.includes("/createPage")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            result: {
              path: "Test-Article-08-31",
              url: "https://telegra.ph/Test-Article-08-31",
              title: "Test Article"
            }
          })
        };
      }
      return { ok: false, json: async () => ({ ok: false }) };
    });

    try {
      const result = await createTelegraphArticle({
        title: "Test Article",
        htmlContent: "<p>Тестовый текст статьи</p>",
        config: mockConfig,
        state: mockState
      });

      assert.equal(result.url, "https://telegra.ph/Test-Article-08-31");
      assert.equal(result.title, "Test Article");
      assert.equal(globalThis.fetch.mock.callCount(), 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
