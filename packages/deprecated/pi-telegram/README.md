# @0xkobold/pi-telegram

Telegram bot integration for PI coding agent.

## Features

- **Send Messages** - Send text and photos to Telegram chats
- **Bot Info** - Get information about your bot
- **Commands** - Connect/disconnect bot, check status

## Installation

```bash
npm install @0xkobold/pi-telegram
```

## Configuration

```bash
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_MODE=polling  # or 'webhook'
TELEGRAM_WEBHOOK_URL=https://your-domain.com/webhook  # for webhook mode
TELEGRAM_PORT=3000  # for webhook mode
```

## Tools

| Tool | Description |
|------|-------------|
| `telegram_send_message` | Send a message to a chat |
| `telegram_send_photo` | Send a photo to a chat |
| `telegram_get_me` | Get bot information |

## Commands

- `/telegram-status` - Show connection status
- `/telegram-connect` - Connect the bot
- `/telegram-disconnect` - Disconnect the bot

## License

MIT
