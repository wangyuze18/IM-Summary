package com.imsummary.gateway;

import com.imsummary.domain.ModelApiProfileEntity;
import com.imsummary.repository.ModelApiProfileRepository;
import com.imsummary.security.CredentialStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Model Gateway：所有 Agent 统一通过它调用外部模型。
 * 职责：协议适配选择、凭据解密、超时/有限重试、错误标准化。
 */
@Component
public class ModelGateway {

    private static final Logger log = LoggerFactory.getLogger(ModelGateway.class);
    private static final int MAX_RETRY = 1;

    private final Map<String, ModelProviderAdapter> adapters;
    private final ModelApiProfileRepository profileRepository;
    private final CredentialStore credentialStore;

    public ModelGateway(List<ModelProviderAdapter> adapterList,
                        ModelApiProfileRepository profileRepository,
                        CredentialStore credentialStore) {
        this.adapters = adapterList.stream()
                .collect(Collectors.toMap(ModelProviderAdapter::providerType, Function.identity()));
        this.profileRepository = profileRepository;
        this.credentialStore = credentialStore;
    }

    public GatewayModels.ChatResponse chat(ModelApiProfileEntity profile, GatewayModels.ChatRequest request) {
        ModelProviderAdapter adapter = adapterFor(profile);
        String apiKey = resolveApiKey(profile);
        Exception last = null;
        for (int attempt = 0; attempt <= MAX_RETRY; attempt++) {
            try {
                return adapter.chat(profile.getBaseUrl(), apiKey, profile.getModelName(), request);
            } catch (ModelCallException e) {
                last = e;
                if (!e.isRetryable()) {
                    throw e;
                }
                log.warn("模型调用失败（可重试），attempt={} profile={}", attempt + 1, profile.getProfileId());
            } catch (Exception e) {
                // 网络/超时等异常包装为 httpStatus=0（可重试），参与重试循环
                last = new ModelCallException("模型调用异常：" + e.getMessage(), e);
                log.warn("模型调用失败（网络异常，可重试），attempt={} profile={}", attempt + 1, profile.getProfileId());
            }
        }
        throw new ModelCallException("模型调用失败（重试后仍失败）：" + last.getMessage(), last);
    }

    public GatewayModels.TestResult test(ModelApiProfileEntity profile) {
        ModelProviderAdapter adapter = adapterFor(profile);
        String apiKey = resolveApiKey(profile);
        return adapter.test(profile.getBaseUrl(), apiKey, profile.getModelName());
    }

    /** 直接基于未保存的草稿配置测试（不落库） */
    public GatewayModels.TestResult testDraft(String providerType, String baseUrl, String apiKey, String modelName) {
        ModelProviderAdapter adapter = adapters.get(providerType);
        if (adapter == null) {
            return new GatewayModels.TestResult(false, "不支持的协议类型：" + providerType, false);
        }
        return adapter.test(baseUrl, apiKey, modelName);
    }

    /** 基于草稿配置获取模型列表（不落库）；协议不支持或调用失败时抛 ModelCallException */
    public List<String> listModelsDraft(String providerType, String baseUrl, String apiKey) throws Exception {
        ModelProviderAdapter adapter = adapters.get(providerType);
        if (adapter == null) {
            throw new ModelCallException("不支持的协议类型：" + providerType, null);
        }
        return adapter.listModels(baseUrl, apiKey);
    }

    private ModelProviderAdapter adapterFor(ModelApiProfileEntity profile) {
        ModelProviderAdapter adapter = adapters.get(profile.getProviderType());
        if (adapter == null) {
            throw new ModelCallException("不支持的协议类型：" + profile.getProviderType(), null);
        }
        return adapter;
    }

    private String resolveApiKey(ModelApiProfileEntity profile) {
        try {
            return credentialStore.decryptRef(profile.getApiKeySecretRef());
        } catch (Exception e) {
            throw new ModelCallException("模型凭据无效，请在模型设置中重新保存 API Key", e);
        }
    }
}
