# @0xkobold/pi-whatsapp

WhatsApp integration for PI via WhatsApp Web (Baileys).

## Features

- **Send Messages** - Send WhatsApp messages to contacts/groups
- **QR Authentication** - Easy pairing via QR code
- **Contact List** - View your WhatsApp contacts

## Installation

```bash
npm install @0xkobold/pi-whatsapp
```

## Configuration

```bash
WHATSAPP_SESSION_PATH=./whatsapp-session  # optional, for session persistence
```

## Tools

| Tool | Description |
|------|-------------|
| `whatsapp_send_message` | Send a message |
| `whatsapp_get_qr` | Get authentication QR code |
| `whatsapp_get_contacts` | List contacts |

## Commands

- `/whatsapp-status` - Show connection status
- `/whatsapp-connect` - Connect via QR scan
- `/whatsapp-disconnect` - Disconnect

## Usage

1. Run `/whatsapp-connect`
2. Scan the QR code with WhatsApp app
3. Use `whatsapp_send_message` to send messages

## License

MIT
