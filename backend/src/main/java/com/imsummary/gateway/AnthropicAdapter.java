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
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Anthropic Messages API 适配器（/v1/messages）。
 */
@Component
public class AnthropicAdapter implements ModelProviderAdapter {

    private final ObjectMapper mapper = new ObjectMapper();
    private final int timeoutSeconds;

    public AnthropicAdapter(@Value("${imsummary.model-timeout-seconds:120}") int timeoutSeconds) {
        this.timeoutSeconds = timeoutSeconds;
    }

    @Override
    public String providerType() {
        return "anthropic";
    }

    private String endpoint(String baseUrl) {
        String normalized = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        return normalized.endsWith("/messages") ? normalized : normalized + "/messages";
    }

    private String modelsEndpoint(String baseUrl) {
        String normalized = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        if (normalized.endsWith("/messages")) {
            normalized = normalized.substring(0, normalized.length() - "/messages".length());
        }
        return normalized.endsWith("/models") ? normalized : normalized + "/models";
    }

    @Override
    public List<String> listModels(String baseUrl, String apiKey) throws Exception {
        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(30)).build();
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(modelsEndpoint(baseUrl)))
                .timeout(Duration.ofSeconds(Math.min(timeoutSeconds, 30)))
                .header("x-api-key", apiKey)
                .header("anthropic-version", "2023-06-01")
                .GET()
                .build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            throw new ModelCallException(response.statusCode(),
                    "获取模型列表失败（HTTP " + response.statusCode() + "）：" + shortError(response.body()));
        }
        JsonNode json = mapper.readTree(response.body());
        List<String> models = new ArrayList<>();
        for (JsonNode item : json.path("data")) {
            String id = item.path("id").asText("");
            if (!id.isBlank()) {
                models.add(id);
            }
        }
        models.sort(String.CASE_INSENSITIVE_ORDER);
        return models;
    }

    @Override
    public GatewayModels.ChatResponse chat(String baseUrl, String apiKey, String modelName,
                                           GatewayModels.ChatRequest request) throws Exception {
        ObjectNode body = buildBody(modelName, request, 8192);
        JsonNode json = post(endpoint(baseUrl), apiKey, body);
        StringBuilder content = new StringBuilder();
        boolean thinkingUsed = false;
        for (JsonNode block : json.path("content")) {
            if ("text".equals(block.path("type").asText())) {
                content.append(block.path("text").asText());
            } else if ("thinking".equals(block.path("type").asText())) {
                thinkingUsed = true;
            }
        }
        return new GatewayModels.ChatResponse(content.toString(), thinkingUsed, Map.of("model", modelName));
    }

    private ObjectNode buildBody(String modelName, GatewayModels.ChatRequest request, int maxTokens) {
        ObjectNode body = mapper.createObjectNode();
        body.put("model", modelName);
        body.put("max_tokens", maxTokens);
        if (request.system() != null && !request.system().isBlank()) {
            body.put("system", request.system());
        }
        ArrayNode messages = body.putArray("messages");
        for (GatewayModels.ChatMessage m : request.messages()) {
            messages.addObject().put("role", m.role()).put("content", m.content());
        }
        if (request.temperature() != null && !request.enableThinking()) {
            body.put("temperature", request.temperature());
        }
        if (request.enableThinking()) {
            // extended thinking：开启时不可设置 temperature
            ObjectNode thinking = body.putObject("thinking");
            thinking.put("type", "enabled");
            thinking.put("budget_tokens", 2048);
        }
        return body;
    }

    private JsonNode post(String url, String apiKey, ObjectNode body) throws Exception {
        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(30)).build();
        HttpRequest httpRequest = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(timeoutSeconds))
                .header("Content-Type", "application/json")
                .header("x-api-key", apiKey)
                .header("anthropic-version", "2023-06-01")
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body), StandardCharsets.UTF_8))
                .build();
        HttpResponse<String> response = client.send(httpRequest, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            throw new ModelCallException(response.statusCode(),
                    "模型调用失败（HTTP " + response.statusCode() + "）：" + shortError(response.body()));
        }
        return mapper.readTree(response.body());
    }

    private String shortError(String body) {
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
            ObjectNode body = buildBody(modelName, new GatewayModels.ChatRequest(
                    "Reply with the single word: ok",
                    java.util.List.of(new GatewayModels.ChatMessage("user", "ping")),
                    0.0, false), 16);
            JsonNode json = post(endpoint(baseUrl), apiKey, body);
            boolean ok = json.hasNonNull("content");
            String name = modelName == null ? "" : modelName.toLowerCase();
            boolean thinkingDetected = name.contains("claude");
            return new GatewayModels.TestResult(ok, ok ? null : "响应缺少 content 字段", thinkingDetected);
        } catch (Exception e) {
            return new GatewayModels.TestResult(false, e.getMessage(), false);
        }
    }
}
