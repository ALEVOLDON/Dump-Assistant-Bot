process.env.NODE_ENV = "test";
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { markdownToHtml, preprocessExpandableQuotes } = require("../src/services/rich");

describe("Expandable Blockquote & Rich Formatter", () => {
  it("converts **> syntax to <blockquote expandable>", () => {
    const input = "# Заголовок\n\n**>Первая строка цитаты\n**>Вторая строка цитаты\n\nОбычный текст";
    const preprocessed = preprocessExpandableQuotes(input);

    assert.match(preprocessed, /<blockquote expandable>/);
    assert.match(preprocessed, /Первая строка цитаты/);
    assert.match(preprocessed, /Вторая строка цитаты/);
    assert.match(preprocessed, /<\/blockquote>/);
  });

  it("renders [!expandable] markdown blockquote as expandable blockquote in HTML", () => {
    const input = "> [!expandable] Длинный текст скрытого блока";
    const html = markdownToHtml(input, true);

    assert.match(html, /<blockquote expandable>/);
    assert.match(html, /Длинный текст скрытого блока/);
    assert.match(html, /<\/blockquote>/);
  });

  it("renders standard markdown blockquotes normally", () => {
    const input = "> Обычная цитата";
    const html = markdownToHtml(input, true);

    assert.match(html, /<blockquote>/);
    assert.doesNotMatch(html, /<blockquote expandable>/);
    assert.match(html, /Обычная цитата/);
  });
});
