package com.imsummary.service;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JsonHelperTest {

    @Test
    void serializesJavaTimeValuesUsedByEvaluationExports() {
        JsonHelper helper = new JsonHelper();
        String json = assertDoesNotThrow(() -> helper.toJson(Map.of(
                "evaluatedAt", Instant.parse("2026-08-28T05:10:00Z")
        )));

        assertTrue(json.contains("2026-08-28T05:10:00Z"));
    }
}
