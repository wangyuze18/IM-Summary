package com.imsummary.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;

class EvaluationServiceTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final EvaluationService service = new EvaluationService(
            null, null, null, null, null, null, null);

    @Test
    void computesImportantMessageMetricsByStableMessageId() throws Exception {
        JsonNode generated = mapper.readTree("""
                [{"messageId":"m1"},{"messageId":"m2"},{"messageId":"m-extra"}]
                """);
        JsonNode golden = mapper.readTree("""
                [{"messageId":"m1"},{"messageId":"m2"},{"messageId":"m3"},{"messageId":"m4"}]
                """);

        assertArrayEquals(new double[]{2.0 / 3.0, 0.5},
                service.importantMessageMetrics(generated, golden), 1e-9);
    }

    @Test
    void treatsTwoEmptyImportantMessageSetsAsPerfect() throws Exception {
        JsonNode empty = mapper.readTree("[]");

        assertArrayEquals(new double[]{1.0, 1.0},
                service.importantMessageMetrics(empty, empty), 1e-9);
    }

    @Test
    void ignoresDuplicateIdsInsteadOfInflatingCounts() throws Exception {
        JsonNode generated = mapper.readTree("""
                [{"messageId":"m1"},{"messageId":"m1"}]
                """);
        JsonNode golden = mapper.readTree("[{\"messageId\":\"m1\"}]");

        assertArrayEquals(new double[]{1.0, 1.0},
                service.importantMessageMetrics(generated, golden), 1e-9);
    }
}
