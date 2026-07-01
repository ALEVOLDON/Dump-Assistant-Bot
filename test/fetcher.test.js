const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { extractUrls, isSafeUrl, stripHtml, extractOgImage, fetchUrlMetadata } = require("../src/fetcher");

describe("extractUrls", () => {
  it("extracts unique http(s) links", () => {
    const text = "Смотри https://example.com/a и http://test.org/page";
    assert.deepEqual(extractUrls(text), [
      "https://example.com/a",
      "http://test.org/page"
    ]);
  });

  it("limits to three urls", () => {
    const text = [
      "https://a.com/1",
      "https://b.com/2",
      "https://c.com/3",
      "https://d.com/4"
    ].join(" ");
    assert.equal(extractUrls(text).length, 3);
  });
});

describe("isSafeUrl", () => {
  it("blocks localhost and private networks", () => {
    assert.equal(isSafeUrl("http://localhost/admin"), false);
    assert.equal(isSafeUrl("http://127.0.0.1/"), false);
    assert.equal(isSafeUrl("http://192.168.1.1/"), false);
    assert.equal(isSafeUrl("file:///etc/passwd"), false);
  });

  it("allows public https urls", () => {
    assert.equal(isSafeUrl("https://example.com/article"), true);
  });
});

describe("stripHtml", () => {
  it("extracts title and description metadata", () => {
    const html = `
      <html>
        <head>
          <title>Test Page</title>
          <meta name="description" content="Short summary" />
        </head>
        <body><p>Hello world</p></body>
      </html>
    `;
    const text = stripHtml(html);
    assert.match(text, /ЗАГОЛОВОК: Test Page/);
    assert.match(text, /ОПИСАНИЕ: Short summary/);
    assert.match(text, /Hello world/);
  });
});

describe("extractOgImage", () => {
  it("extracts og:image", () => {
    const html = `<html><head><meta property="og:image" content="https://example.com/cover.jpg" /></head></html>`;
    assert.equal(extractOgImage(html), "https://example.com/cover.jpg");
  });

  it("extracts twitter:image as fallback", () => {
    const html = `<html><head><meta name="twitter:image" content="https://example.com/tw-cover.png" /></head></html>`;
    assert.equal(extractOgImage(html), "https://example.com/tw-cover.png");
  });

  it("decodes HTML entities in og:image content", () => {
    const html = `<html><head><meta property="og:image" content="https://example.com/cover?a=1&amp;b=2" /></head></html>`;
    assert.equal(extractOgImage(html), "https://example.com/cover?a=1&b=2");
  });

  it("returns null if no image meta tags", () => {
    const html = `<html><head><title>No Image</title></head></html>`;
    assert.equal(extractOgImage(html), null);
  });

  it("extracts og:image with single quotes and name attribute", () => {
    const html = `<html><head><meta name='og:image' content='https://example.com/cover2.jpg' /></head></html>`;
    assert.equal(extractOgImage(html), "https://example.com/cover2.jpg");
  });

  it("extracts og:image when content attribute comes before property attribute", () => {
    const html = `<html><head><meta content="https://example.com/cover3.jpg" property="og:image" /></head></html>`;
    assert.equal(extractOgImage(html), "https://example.com/cover3.jpg");
  });

  it("extracts twitter:image:src", () => {
    const html = `<html><head><meta name="twitter:image:src" content="https://example.com/cover4.jpg" /></head></html>`;
    assert.equal(extractOgImage(html), "https://example.com/cover4.jpg");
  });

  it("extracts og:image with spaces around equals and unquoted attributes", () => {
    const html = `<html><head><meta property = og:image content = https://example.com/cover5.jpg ></head></html>`;
    assert.equal(extractOgImage(html), "https://example.com/cover5.jpg");
  });

  it("extracts og:image when meta tag has multiple extra attributes", () => {
    const html = `<html><head><meta class="meta-tag" property="og:image" data-test="123" content="https://example.com/cover6.jpg" /></head></html>`;
    assert.equal(extractOgImage(html), "https://example.com/cover6.jpg");
  });
});