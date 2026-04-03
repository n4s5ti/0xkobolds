# @0xkobold/pi-twitch

Twitch integration for PI coding agent - stream status, user info, clips, EventSub notifications.

## Features

- **Stream Status** - Check if channels are live
- **User Info** - Get Twitch user/channel information
- **Clips** - Create stream clips
- **Search** - Search for channels and categories
- **EventSub** - Real-time notifications for stream events
- **Moderation** - Chat settings and moderator lists

## Installation

```bash
npm install @0xkobold/pi-twitch
# or
yarn add @0xkobold/pi-twitch
```

## Configuration

Set environment variables:

```bash
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
TWITCH_CHANNELS=channel1,channel2  # optional
```

## Tools

| Tool | Description |
|------|-------------|
| `twitch_get_stream` | Get current stream status |
| `twitch_get_user` | Get user info |
| `twitch_create_clip` | Create a stream clip |
| `twitch_search_channels` | Search channels |
| `twitch_subscribe_channel` | Subscribe to notifications |
| `twitch_get_subscriptions` | List subscriptions |
| `twitch_get_chat_settings` | Get chat settings |
| `twitch_get_moderators` | List moderators |
| `twitch_get_game` | Get game info |

## Commands

- `/twitch-status` - Show connection status
- `/twitch-following` - Show monitored channels

## Development

```bash
npm run build
npm test
```

## License

MIT
