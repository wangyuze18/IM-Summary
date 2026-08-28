package com.imsummary.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;

/** 将模型输出和黄金标注收敛为当前重要消息契约。 */
@Component
public class ImportantMessageNormalizer {

    private final JsonHelper json;

    public ImportantMessageNormalizer(JsonHelper json) {
        this.json = json;
    }

    public ObjectNode normalize(JsonNode raw) {
        JsonNode messages = locateArray(raw);
        ObjectNode normalized = json.mapper().createObjectNode();
        normalized.set("importantMessages", normalizeArray(messages));
        return normalized;
    }

    public ArrayNode normalizeArray(JsonNode messages) {
        ArrayNode normalized = json.mapper().createArrayNode();
        if (messages == null || !messages.isArray()) return normalized;
        for (JsonNode message : messages) {
            if (!message.isObject()) continue;
            ObjectNode item = normalized.addObject();
            item.put("messageId", message.path("messageId").asText(""));
            item.put("speaker", realName(message.path("speaker").asText("")));
            item.put("content", message.path("content").asText(""));
            item.put("reason", message.path("reason").asText(""));
        }
        return normalized;
    }

    public String realName(String value) {
        if (value == null) return "";
        String name = value.trim();
        while (name.startsWith("@")) name = name.substring(1).trim();
        return name;
    }

    private JsonNode locateArray(JsonNode raw) {
        if (raw == null) return null;
        if (raw.isArray()) return raw;
        if (!raw.isObject()) return null;
        return raw.path("importantMessages").isArray() ? raw.path("importantMessages") : null;
    }
}
