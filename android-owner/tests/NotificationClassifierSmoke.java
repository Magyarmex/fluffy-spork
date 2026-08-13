package com.novatanks.owner;

public final class NotificationClassifierSmoke {
    public static void main(String[] args) {
        assertStatus(NotificationClassifier.OPENAI, "Codex", "Task completed", "codex", "completed");
        assertStatus(NotificationClassifier.OPENAI, "ChatGPT", "Agent needs your attention", "chatgpt", "attention");
        assertStatus(NotificationClassifier.CLAUDE, "Claude", "Research task failed", "claude", "failed");
        assertStatus(NotificationClassifier.TELEGRAM, "Jarvis", "Hermes working on deployment", "jarvis", "working");
        if (NotificationClassifier.classify(NotificationClassifier.TELEGRAM, "Family", "Dinner at 7") != null) {
            throw new AssertionError("ordinary Telegram messages must be ignored");
        }
    }

    private static void assertStatus(String pkg, String title, String body, String source, String status) {
        NotificationClassifier.Parsed parsed = NotificationClassifier.classify(pkg, title, body);
        if (parsed == null || !source.equals(parsed.source) || !status.equals(parsed.status)) {
            throw new AssertionError(title + " / " + body);
        }
    }
}
