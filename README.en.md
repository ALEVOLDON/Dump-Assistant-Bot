# Dump Assistant Bot

[English version](README.en.md) | [Русская версия](README.md)

![Node.js](https://img.shields.io/badge/Node.js-22+-green?logo=node.js)
![Telegram](https://img.shields.io/badge/Telegram-Bot-blue?logo=telegram)
![Gemini](https://img.shields.io/badge/Gemini-Recommended-blueviolet)
![OpenAI](https://img.shields.io/badge/OpenAI-Compatible-purple?logo=openai)
![Ollama](https://img.shields.io/badge/Ollama-Optional-orange)

A smart AI assistant for Telegram channels and discussion groups. The bot reads channel posts, tracks thread context, analyzes links, answers subscriber questions, and can automatically leave the first comment under new posts.

By default, the project is configured to use the Gemini cloud model. OpenAI and local Ollama models remain supported alternatives.

## Features

- **Native Formatting (Telegram Bot API 10.2+):** The bot supports sending Rich Messages (native tables, lists, LaTeX formulas) by converting Markdown to HTML using the `marked` library. It includes full support for native math rendering (`tg-math` and `tg-math-block`) and an automatic safety fallback to standard text messages for older Telegram clients.
- **Ephemeral Replies in Groups:** The bot can reply to comments in group discussions with private (ephemeral) messages visible only to the specific user who asked. This prevents chat clutter in public comment threads.
- **Cloud-first LLM:** Gemini API is the recommended mode, requiring no local model installation.
- **OpenAI-compatible Mode:** Switch easily to OpenAI API or any compatible endpoint.
- **Local Mode:** Ollama is preserved as an optional/legacy option for hosting on your own hardware.
- **Post Context Caching:** Caches new channel posts to answer questions with full context of the original publication.
- **Link Reading:** If a post or query contains a URL, the bot downloads the page content and incorporates it into the LLM prompt.
- **First Comment Mode:** Automatically leaves a brief comment under new channel posts.
- **Post Publishing (via DM):** The owner can send `/post <Markdown text>` (with optional image) directly to the bot to publish beautiful Rich posts to the channel. Media files are saved to the Vercel site's `public/media` folder and served via a persistent URL.
- **Publishing from Links:** Send any link to the bot's DM. It automatically downloads the page content, generates a structured post using AI, appends the source link, and publishes it. Alternatively, use `/postlink <url>`.
- **Owner Commands:** `/post`, `/postlink`, `/ephemeral`, `/status`, `/usage`, `/on`, `/off`, `/chatid`.
- **Anti-spam & Focus:** Only replies to direct mentions, questions, and helpful requests, ignoring noise.

## Quick Start

### 1. Installation

Requires Node.js 22+.

```bash
npm install
```

### 2. Configure `.env`

Create a local configuration file:

```bash
cp .env.example .env
```

Fill in the required fields:

```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
BOT_USERNAME=your_bot_username
ALLOWED_CHAT_IDS=-1001234567890
ALLOW_ALL_CHATS=false
OWNER_USER_IDS=123456789
CHANNEL_CHAT_ID=-1001234567890

LLM_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.5-flash
```

Where:

- `TELEGRAM_BOT_TOKEN` - Token from [@BotFather](https://t.me/BotFather).
- `BOT_USERNAME` - Bot username without the `@`.
- `ALLOWED_CHAT_IDS` - Comma-separated list of allowed group or channel IDs.
- `ALLOW_ALL_CHATS` - Open mode for all chats. Disabled by default.
- `OWNER_USER_IDS` - Comma-separated list of Telegram IDs of bot owners.
- `CHANNEL_CHAT_ID` - Channel ID for publishing posts via `/post` (starts with `-100`).
- `LLM_PROVIDER` - One of: `gemini`, `openai`, `ollama`.

### 3. Telegram Setup

1. In [@BotFather](https://t.me/BotFather), open `Bot Settings` -> `Group Privacy` and disable privacy mode.
2. Add the bot to your channel's discussion group.
3. Grant the bot permissions to read and send messages.
4. Start the bot:

```bash
npm start
```

### 4. Web App Admin Panel & Windows Startup

The bot includes an Express web server hosting a Telegram Mini App admin panel for adjusting AI settings, checking token usage, and publishing posts in the "Composer" tab.

#### One-Click Launch on Windows:
Run the [start.bat](start.bat) file in the root directory. It automatically opens separate command prompts and runs:
1. The local bot server (`npm start` on port `3001` or as specified in `PORT`).
2. An `ngrok` tunnel mapping your dev domain.

#### Manual Launch & Tunnel Configuration:
1. Install [ngrok](https://ngrok.com) and add your authtoken:
   ```bash
   ngrok config add-authtoken <YOUR_TOKEN>
   ```
2. Start the bot:
   ```bash
   npm start
   ```
3. Open a tunnel for the bot's port (default: `3001`):
   ```bash
   ngrok http --domain=your-domain.ngrok-free.app 3001
   ```
4. Copy the public HTTPS URL and configure the menu button in Telegram:
   - Open [@BotFather](https://t.me/BotFather) -> `/mybots` -> select your bot -> **Bot Settings** -> **Menu Button** -> **Configure menu button**.
   - Send [@BotFather](https://t.me/BotFather) the URL appending `/app` (e.g., `https://your-domain.ngrok-free.app/app`).

> [!TIP]
> To access the admin panel directly via a regular web browser without Telegram authentication, add the following to your `.env`:
> ```env
> BYPASS_INIT_DATA_AUTH=true
> ```

## LLM Providers

### Gemini (Recommended)

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.5-flash
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
LLM_TIMEOUT_MS=30000
```

Fast, requires no local hardware or GPU, supports Structured Outputs natively.

### OpenAI or Compatible API

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
LLM_TIMEOUT_MS=30000
```

Use this mode for OpenAI models or custom endpoints (e.g., OpenRouter, Grok/xAI).

### Local / Legacy Ollama

```bash
ollama pull qwen2.5:3b-instruct
```

```env
LLM_PROVIDER=ollama
OLLAMA_MODEL=qwen2.5:3b-instruct
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_NUM_CTX=4096
OLLAMA_NUM_PREDICT=200
LLM_TIMEOUT_MS=120000
```

Ensures maximum privacy and works offline on your own machine.

## Migration from Ollama to Cloud

1. In `.env`, change `LLM_PROVIDER=ollama` to `LLM_PROVIDER=gemini`.
2. Add your `GEMINI_API_KEY`.
3. Set `GEMINI_MODEL=gemini-3.5-flash`.
4. Reduce `LLM_TIMEOUT_MS` to `30000` (from `120000`).
5. Restart the bot.

## Commands

- `/post <text>` - Publish markdown post to channel (sent via DM to the bot, supports Markdown and attaching one image).
- `/postlink <url>` - Generate and publish a post based on link content. Also works by sending a bare link without the command.
- `/ephemeral <on/off>` - Enable or disable private (ephemeral) replies in groups. Shows current status if called without arguments.
- `/chatid` - Show ID of the current chat and thread.
- `/status` - Show active mode, model, and database stats.
- `/usage` - Show detailed token and request usage statistics.
- `/on` - Enable automatic replies.
- `/off` - Disable automatic replies.

Commands are restricted to user IDs defined in `OWNER_USER_IDS`.

## Behavior Settings

The core system prompt is located in `prompts/assistant.md`. You can adjust tone, style, and rules there without editing code.

Additional environment variables:

- `CHANNEL_ABOUT` - Brief description of the channel for context.
- `AUTO_REPLY_ENABLED` - Automatically enable replies on startup.
- `MAX_REPLY_CHARS` - Maximum length of the generated reply.
- `THREAD_COOLDOWN_MS` - Cooling period between replies in the same thread.
- `RECENT_MESSAGES_LIMIT` - Number of previous messages loaded for context.
- `URL_FETCH_TIMEOUT_MS` - Timeout for web scraping.
- `WEBSITE_REPO_PATH` - Path to Vercel website folder (e.g., `portfolio-clone`).
- `MEDIA_PUBLIC_BASE_URL` - Public URL for uploaded media (e.g., `https://alevoldon.com/media`).
- `MEDIA_AUTO_DEPLOY` - Automatically commit and push media to Git (`true`/`false`).
- `LOG_LEVEL` - Logging level: `error`, `warn`, `info`, `debug`.

## Verification

Run lint check and tests:

```bash
npm run check
npm test
```

For the website landing page:

```bash
cd website
npm run build
```

## Deployment

### Docker

```bash
cp .env.example .env
# fill in .env

docker compose up -d --build
```

The `data/` folder is mounted as a volume to persist state and post caches between restarts.

### Running on VPS

```bash
npm ci --omit=dev
npm start
```

Use `pm2`, `systemd`, or similar tool for background daemon management. The bot saves state in `data/state.json` on exit.

### CI/CD

The repository includes GitHub Actions (`.github/workflows/ci.yml`): syntax checks, unit tests, and landing page build verification.
