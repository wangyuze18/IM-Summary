package com.imsummary.gateway;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class OpenAiCompatibleAdapterTest {

    @Test
    void fallsBackToV1ChatWhenUserProvidesServiceRoot() throws Exception {
        StubAdapter adapter = new StubAdapter();
        GatewayModels.ChatResponse response = adapter.chat(
                "https://model.example.com",
                "secret",
                "demo-model",
                new GatewayModels.ChatRequest(null,
                        List.of(new GatewayModels.ChatMessage("user", "ping")), 0.0, false)
        );

        assertEquals("ok", response.content());
        assertEquals(List.of(
                "https://model.example.com/chat/completions",
                "https://model.example.com/v1/chat/completions"
        ), adapter.requestedUrls);
    }

    @Test
    void keepsExplicitVersionPathWithoutAddingAnotherV1() throws Exception {
        StubAdapter adapter = new StubAdapter();
        adapter.failFirst = false;

        adapter.chat(
                "https://model.example.com/v1",
                "secret",
                "demo-model",
                new GatewayModels.ChatRequest(null,
                        List.of(new GatewayModels.ChatMessage("user", "ping")), 0.0, false)
        );

        assertEquals(List.of("https://model.example.com/v1/chat/completions"), adapter.requestedUrls);
    }

    private static final class StubAdapter extends OpenAiCompatibleAdapter {
        private final List<String> requestedUrls = new ArrayList<>();
        private boolean failFirst = true;

        private StubAdapter() {
            super(5);
        }

        @Override
        protected JsonNode post(String url, String apiKey, ObjectNode body) throws Exception {
            requestedUrls.add(url);
            if (failFirst && requestedUrls.size() == 1) {
                throw new ModelCallException(404, "not found");
            }
            return mapper.readTree("{\"choices\":[{\"message\":{\"content\":\"ok\"}}]}");
        }
    }
}
