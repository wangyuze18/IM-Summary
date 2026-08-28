package com.imsummary.service;

import com.imsummary.repository.ConversationSessionRepository;
import com.imsummary.repository.GoldenSummaryRepository;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class ImportServiceContractTest {

    private final JsonHelper json = new JsonHelper();
    private final ImportantMessageNormalizer normalizer = new ImportantMessageNormalizer(json);
    private final ImportService service = new ImportService(
            mock(ConversationSessionRepository.class), mock(GoldenSummaryRepository.class),
            json, new MarkdownRenderer(), normalizer);

    @Test
    void previewsValidImportantMessageLabels() {
        Map<String, Object> result = validate("""
                {
                  "scenarioPlan":{"evalSampleId":"E001"},
                  "group":{"groupName":"研发群","members":["u1"]},
                  "users":[{"userId":"u1","displayName":"钱伟"}],
                  "messages":[{"messageId":"m1","timestamp":"2026-08-17T01:00:00","senderUserId":"u1",
                    "senderDisplayName":"钱伟","content":"发布已完成"}],
                  "groundTruth":{
                    "goldenSummary":{"groupName":"研发群","period":"2026-08-17","abstractPoints":["发布已完成"],
                      "decisions":[],"todos":[],"topics":[],"openIssues":[],"keyInfo":[]},
                    "importantMessages":[{"messageId":"m1","speaker":"钱伟","content":"发布已完成","reason":"关键进度"}]
                  }
                }
                """);

        assertThat(result.get("status")).isEqualTo("ready_to_confirm");
        @SuppressWarnings("unchecked")
        Map<String, Object> preview = (Map<String, Object>) result.get("preview");
        assertThat(preview).containsEntry("importantMessagesProvided", true)
                .containsEntry("importantMessageCount", 1);
    }

    @Test
    void rejectsRemovedFieldsAndAtPrefixedSpeaker() {
        Map<String, Object> result = validate("""
                {
                  "group":{"groupName":"研发群"},
                  "users":[{"userId":"u1","displayName":"钱伟"}],
                  "messages":[{"messageId":"m1","senderDisplayName":"钱伟","content":"发布已完成"}],
                  "groundTruth":{
                    "goldenSummary":{"groupName":"研发群","abstractPoints":[]},
                    "importantMessages":[{"messageId":"m1","speaker":"@钱伟","content":"发布已完成","reason":"关键进度",
                      "type":"进度","priority":"高","stakeholders":["管理-@尤涛"]}]
                  }
                }
                """);

        assertThat(result.get("status")).isEqualTo("validation_failed");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> validation = (List<Map<String, Object>>) result.get("validation");
        assertThat(validation).extracting(item -> item.get("message").toString())
                .anyMatch(message -> message.contains("不再支持字段 type"))
                .anyMatch(message -> message.contains("不再支持字段 priority"))
                .anyMatch(message -> message.contains("不再支持字段 stakeholders"))
                .anyMatch(message -> message.contains("人物本名，不加 @"));
    }

    @Test
    void rejectsImportantMessagesNestedInsideGoldenSummary() {
        Map<String, Object> result = validate("""
                {
                  "group":{"groupName":"研发群"},
                  "users":[{"userId":"u1","displayName":"钱伟"}],
                  "messages":[{"messageId":"m1","senderDisplayName":"钱伟","content":"发布已完成"}],
                  "groundTruth":{"goldenSummary":{"groupName":"研发群","abstractPoints":[],
                    "importantMessages":[{"messageId":"m1","speaker":"钱伟","content":"发布已完成","reason":"关键进度"}]}}
                }
                """);

        assertThat(result.get("status")).isEqualTo("validation_failed");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> validation = (List<Map<String, Object>>) result.get("validation");
        assertThat(validation).extracting(item -> item.get("message").toString())
                .anyMatch(message -> message.contains("必须与 goldenSummary 并列"));
    }

    private Map<String, Object> validate(String value) {
        return service.validate("sample.json", value.getBytes(StandardCharsets.UTF_8));
    }
}
