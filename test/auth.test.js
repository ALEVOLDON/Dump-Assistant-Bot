const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { createAuthMiddleware } = require("../src/middleware/auth");

const mockConfig = {
  telegramBotToken: "123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ",
  ownerUserIds: [12345]
};

describe("authMiddleware", () => {
  it("allows bypass in non-production with BYPASS_INIT_DATA_AUTH=true", () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldBypass = process.env.BYPASS_INIT_DATA_AUTH;

    process.env.NODE_ENV = "development";
    process.env.BYPASS_INIT_DATA_AUTH = "true";

    try {
      const middleware = createAuthMiddleware({ config: mockConfig });
      let nextCalled = false;
      const req = { headers: {} };
      const res = {
        status: () => res,
        json: () => {}
      };

      middleware(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.equal(req.user.id, 12345);
    } finally {
      process.env.NODE_ENV = oldNodeEnv;
      process.env.BYPASS_INIT_DATA_AUTH = oldBypass;
    }
  });

  it("blocks bypass in production even with BYPASS_INIT_DATA_AUTH=true", () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldBypass = process.env.BYPASS_INIT_DATA_AUTH;

    process.env.NODE_ENV = "production";
    process.env.BYPASS_INIT_DATA_AUTH = "true";

    try {
      const middleware = createAuthMiddleware({ config: mockConfig });
      let nextCalled = false;
      let statusSet = null;
      let jsonSent = null;

      const req = { headers: {} };
      const res = {
        status: (code) => {
          statusSet = code;
          return res;
        },
        json: (data) => {
          jsonSent = data;
        }
      };

      middleware(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false);
      assert.equal(statusSet, 401);
    } finally {
      process.env.NODE_ENV = oldNodeEnv;
      process.env.BYPASS_INIT_DATA_AUTH = oldBypass;
    }
  });

  it("validates correct Telegram WebApp initData hash using WebAppData secret key", () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldBypass = process.env.BYPASS_INIT_DATA_AUTH;

    process.env.NODE_ENV = "production";
    process.env.BYPASS_INIT_DATA_AUTH = "false";

    try {
      // 1. Prepare dummy data
      const authDate = Math.floor(Date.now() / 1000) - 10;
      const user = { id: 12345, username: "test_owner" };
      const params = new URLSearchParams({
        auth_date: String(authDate),
        user: JSON.stringify(user)
      });

      // 2. Sort keys and construct data_check_string
      const keys = Array.from(params.keys()).sort();
      const dataCheckString = keys.map((k) => `${k}=${params.get(k)}`).join("\n");

      // 3. Compute correct hash using WebAppData
      const secretKey = crypto
        .createHmac("sha256", "WebAppData")
        .update(mockConfig.telegramBotToken)
        .digest();

      const hash = crypto
        .createHmac("sha256", secretKey)
        .update(dataCheckString)
        .digest("hex");

      params.append("hash", hash);

      const initDataStr = params.toString();

      // 4. Test middleware
      const middleware = createAuthMiddleware({ config: mockConfig });
      let nextCalled = false;
      const req = {
        headers: {
          "x-telegram-init-data": initDataStr
        }
      };
      const res = {
        status: () => res,
        json: () => {}
      };

      middleware(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.equal(req.user.id, 12345);
    } finally {
      process.env.NODE_ENV = oldNodeEnv;
      process.env.BYPASS_INIT_DATA_AUTH = oldBypass;
    }
  });
});
