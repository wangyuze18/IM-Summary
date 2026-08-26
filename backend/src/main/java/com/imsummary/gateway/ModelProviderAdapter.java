package com.imsummary.gateway;

/**
 * 模型协议适配器：将统一 ChatRequest 转换为具体供应商的 API 调用。
 */
public interface ModelProviderAdapter {

    /** 支持的 providerType */
    String providerType();

    /** 发起对话调用 */
    GatewayModels.ChatResponse chat(String baseUrl, String apiKey, String modelName,
                                    GatewayModels.ChatRequest request) throws Exception;

    /** 测试连接；实现应捕获异常并返回结构化结果 */
    GatewayModels.TestResult test(String baseUrl, String apiKey, String modelName);
}
