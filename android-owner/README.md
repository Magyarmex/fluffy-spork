# NOVA Owner Android companion

Private phone-side companion for NOVA TANKS Owner Operations.

## What it does

- Loads only the canonical NOVA TANKS GitHub Pages origin inside a hardened WebView.
- Generates a per-installation EC P-256 identity in Android Keystore; the private key is non-exportable.
- Exposes the `NOVAOwnerPhone` bridge expected by the in-game Owner Operations HUD.
- Uses Android `NotificationListenerService` to translate operational notifications from:
  - ChatGPT / Codex (`com.openai.chatgpt`)
  - Claude (`com.anthropic.claude`)
  - Jarvis/Hermes via Telegram (`org.telegram.messenger`)
- Keeps operation metadata on-device in private app storage. No OpenAI, Anthropic, Telegram, or Jarvis credentials are stored in the game.

## Human setup: intentionally reduced to the Android-required minimum

1. Install the generated `NOVA-Owner-debug.apk` on the owner's Android phone.
2. Open it. Android's Notification Access settings open automatically; enable **NOVA Owner** and return to the app.

That is enough for the local-first path. The companion then reads only relevant agent/task notifications and injects them into the owner-only queue. A normal browser never receives the native bridge, so the Owner Operations UI remains absent there.

## Security boundary

Notification access is a sensitive Android permission and cannot be granted programmatically. The companion deliberately relies on the system settings screen for that one human consent step. It does not use Accessibility, IMEI/serial identifiers, browser fingerprinting, exported services, cleartext HTTP, or provider session cookies.

The current build is local-first: another person compiling the open-source companion would receive a different Keystore binding and only their own phone notifications. They cannot receive the owner's operation data. A future remote relay can challenge/sign against `signChallenge()` without changing the in-game protocol.
