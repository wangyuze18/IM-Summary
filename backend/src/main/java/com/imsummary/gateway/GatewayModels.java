package com.imsummary.gateway;

import java.util.List;
import java.util.Map;

/**
 * Model Gateway 统一请求/响应对象（屏蔽供应商差异）。
 */
public final class GatewayModels {

    private GatewayModels() {
    }

    public record ChatMessage(String role, String content) {
    }

    /**
     * @param system        系统提示词（可为 null）
     * @param messages      对话消息
     * @param temperature   温度（可为 null，使用供应商默认）
     * @param enableThinking 思考模式开关（仅对声明支持的模型生效）
     */
    public record ChatRequest(
            String system,
            List<ChatMessage> messages,
            Double temperature,
            boolean enableThinking,
            Integer maxOutputTokens
    ) {
        public ChatRequest(String system, List<ChatMessage> messages, Double temperature, boolean enableThinking) {
            this(system, messages, temperature, enableThinking, null);
        }
    }

    /**
     * @param content      模型输出文本
     * @param thinkingUsed 本次调用是否实际启用思考模式
     * @param raw          供应商原始响应（仅诊断用，不落盘明文敏感信息）
     */
    public record ChatResponse(String content, boolean thinkingUsed, Map<String, Object> raw) {
    }

    /**
     * @param success              调用是否成功
     * @param errorMessage         标准化错误信息（不含密钥/请求头）
     * @param thinkingModeDetected 是否检测到模型支持思考模式（尽力而为）
     */
    public record TestResult(boolean success, String errorMessage, boolean thinkingModeDetected) {
    }
}
