package com.novatanks.owner;

import java.text.Normalizer;
import java.util.Locale;

final class NotificationClassifier {
    static final String OPENAI = "com.openai.chatgpt";
    static final String CLAUDE = "com.anthropic.claude";
    static final String TELEGRAM = "org.telegram.messenger";

    private NotificationClassifier() {}

    static Parsed classify(String packageName, String title, String text) {
        String all = fold((title == null ? "" : title) + " " + (text == null ? "" : text));
        String source;
        if (OPENAI.equals(packageName)) {
            source = all.contains("codex") ? "codex" : "chatgpt";
            if (!looksOperational(all)) return null;
        } else if (CLAUDE.equals(packageName)) {
            source = "claude";
            if (!looksOperational(all)) return null;
        } else if (TELEGRAM.equals(packageName)) {
            if (!(all.contains("jarvis") || all.contains("hermes"))) return null;
            source = "jarvis";
        } else return null;

        String status = "working";
        boolean actionRequired = false;
        if (containsAny(all, "needs your attention", "needs attention", "approval", "approve", "permission", "input required", "requires input", "action required", "waiting for you", "requiere tu atencion", "necesita tu atencion", "aprobacion", "aprobar", "permiso", "requiere una respuesta", "esperando tu respuesta")) {
            status = "attention";
            actionRequired = true;
        } else if (containsAny(all, "failed", "failure", "error", "crashed", "stopped unexpectedly", "couldn't complete", "could not complete", "fallo", "ha fallado", "no se pudo completar", "se detuvo inesperadamente")) {
            status = "failed";
        } else if (containsAny(all, "completed", "complete", "finished", "done", "ready for review", "task is ready", "has finished", "deployed", "merged", "completado", "completada", "terminado", "terminada", "finalizado", "finalizada", "listo para revisar", "lista para revisar", "tarea lista", "desplegado", "fusionado")) {
            status = "completed";
        }
        return new Parsed(source, status, actionRequired);
    }

    private static boolean looksOperational(String value) {
        return containsAny(value, "task", "agent", "codex", "research", "working", "running", "finished", "complete", "completed", "ready", "approval", "permission", "input", "failed", "error", "review", "deploy", "merge", "tarea", "agente", "investigacion", "trabajando", "ejecutando", "terminado", "completado", "listo", "aprobacion", "permiso", "respuesta", "fallo", "revision", "despliegue", "fusionado");
    }

    private static String fold(String value) {
        String lower = value.toLowerCase(Locale.ROOT);
        return Normalizer.normalize(lower, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
    }

    private static boolean containsAny(String value, String... needles) {
        for (String needle : needles) if (value.contains(needle)) return true;
        return false;
    }

    static final class Parsed {
        final String source;
        final String status;
        final boolean actionRequired;
        Parsed(String source, String status, boolean actionRequired) {
            this.source = source;
            this.status = status;
            this.actionRequired = actionRequired;
        }
    }
}
