# NOVA TANKS — Owner Operations

Owner Operations is an owner-only in-game work queue for external agent activity. The public game fails closed: no queue is mounted unless a trusted phone-side bridge supplies a short-lived `nova.owner.operations.v1` capability and an opaque phone binding ID. The binding ID is not a hardware fingerprint or personal identifier.

The game accepts only normalized task metadata for Codex, ChatGPT, Claude, and Jarvis/Telegram. Provider access remains outside the public game client.
