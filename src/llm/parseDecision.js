function unescapeLiteralNewlines(str) {
  if (!str || typeof str !== "string") return str;
  return str.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}

function parseDecisionJson(content) {
  if (typeof content !== "string") {
    return { should_reply: false, reason: "invalid_json", reply_text: "", risk: "low" };
  }

  let cleaned = content.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed.reply_text === "string") {
      parsed.reply_text = unescapeLiteralNewlines(parsed.reply_text);
    }
    if (parsed && typeof parsed.reason === "string") {
      parsed.reason = unescapeLiteralNewlines(parsed.reason);
    }
    return parsed;
  } catch {
    return { should_reply: false, reason: "invalid_json", reply_text: "", risk: "low" };
  }
}

module.exports = { parseDecisionJson };