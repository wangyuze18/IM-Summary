package com.imsummary.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.imsummary.domain.ModelApiProfileEntity;
import com.imsummary.domain.ModelSettingsEntity;
import com.imsummary.gateway.GatewayModels;
import com.imsummary.gateway.ModelCallException;
import com.imsummary.gateway.ModelGateway;
import com.imsummary.repository.ModelApiProfileRepository;
import com.imsummary.repository.ModelSettingsRepository;
import com.imsummary.security.CredentialStore;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;

/**
 * 模型配置服务：档案 CRUD、连接测试、Agent 绑定、Run 配置快照解析。
 * 任何返回结构均不含明文 API Key。
 */
@Service
public class ModelProfileService {

    private static final String SETTINGS_ID = "default";
    private static final List<String> AGENT_KEYS = List.of(
            "context_event", "state", "user_context", "relevance",
            "summary", "factual_auditor", "personalization_auditor");

    private final ModelApiProfileRepository profileRepository;
    private final ModelSettingsRepository settingsRepository;
    private final ModelGateway gateway;
    private final CredentialStore credentialStore;
    private final ObjectMapper mapper = new ObjectMapper();

    public ModelProfileService(ModelApiProfileRepository profileRepository,
                               ModelSettingsRepository settingsRepository,
                               ModelGateway gateway,
                               CredentialStore credentialStore) {
        this.profileRepository = profileRepository;
        this.settingsRepository = settingsRepository;
        this.gateway = gateway;
        this.credentialStore = credentialStore;
    }

    // ---------- 档案 CRUD ----------

    public List<Map<String, Object>> listProfiles() {
        return profileRepository.findAllByOrderByCreatedAtAsc().stream()
                .map(this::toMaskedView).toList();
    }

    public Map<String, Object> saveProfile(String profileId, String displayName, String providerType,
                                           String baseUrl, String modelName, String apiKey, Boolean enabled) {
        ModelApiProfileEntity entity = profileId == null || profileId.isBlank()
                ? new ModelApiProfileEntity()
                : profileRepository.findById(profileId).orElseGet(ModelApiProfileEntity::new);
        if (entity.getProfileId() == null) {
            entity.setProfileId(UUID.randomUUID().toString());
            entity.setConnectionStatus("untested");
            entity.setEnabled(true);
        }
        entity.setDisplayName(displayName);
        entity.setProviderType(providerType);
        entity.setBaseUrl(baseUrl);
        entity.setModelName(modelName);
        if (apiKey != null && !apiKey.isBlank()) {
            try {
                entity.setApiKeySecretRef(credentialStore.encryptToRef(apiKey));
                // 密钥更新后需重新测试
                entity.setConnectionStatus("untested");
            } catch (Exception e) {
                throw new IllegalArgumentException("凭据加密失败");
            }
        }
        if (enabled != null) {
            entity.setEnabled(enabled);
        }
        profileRepository.save(entity);
        return toMaskedView(entity);
    }

    public void deleteProfile(String profileId) {
        // 检查是否被默认绑定或 Agent 覆盖引用
        JsonNode bindings = readBindings();
        if (bindings != null) {
            if (profileId.equals(bindings.path("defaultProfileId").asText())) {
                throw new IllegalStateException("该档案是默认配置，请先更换默认档案");
            }
            JsonNode overrides = bindings.path("overrides");
            overrides.fields().forEachRemaining(e -> {
                if (profileId.equals(e.getValue().asText())) {
                    throw new IllegalStateException("该档案被 Agent [" + e.getKey() + "] 使用，请先解除绑定");
                }
            });
        }
        profileRepository.deleteById(profileId);
    }

    public Map<String, Object> testProfile(String profileId, String providerType, String baseUrl,
                                           String apiKey, String modelName) {
        GatewayModels.TestResult result;
        ModelApiProfileEntity entity = null;
        if (profileId != null && !profileId.isBlank()) {
            entity = profileRepository.findById(profileId)
                    .orElseThrow(() -> new NoSuchElementException("配置不存在：" + profileId));
            // 若请求携带新 Key 则用新 Key 测试，否则用已保存的
            String keyForTest = (apiKey != null && !apiKey.isBlank()) ? apiKey : credentialSafeDecrypt(entity);
            result = gateway.testDraft(entity.getProviderType(), entity.getBaseUrl(), keyForTest, entity.getModelName());
        } else {
            result = gateway.testDraft(providerType, baseUrl, apiKey, modelName);
        }
        if (entity != null) {
            entity.setConnectionStatus(result.success() ? "available" : "failed");
            entity.setLastErrorMessage(result.errorMessage());
            entity.setLastTestedAt(Instant.now());
            entity.setThinkingModeSupported(result.thinkingModeDetected());
            profileRepository.save(entity);
            return toMaskedView(entity);
        }
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("connectionStatus", result.success() ? "available" : "failed");
        view.put("lastErrorMessage", result.errorMessage());
        view.put("thinkingModeSupported", result.thinkingModeDetected());
        return view;
    }

    private String credentialSafeDecrypt(ModelApiProfileEntity entity) {
        try {
            return credentialStore.decryptRef(entity.getApiKeySecretRef());
        } catch (Exception e) {
            throw new IllegalStateException("凭据已失效，请重新保存 API Key");
        }
    }

    /**
     * 获取模型列表（V5.2）：携带 profileId 时用已保存档案（未给 apiKey 则解密已存凭据），
     * 否则按草稿 providerType + baseUrl + apiKey 探测。返回结构不含明文 Key。
     */
    public List<String> listModels(String profileId, String providerType, String baseUrl, String apiKey) {
        String effectiveProviderType = providerType;
        String effectiveBaseUrl = baseUrl;
        String effectiveApiKey = apiKey;
        if (profileId != null && !profileId.isBlank()) {
            ModelApiProfileEntity entity = profileRepository.findById(profileId)
                    .orElseThrow(() -> new NoSuchElementException("配置不存在：" + profileId));
            effectiveProviderType = entity.getProviderType();
            effectiveBaseUrl = entity.getBaseUrl();
            if (effectiveApiKey == null || effectiveApiKey.isBlank()) {
                effectiveApiKey = credentialSafeDecrypt(entity);
            }
        }
        if (effectiveProviderType == null || effectiveProviderType.isBlank()) {
            throw new IllegalArgumentException("缺少接口协议类型，无法获取模型列表");
        }
        if (effectiveBaseUrl == null || effectiveBaseUrl.isBlank()) {
            throw new IllegalArgumentException("缺少 Base URL，无法获取模型列表");
        }
        if (effectiveApiKey == null || effectiveApiKey.isBlank()) {
            throw new IllegalArgumentException("缺少 API Key，无法获取模型列表");
        }
        try {
            return gateway.listModelsDraft(effectiveProviderType, effectiveBaseUrl, effectiveApiKey);
        } catch (ModelCallException e) {
            throw e;
        } catch (Exception e) {
            throw new ModelCallException("获取模型列表失败：" + e.getMessage(), e);
        }
    }

    // ---------- Agent 绑定 ----------

    public Map<String, Object> getBindings() {
        JsonNode node = readBindings();
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("defaultProfileId", node == null ? null : node.path("defaultProfileId").asText(null));
        view.put("thinkingEnabled", node != null && node.path("thinkingEnabled").asBoolean(false));
        Map<String, String> overrides = new LinkedHashMap<>();
        if (node != null) {
            node.path("overrides").fields()
                    .forEachRemaining(e -> overrides.put(e.getKey(), e.getValue().asText()));
        }
        view.put("overrides", overrides);
        view.put("agentKeys", AGENT_KEYS);
        return view;
    }

    public void saveBindings(String defaultProfileId, boolean thinkingEnabled, Map<String, String> overrides) {
        if (defaultProfileId != null && profileRepository.findById(defaultProfileId).isEmpty()) {
            throw new NoSuchElementException("默认档案不存在：" + defaultProfileId);
        }
        ObjectNode node = mapper.createObjectNode();
        node.put("defaultProfileId", defaultProfileId);
        node.put("thinkingEnabled", thinkingEnabled);
        ObjectNode overridesNode = node.putObject("overrides");
        if (overrides != null) {
            overrides.forEach((agent, pid) -> {
                if (pid != null && !pid.isBlank()) {
                    overridesNode.put(agent, pid);
                }
            });
        }
        ModelSettingsEntity entity = settingsRepository.findById(SETTINGS_ID)
                .orElseGet(() -> {
                    ModelSettingsEntity e = new ModelSettingsEntity();
                    e.setSettingsId(SETTINGS_ID);
                    return e;
                });
        try {
            entity.setBindingsJson(mapper.writeValueAsString(node));
        } catch (Exception e) {
            throw new IllegalStateException("序列化绑定失败");
        }
        settingsRepository.save(entity);
    }

    /**
     * 解析 Run 配置快照：默认档案 + Agent 覆盖，返回 agentKey → profile 映射。
     * 任何实际使用的 Agent 配置无效时抛异常，Run 应在启动前阻断。
     */
    public Map<String, ModelApiProfileEntity> resolveRunSnapshot(List<String> agentKeys) {
        JsonNode bindings = readBindings();
        String defaultId = bindings == null ? null : bindings.path("defaultProfileId").asText(null);
        if (defaultId == null) {
            throw new IllegalStateException("未配置默认模型档案，请先在模型设置中配置");
        }
        Map<String, ModelApiProfileEntity> snapshot = new LinkedHashMap<>();
        for (String agentKey : agentKeys) {
            String overridePid = (bindings != null && bindings.path("overrides").hasNonNull(agentKey))
                    ? bindings.path("overrides").path(agentKey).asText()
                    : null;
            final String pid = overridePid != null ? overridePid : defaultId;
            ModelApiProfileEntity profile = profileRepository.findById(pid)
                    .orElseThrow(() -> new IllegalStateException(
                            "Agent [" + agentKey + "] 绑定的模型档案不存在：" + pid));
            if (!profile.isEnabled()) {
                throw new IllegalStateException("Agent [" + agentKey + "] 绑定的模型档案已禁用：" + profile.getDisplayName());
            }
            snapshot.put(agentKey, profile);
        }
        return snapshot;
    }

    public boolean isThinkingEnabled() {
        JsonNode node = readBindings();
        return node != null && node.path("thinkingEnabled").asBoolean(false);
    }

    private JsonNode readBindings() {
        return settingsRepository.findById(SETTINGS_ID)
                .map(e -> {
                    try {
                        return mapper.readTree(e.getBindingsJson());
                    } catch (Exception ex) {
                        return null;
                    }
                }).orElse(null);
    }

    // ---------- 视图转换（脱敏） ----------

    public Map<String, Object> toMaskedView(ModelApiProfileEntity entity) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("profileId", entity.getProfileId());
        view.put("displayName", entity.getDisplayName());
        view.put("providerType", entity.getProviderType());
        view.put("baseUrl", entity.getBaseUrl());
        view.put("modelName", entity.getModelName());
        view.put("apiKeyMasked", hasCredential(entity) ? "****" : null);
        view.put("thinkingModeSupported", entity.getThinkingModeSupported() != null
                ? entity.getThinkingModeSupported() : false);
        view.put("connectionStatus", entity.getConnectionStatus());
        view.put("lastErrorMessage", entity.getLastErrorMessage());
        view.put("lastTestedAt", entity.getLastTestedAt());
        view.put("enabled", entity.isEnabled());
        return view;
    }

    private boolean hasCredential(ModelApiProfileEntity entity) {
        return entity.getApiKeySecretRef() != null && entity.getApiKeySecretRef().startsWith("enc:");
    }
}
