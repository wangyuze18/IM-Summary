package com.imsummary.service;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.springframework.stereotype.Component;

/**
 * JSON 工具：容忍未知字段，导入解析不做业务推断。
 */
@Component
public class JsonHelper {

    private final ObjectMapper mapper = new ObjectMapper()
            // 评测导出包含 Instant；与 Spring MVC 保持一致，启用 classpath 中的 Java Time 模块。
            .findAndRegisterModules()
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    public ObjectMapper mapper() {
        return mapper;
    }

    public JsonNode parse(String json) throws Exception {
        return mapper.readTree(json);
    }

    public String toJson(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException("JSON 序列化失败", e);
        }
    }

    public String pretty(String json) {
        try {
            return mapper.writerWithDefaultPrettyPrinter().writeValueAsString(mapper.readTree(json));
        } catch (Exception e) {
            return json;
        }
    }

    /** 从模型输出中提取 JSON 对象文本（容错：剥离 markdown 代码块与前后杂讯） */
    public String extractJsonObject(String raw) {
        if (raw == null) {
            return "{}";
        }
        String text = raw.trim();
        // 剥离 ```json ... ``` 包裹
        if (text.startsWith("```")) {
            int firstNewline = text.indexOf('\n');
            int lastFence = text.lastIndexOf("```");
            if (firstNewline > 0 && lastFence > firstNewline) {
                text = text.substring(firstNewline + 1, lastFence).trim();
            }
        }
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return text.substring(start, end + 1);
        }
        return text;
    }

    /** 提取顶层 JSON 对象或数组；用于允许数组直出的重要消息任务。 */
    public String extractJsonValue(String raw) {
        if (raw == null) return "{}";
        String text = raw.trim();
        if (text.startsWith("```")) {
            int firstNewline = text.indexOf('\n');
            int lastFence = text.lastIndexOf("```");
            if (firstNewline > 0 && lastFence > firstNewline) {
                text = text.substring(firstNewline + 1, lastFence).trim();
            }
        }
        int objectStart = text.indexOf('{');
        int arrayStart = text.indexOf('[');
        if (arrayStart >= 0 && (objectStart < 0 || arrayStart < objectStart)) {
            int end = text.lastIndexOf(']');
            return end > arrayStart ? text.substring(arrayStart, end + 1) : text;
        }
        return extractJsonObject(text);
    }
}
