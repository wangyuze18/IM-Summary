package com.imsummary.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ModelProfileServiceTest {

    private final ModelProfileService service = new ModelProfileService(null, null, null, null);

    @Test
    void detectsCommonReasoningModelFamiliesWithoutCallingTheModel() {
        assertTrue(service.supportsThinking("openai-compatible", "deepseek-r1"));
        assertTrue(service.supportsThinking("openai-compatible", "Qwen3-32B"));
        assertTrue(service.supportsThinking("openai-compatible", "gpt-o3-mini"));
        assertTrue(service.supportsThinking("anthropic", "claude-sonnet-4"));
        assertFalse(service.supportsThinking("openai-compatible", "gpt-4o-mini"));
    }
}
