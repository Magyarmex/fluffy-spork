package com.novatanks.owner;

import android.content.Context;
import android.content.SharedPreferences;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

final class OwnerEnrollment {
    private static final String PREFS = "nova_owner_enrollment";
    private static final String KEY = "enrolled_v1";
    private static final String EXPECTED_SHA256 = "8bcffcbd8bbb73a2f56bbac87085ad144ba402c65812f8884f5b34b3eb7bdbd0";

    private OwnerEnrollment() {}

    static boolean isEnrolled(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY, false);
    }

    static boolean enroll(Context context, String candidate) {
        if (candidate == null) return false;
        try {
            byte[] actual = MessageDigest.getInstance("SHA-256")
                    .digest(candidate.trim().getBytes(StandardCharsets.UTF_8));
            byte[] expected = hex(EXPECTED_SHA256);
            if (!MessageDigest.isEqual(actual, expected)) return false;
            OwnerIdentity.ensureKeyPair();
            SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            preferences.edit().putBoolean(KEY, true).commit();
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private static byte[] hex(String value) {
        byte[] output = new byte[value.length() / 2];
        for (int i = 0; i < output.length; i++) {
            int at = i * 2;
            output[i] = (byte) Integer.parseInt(value.substring(at, at + 2), 16);
        }
        return output;
    }
}
