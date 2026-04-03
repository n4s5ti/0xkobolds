# Deprecated Packages

These packages have been **unified into pi-gateway** and are kept for reference only.

## Why Deprecated?

All functionality is now in `packages/pi-gateway/src/adapters/`:
- **twitch.ts** → EventSub WebSocket + Helix API
- **telegram.ts** → Polling/webhook + rich messages  
- **slack.ts** → Webhooks + Web API
- **whatsapp.ts** → Baileys protocol

## Old Packages

| Package | Moved From | Now In |
|---------|-----------|--------|
| pi-twitch | 10 tools | gateway/adapters/twitch.ts |
| pi-telegram | 3 tools | gateway/adapters/telegram.ts |
| pi-slack | 3 tools | gateway/adapters/slack.ts |
| pi-whatsapp | 3 tools | gateway/adapters/whatsapp.ts |

## Migration

Instead of using individual packages:

```typescript
// OLD (deprecated)
import { telegram_send_message } from "@0xkobold/pi-telegram";

// NEW (unified)
import { TelegramAdapter } from "./adapters/telegram.js";
const adapter = new TelegramAdapter({ token: process.env.TELEGRAM_TOKEN });
await adapter.sendMessage(chatId, message);
```

## Gateway Config

Enable platforms in `~/.0xkobold/gateway/config.json`:

```json
{
  "platforms": {
    "telegram": {
      "enabled": true,
      "token": "YOUR_BOT_TOKEN"
    },
    "slack": {
      "enabled": true,
      "webhookUrl": "https://hooks.slack.com/..."
    }
  }
}
```

## Why Unified?

Single integration point = simpler auth, fewer bugs, easier debugging.
