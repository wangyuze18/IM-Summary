package com.imsummary.domain;

import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

/**
 * 模型 API 配置档案。
 * API Key 加密存储于 CredentialStore，本表只保存引用；任何接口不返回明文。
 */
@Data
@Entity
@Table(name = "model_api_profile")
public class ModelApiProfileEntity {

    @Id
    private String profileId;

    private String displayName;

    /** openai-compatible | anthropic | custom */
    private String providerType;

    private String baseUrl;

    private String modelName;

    /** 凭据引用：enc:<base64 密文> */
    @Column(length = 2000)
    private String apiKeySecretRef;

    private Boolean thinkingModeSupported;

    /** untested | testing | available | failed */
    private String connectionStatus;

    @Column(length = 1000)
    private String lastErrorMessage;

    private Instant lastTestedAt;

    private boolean enabled;

    private Instant createdAt;

    private Instant updatedAt;

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
