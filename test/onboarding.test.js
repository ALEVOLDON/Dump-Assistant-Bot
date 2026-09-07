const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  registerOnboardingHandlers,
  setPendingContact,
  isPendingContact,
  clearPendingContact,
  shouldSendAudit,
  formatAuditMessage,
  getGuestWelcomeText,
  getGuestAboutText,
  getGuestAskText,
  getGuestContactText,
  getOwnerWelcomeText,
  buildGuestMainKeyboard,
  buildGuestAboutKeyboard,
  buildGuestAskKeyboard,
  buildGuestCancelKeyboard,
  buildOwnerMainKeyboard
} = require("../src/handlers/onboarding");

describe("Onboarding & Guest Flow", () => {
  describe("Text Content & Templates", () => {
    it("builds guest welcome text with channel link", () => {
      const text = getGuestWelcomeText("test_channel");
      assert.ok(text.includes("@test_channel"));
      assert.ok(text.includes("https://t.me/test_channel"));
      assert.ok(text.includes("AI-ассистент"));
    });

    it("builds guest about text with explanation of features", () => {
      const text = getGuestAboutText("test_channel");
      assert.ok(text.includes("Отвечать в комментариях"));
      assert.ok(text.includes("Разбирать ссылки"));
      assert.ok(text.includes("Связывать с автором"));
    });

    it("builds guest ask text guiding to channel comments", () => {
      const text = getGuestAskText("test_channel");
      assert.ok(text.includes("комментариях"));
      assert.ok(text.includes("Написать админу"));
    });

    it("builds guest contact text explaining relay", () => {
      const text = getGuestContactText();
      assert.ok(text.includes("Связь с администратором"));
      assert.ok(text.includes("следующим ответом"));
    });

    it("builds owner welcome text with command list", () => {
      const text = getOwnerWelcomeText(
        { llmProvider: "gemini", activeLlmModel: "gemini-flash" },
        { autoReplyEnabled: true }
      );
      assert.ok(text.includes("Панель управления"));
      assert.ok(text.includes("/post"));
      assert.ok(text.includes("/article"));
      assert.ok(text.includes("/status"));
    });
  });

  describe("Inline Keyboards", () => {
    it("builds guest main keyboard with 4 actions", () => {
      const kb = buildGuestMainKeyboard("test_channel");
      const rows = kb.inline_keyboard;
      assert.equal(rows.length, 2);
      // Row 1
      assert.equal(rows[0][0].text, "ℹ️ Что умеет бот");
      assert.equal(rows[0][0].callback_data, "onboarding:about");
      assert.equal(rows[0][1].text, "📢 Открыть канал");
      assert.equal(rows[0][1].url, "https://t.me/test_channel");
      // Row 2
      assert.equal(rows[1][0].text, "❓ Задать вопрос");
      assert.equal(rows[1][0].callback_data, "onboarding:ask");
      assert.equal(rows[1][1].text, "✍️ Написать админу");
      assert.equal(rows[1][1].callback_data, "onboarding:contact_admin");
    });

    it("builds owner keyboard with Mini App web_app button when url provided", () => {
      const kbWithUrl = buildOwnerMainKeyboard("https://test.ngrok-free.app/app");
      const rows = kbWithUrl.inline_keyboard;
      assert.equal(rows.length, 2);
      assert.equal(rows[0][0].text, "🛠 Панель управления (Mini App)");
      assert.equal(rows[0][0].web_app.url, "https://test.ngrok-free.app/app");

      const kbWithoutUrl = buildOwnerMainKeyboard("");
      assert.equal(kbWithoutUrl.inline_keyboard.length, 1);
      assert.equal(kbWithoutUrl.inline_keyboard[0][0].text, "📊 Проверить статус");
    });
  });

  describe("Pending Contact State Management", () => {
    const testUserId = 99887766;

    beforeEach(() => {
      clearPendingContact(testUserId);
    });

    it("tracks pending contact status correctly", () => {
      assert.equal(isPendingContact(testUserId), false);
      setPendingContact(testUserId);
      assert.equal(isPendingContact(testUserId), true);
      clearPendingContact(testUserId);
      assert.equal(isPendingContact(testUserId), false);
    });
  });

  describe("Audit Helpers & Rate Limiting", () => {
    const testUserId = 11223344;

    it("formats audit message with user details and reply prompt", () => {
      const audit = formatAuditMessage(
        { id: testUserId, username: "visitor_bob" },
        "Привет, как работает бот?",
        "Отправлен гид по каналу"
      );
      assert.ok(audit.includes("[Audit DM]"));
      assert.ok(audit.includes("@visitor_bob"));
      assert.ok(audit.includes(String(testUserId)));
      assert.ok(audit.includes("Привет, как работает бот?"));
      assert.ok(audit.includes("Ответ"));
    });

    it("rate-limits audits with cooldown", () => {
      const id = 77665544;
      assert.equal(shouldSendAudit(id, 5000), true);
      assert.equal(shouldSendAudit(id, 5000), false);
    });
  });

  describe("Handler Integration (Simulated)", () => {
    it("handles /start for guest without owner notifications", async () => {
      const commands = {};
      const callbacks = {};

      const fakeBot = {
        command: (cmd, fn) => { commands[cmd] = fn; },
        callbackQuery: (pattern, fn) => { callbacks[pattern] = fn; },
        api: {
          sendMessage: async () => {
            throw new Error("Owner sendMessage must not be called during guest /start!");
          }
        }
      };

      const fakeConfig = {
        ownerUserIds: [100],
        channelUsername: "dump_dump",
        webAppUrl: "https://my-app.dev/app"
      };

      registerOnboardingHandlers(fakeBot, { config: fakeConfig, state: {}, posts: {} });

      let repliedText = "";
      let repliedOptions = null;

      const guestCtx = {
        chat: { type: "private" },
        from: { id: 999, username: "guest_user" },
        reply: async (text, options) => {
          repliedText = text;
          repliedOptions = options;
        }
      };

      await commands["start"](guestCtx);
      assert.ok(repliedText.includes("AI-ассистент канала"));
      assert.ok(repliedOptions.reply_markup);
      assert.equal(repliedOptions.reply_markup.inline_keyboard.length, 2);
    });

    it("handles /start for owner with admin info and web app button", async () => {
      const commands = {};
      const fakeBot = {
        command: (cmd, fn) => { commands[cmd] = fn; },
        callbackQuery: () => {}
      };

      const fakeConfig = {
        ownerUserIds: [100],
        channelUsername: "dump_dump",
        webAppUrl: "https://my-app.dev/app",
        llmProvider: "gemini",
        activeLlmModel: "gemini-flash"
      };

      registerOnboardingHandlers(fakeBot, { config: fakeConfig, state: { autoReplyEnabled: true }, posts: {} });

      let repliedText = "";
      let repliedOptions = null;

      const ownerCtx = {
        chat: { type: "private" },
        from: { id: 100, username: "owner_boss" },
        reply: async (text, options) => {
          repliedText = text;
          repliedOptions = options;
        }
      };

      await commands["start"](ownerCtx);
      assert.ok(repliedText.includes("Панель управления"));
      assert.equal(
        repliedOptions.reply_markup.inline_keyboard[0][0].web_app.url,
        "https://my-app.dev/app"
      );
    });

    it("handles onboarding:about callback without notifying owner", async () => {
      let callbackHandler = null;
      const fakeBot = {
        command: () => {},
        callbackQuery: (pattern, fn) => { callbackHandler = fn; },
        api: {
          sendMessage: async () => {
            throw new Error("Owner must not be notified on info button taps!");
          }
        }
      };

      const fakeConfig = {
        ownerUserIds: [100],
        channelUsername: "dump_dump"
      };

      registerOnboardingHandlers(fakeBot, { config: fakeConfig, state: {}, posts: {} });

      let answered = false;
      let editedText = "";

      const ctx = {
        callbackQuery: { data: "onboarding:about" },
        from: { id: 999 },
        answerCallbackQuery: async () => { answered = true; },
        editMessageText: async (text) => { editedText = text; }
      };

      await callbackHandler(ctx);
      assert.equal(answered, true);
      assert.ok(editedText.includes("Что умеет ассистент"));
    });
  });
});
