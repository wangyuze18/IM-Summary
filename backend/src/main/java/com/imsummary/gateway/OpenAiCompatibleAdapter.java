package com.imsummary.gateway;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * OpenAI 兼容协议适配器（/v1/chat/completions）。
 * 思考模式：对声明支持的模型附加 thinking 参数（尽力而为，供应商不支持时忽略）。
 */
@Component
public class OpenAiCompatibleAdapter implements ModelProviderAdapter {

    protected final ObjectMapper mapper = new ObjectMapper();
    private final int timeoutSeconds;

    public OpenAiCompatibleAdapter(@Value("${imsummary.model-timeout-seconds:120}") int timeoutSeconds) {
        this.timeoutSeconds = timeoutSeconds;
    }

    @Override
    public String providerType() {
        return "openai-compatible";
    }

    protected String endpoint(String baseUrl) {
        return endpointCandidates(baseUrl, "/chat/completions").get(0);
    }

    protected String modelsEndpoint(String baseUrl) {
        String normalized = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        if (normalized.endsWith("/chat/completions")) {
            normalized = normalized.substring(0, normalized.length() - "/chat/completions".length());
        }
        return endpointCandidates(normalized, "/models").get(0);
    }

    /**
     * 兼容用户填写服务根地址或完整 /v1 地址。保留显式路径的最高优先级，
     * 只在 URL path 中没有版本段时追加同主机的 /v1 回退候选。
     */
    protected List<String> endpointCandidates(String baseUrl, String suffix) {
        String normalized = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        if (normalized.endsWith(suffix)) {
            return List.of(normalized);
        }
        String direct = normalized + suffix;
        String path = URI.create(normalized).getPath();
        boolean hasVersionSegment = path != null && path.matches(".*/v\\d+(?:[^/]*)?(?:/.*)?$");
        return hasVersionSegment ? List.of(direct) : List.of(direct, normalized + "/v1" + suffix);
    }

    @Override
    public List<String> listModels(String baseUrl, String apiKey) throws Exception {
        Exception last = null;
        for (String candidate : endpointCandidates(stripChatSuffix(baseUrl), "/models")) {
            try {
                JsonNode json = get(candidate, apiKey);
                List<String> models = new ArrayList<>();
                for (JsonNode item : json.path("data")) {
                    String id = item.path("id").asText("");
                    if (!id.isBlank()) {
                        models.add(id);
                    }
                }
                if (!models.isEmpty()) {
                    models.sort(String.CASE_INSENSITIVE_ORDER);
                    return models;
                }
            } catch (Exception e) {
                if (isAuthenticationFailure(e)) throw e;
                last = e;
            }
        }
        if (last != null) throw last;
        return List.of();
    }

    private String stripChatSuffix(String baseUrl) {
        String normalized = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        return normalized.endsWith("/chat/completions")
                ? normalized.substring(0, normalized.length() - "/chat/completions".length())
                : normalized;
    }

    protected JsonNode get(String url, String apiKey) throws Exception {
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(30))
                .build();
        HttpRequest httpRequest = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(Math.min(timeoutSeconds, 30)))
                .header("Authorization", "Bearer " + apiKey)
                .GET()
                .build();
        HttpResponse<String> response = client.send(httpRequest, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 401) {
            throw new ModelCallException(response.statusCode(),
                    "获取模型列表失败（HTTP " + response.statusCode() + "）：" + shortError(response.body()));
        }
        return mapper.readTree(response.body());
    }

    @Override
    public GatewayModels.ChatResponse chat(String baseUrl, String apiKey, String modelName,
                                           GatewayModels.ChatRequest request) throws Exception {
        ObjectNode body = buildRequestBody(modelName, request);
        JsonNode json = postWithVersionFallback(baseUrl, apiKey, body);
        String content = json.path("choices").path(0).path("message").path("content").asText("");
        boolean thinkingUsed = request.enableThinking()
                && json.path("choices").path(0).path("message").has("reasoning_content");
        return new GatewayModels.ChatResponse(content, thinkingUsed, Map.of("model", modelName));
    }

    protected ObjectNode buildRequestBody(String modelName, GatewayModels.ChatRequest request) {
        ObjectNode body = mapper.createObjectNode();
        body.put("model", modelName);
        ArrayNode messages = body.putArray("messages");
        if (request.system() != null && !request.system().isBlank()) {
            messages.addObject().put("role", "system").put("content", request.system());
        }
        for (GatewayModels.ChatMessage m : request.messages()) {
            messages.addObject().put("role", m.role()).put("content", m.content());
        }
        if (request.temperature() != null) {
            body.put("temperature", request.temperature());
        }
        if (request.enableThinking()) {
            // 尽力而为：兼容部分国产/开源模型的 thinking 参数，其他供应商会忽略
            body.put("enable_thinking", true);
        }
        if (request.maxOutputTokens() != null) {
            body.put("max_tokens", request.maxOutputTokens());
        }
        return body;
    }

    protected JsonNode post(String url, String apiKey, ObjectNode body) throws Exception {
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(30))
                .build();
        HttpRequest httpRequest = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(timeoutSeconds))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body), java.nio.charset.StandardCharsets.UTF_8))
                .build();
        HttpResponse<String> response = client.send(httpRequest, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            throw new ModelCallException(response.statusCode(),
                    "模型调用失败（HTTP " + response.statusCode() + "）：" + shortError(response.body()));
        }
        return mapper.readTree(response.body());
    }

    protected JsonNode postWithVersionFallback(String baseUrl, String apiKey, ObjectNode body) throws Exception {
        Exception last = null;
        for (String candidate : endpointCandidates(baseUrl, "/chat/completions")) {
            try {
                return post(candidate, apiKey, body);
            } catch (Exception e) {
                if (isAuthenticationFailure(e)) throw e;
                last = e;
            }
        }
        if (last != null) throw last;
        throw new ModelCallException("OpenAI-compatible 服务地址无效", null);
    }

    private boolean isAuthenticationFailure(Exception e) {
        return e instanceof ModelCallException call
                && (call.getHttpStatus() == 401 || call.getHttpStatus() == 403);
    }

    /** 只提取简短错误信息，不回显完整响应体（可能含敏感内容） */
    protected String shortError(String body) {
        try {
            JsonNode node = mapper.readTree(body);
            String msg = node.path("error").path("message").asText("");
            return msg.isBlank() ? "请求被拒绝" : (msg.length() > 200 ? msg.substring(0, 200) : msg);
        } catch (Exception e) {
            return "请求被拒绝";
        }
    }

    @Override
    public GatewayModels.TestResult test(String baseUrl, String apiKey, String modelName) {
        try {
            ObjectNode body = buildRequestBody(modelName, new GatewayModels.ChatRequest(
                    "Reply with the single word: ok", 
                    java.util.List.of(new GatewayModels.ChatMessage("user", "ping")),
                    0.0, false));
            body.put("max_tokens", 1);
            JsonNode json = postWithVersionFallback(baseUrl, apiKey, body);
            boolean ok = json.hasNonNull("choices");
            boolean thinkingDetected = detectThinking(json, modelName);
            return new GatewayModels.TestResult(ok, ok ? null : "响应缺少 choices 字段", thinkingDetected);
        } catch (Exception e) {
            return new GatewayModels.TestResult(false, e.getMessage(), false);
        }
    }

    /**
     * 尽力检测思考模式支持：优先看响应结构，其次依据模型名启发式判断。
     * Demo 级实现，前端可人工在设置页覆盖。
     */
    protected boolean detectThinking(JsonNode json, String modelName) {
        String name = modelName == null ? "" : modelName.toLowerCase();
        return name.contains("think") || name.contains("reason") || name.contains("qwq") || name.contains("r1");
    }
}
