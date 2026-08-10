const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseDecisionJson } = require("../src/llm/parseDecision");
const { applyForceReply } = require("../src/llm/llm");

describe("parseDecisionJson", () => {
  it("parses valid json", () => {
    const parsed = parseDecisionJson('{"should_reply":true,"reply_text":"ok"}');
    assert.equal(parsed.should_reply, true);
    assert.equal(parsed.reply_text, "ok");
  });

  it("unescapes literal \\n sequences into actual newline characters", () => {
    const jsonStr = JSON.stringify({
      should_reply: true,
      reply_text: "Line 1\\n\\nLine 2\\nSource:\\nhttps://x.com",
      reason: "Reason\\nLine"
    });
    const parsed = parseDecisionJson(jsonStr);
    assert.equal(parsed.reply_text, "Line 1\n\nLine 2\nSource:\nhttps://x.com");
    assert.equal(parsed.reason, "Reason\nLine");
  });

  it("strips markdown codeblock wrappers", () => {
    const content = "```json\n{\"should_reply\":true,\"reply_text\":\"Hello\"}\n```";
    const parsed = parseDecisionJson(content);
    assert.equal(parsed.should_reply, true);
    assert.equal(parsed.reply_text, "Hello");
  });

  it("returns safe fallback for invalid json", () => {
    const parsed = parseDecisionJson("not json");
    assert.deepEqual(parsed, {
      should_reply: false,
      reason: "invalid_json",
      reply_text: "",
      risk: "low"
    });
  });
});

describe("applyForceReply", () => {
  it("overrides should_reply when forceReply is true", () => {
    const result = applyForceReply(
      { should_reply: false, reply_text: "", reason: "no" },
      true
    );
    assert.equal(result.should_reply, true);
  });

  it("keeps result when forceReply is false", () => {
    const result = applyForceReply(
      { should_reply: false, reply_text: "", reason: "no" },
      false
    );
    assert.equal(result.should_reply, false);
  });
});