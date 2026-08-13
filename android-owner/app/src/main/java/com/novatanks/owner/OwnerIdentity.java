package com.novatanks.owner;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;

final class OwnerIdentity {
    private static final String STORE = "AndroidKeyStore";
    private static final String ALIAS = "nova_owner_phone_identity_v1";

    private OwnerIdentity() {}

    static KeyPair ensureKeyPair() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(STORE);
        keyStore.load(null);
        if (!keyStore.containsAlias(ALIAS)) {
            KeyPairGenerator generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, STORE);
            generator.initialize(new KeyGenParameterSpec.Builder(
                    ALIAS,
                    KeyProperties.PURPOSE_SIGN | KeyProperties.PURPOSE_VERIFY)
                    .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .build());
            generator.generateKeyPair();
        }
        KeyStore.PrivateKeyEntry entry = (KeyStore.PrivateKeyEntry) keyStore.getEntry(ALIAS, null);
        return new KeyPair(entry.getCertificate().getPublicKey(), entry.getPrivateKey());
    }

    static String bindingId() {
        try {
            byte[] encoded = ensureKeyPair().getPublic().getEncoded();
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(encoded);
            return Base64.encodeToString(digest, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
        } catch (Exception error) {
            return "";
        }
    }

    static String signChallenge(String challenge) {
        try {
            PrivateKey key = ensureKeyPair().getPrivate();
            Signature signature = Signature.getInstance("SHA256withECDSA");
            signature.initSign(key);
            signature.update(challenge.getBytes(StandardCharsets.UTF_8));
            return Base64.encodeToString(signature.sign(), Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
        } catch (Exception error) {
            return "";
        }
    }
}
