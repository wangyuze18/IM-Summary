package com.imsummary.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

/**
 * 凭据加密存储（Demo 级 AES-GCM）。
 * 普通配置数据只保存引用字符串（enc:<密文>），明文仅在解密后内存中使用。
 */
@Component
public class CredentialStore {

    private static final String PREFIX = "enc:";
    private final SecretKey key;
    private final SecureRandom random = new SecureRandom();

    public CredentialStore(@Value("${imsummary.credential-secret}") String secret) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(secret.getBytes(StandardCharsets.UTF_8));
        this.key = new SecretKeySpec(Arrays.copyOf(digest, 16), "AES");
    }

    /** 加密并生成引用串 */
    public String encryptToRef(String plaintext) throws Exception {
        byte[] iv = new byte[12];
        random.nextBytes(iv);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(128, iv));
        byte[] encrypted = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
        byte[] combined = new byte[iv.length + encrypted.length];
        System.arraycopy(iv, 0, combined, 0, iv.length);
        System.arraycopy(encrypted, 0, combined, iv.length, encrypted.length);
        return PREFIX + Base64.getEncoder().encodeToString(combined);
    }

    /** 从引用串解密 */
    public String decryptRef(String ref) throws Exception {
        if (ref == null || !ref.startsWith(PREFIX)) {
            throw new IllegalArgumentException("invalid credential ref");
        }
        byte[] combined = Base64.getDecoder().decode(ref.substring(PREFIX.length()));
        byte[] iv = Arrays.copyOfRange(combined, 0, 12);
        byte[] encrypted = Arrays.copyOfRange(combined, 12, combined.length);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
    }

    /** 掩码展示，如 ****abcd */
    public static String mask(String plaintext) {
        if (plaintext == null || plaintext.isEmpty()) {
            return "";
        }
        String tail = plaintext.length() > 4 ? plaintext.substring(plaintext.length() - 4) : plaintext;
        return "****" + tail;
    }
}
