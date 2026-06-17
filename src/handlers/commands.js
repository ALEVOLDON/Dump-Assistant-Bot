const { isOwner } = require("../access");
const { writeState } = require("../state");

function registerCommands(bot, { config, state, posts }) {
  bot.command("status", async (ctx) => {
    if (!isOwner(config, ctx.from.id)) return;
    const u = state.usage;
    await ctx.reply([
      `auto_reply: ${state.autoReplyEnabled ? "on" : "off"}`,
      `provider: ${config.llmProvider}`,
      `model: ${config.activeLlmModel}`,
      `requests: ${u.requests}`,
      `tokens_total: ${u.totalTokens}`,
      `posts_cached: ${Object.keys(posts.cache).length}`
    ].join("\n"));
  });

  bot.command("on", async (ctx) => {
    if (!isOwner(config, ctx.from.id)) return;
    state.autoReplyEnabled = true;
    writeState(config.statePath, state);
    await ctx.reply("Автоответы включены.");
  });

  bot.command("off", async (ctx) => {
    if (!isOwner(config, ctx.from.id)) return;
    state.autoReplyEnabled = false;
    writeState(config.statePath, state);
    await ctx.reply("Автоответы выключены.");
  });

  bot.command("usage", async (ctx) => {
    if (!isOwner(config, ctx.from.id)) return;
    await ctx.reply(JSON.stringify(state.usage, null, 2));
  });

  bot.command("chatid", async (ctx) => {
    if (!isOwner(config, ctx.from.id)) return;
    const threadId = ctx.message?.message_thread_id || 0;
    await ctx.reply([
      `chat_id: ${ctx.chat.id}`,
      `chat_type: ${ctx.chat.type}`,
      `thread_id: ${threadId}`
    ].join("\n"));
  });
}

module.exports = { registerCommands };