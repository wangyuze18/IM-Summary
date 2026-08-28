package com.imsummary.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ImportantMessageNormalizerTest {

    private final JsonHelper json = new JsonHelper();
    private final ImportantMessageNormalizer normalizer = new ImportantMessageNormalizer(json);

    @Test
    void keepsOnlyCurrentFieldsAndNormalizesSpeakerToRealName() throws Exception {
        JsonNode raw = json.parse("""
                {"importantMessages":[{"messageId":"m1","speaker":"@钱伟","content":"已完成",
                "reason":"关键进度","type":"进度","priority":"高","stakeholders":["管理-@尤涛"]}]}
                """);

        JsonNode item = normalizer.normalize(raw).path("importantMessages").path(0);

        assertThat(item.size()).isEqualTo(4);
        assertThat(item.path("speaker").asText()).isEqualTo("钱伟");
        assertThat(item.has("type")).isFalse();
        assertThat(item.has("priority")).isFalse();
        assertThat(item.has("stakeholders")).isFalse();
    }
}
