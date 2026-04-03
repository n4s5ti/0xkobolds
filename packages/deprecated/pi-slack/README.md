# @0xkobold/pi-slack

Slack integration for PI coding agent.

## Features

- **Webhook Messages** - Send messages via incoming webhook
- **API Posts** - Post rich messages with Block Kit
- **Channel Info** - Get channel details

## Installation

```bash
npm install @0xkobold/pi-slack
```

## Configuration

```bash
# Webhook (simple messages)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx

# Bot token (full API access)
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
```

## Tools

| Tool | Description |
|------|-------------|
| `slack_send_message` | Send via webhook |
| `slack_post_message` | Post via Web API |
| `slack_get_channel_info` | Get channel details |

## Commands

- `/slack-status` - Show configuration
- `/slack-test` - Send test message

## License

MIT
