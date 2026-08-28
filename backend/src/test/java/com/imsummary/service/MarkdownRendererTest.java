package com.imsummary.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MarkdownRendererTest {

    private final JsonHelper json = new JsonHelper();
    private final MarkdownRenderer renderer = new MarkdownRenderer();

    @Test
    void rendersImportantMessagesAtTheEndGroupedByRealSpeakerName() throws Exception {
        JsonNode structured = json.parse("""
                {"groupName":"研发群","period":"2026-08-27","abstractPoints":["完成版本评审。"],
                 "keyInfo":["版本v1.2"],
                 "importantMessages":[{"messageId":"m1","speaker":"张三","content":"<p>请@李四今天修复登录问题&nbsp;</p>",
                 "reason":"阻塞发版"}]}
                """);

        String markdown = renderer.render(structured, "agent-workflow");

        assertThat(markdown).contains("### 重要消息", "#### 张三", "* 请@李四今天修复登录问题");
        assertThat(markdown).doesNotContain("### 重要事项", "[待办", " / 高]");
        assertThat(markdown.indexOf("### 重要消息")).isGreaterThan(markdown.indexOf("### 待解决问题与关键信息"));
        assertThat(markdown.strip()).endsWith("* **重要原因:** 阻塞发版");
    }

    @Test
    void omitsImportantSectionWhenNoImportantMessagesExist() throws Exception {
        JsonNode structured = json.parse("{\"groupName\":\"研发群\",\"importantMessages\":[]}");
        assertThat(renderer.render(structured, "single-model")).doesNotContain("### 重要消息");
    }

    @Test
    void groupsMultipleMessagesBySpeaker() throws Exception {
        JsonNode structured = json.parse("""
                {"groupName":"研发群","importantMessages":[
                {"messageId":"m1","speaker":"张三","content":"发布进行中","reason":"关键进度"},
                {"messageId":"m2","speaker":"张三","content":"发布已完成","reason":"关键里程碑"}]}
                """);

        String markdown = renderer.render(structured, "single-model");
        assertThat(markdown).contains("### 重要消息", "#### 张三", "发布进行中", "发布已完成");
        assertThat(markdown).doesNotContain("#### @张三");
    }

    @Test
    void stripsDecorativeEmoji() throws Exception {
        JsonNode structured = json.parse("""
                {"groupName":"⭐研发群","abstractPoints":["❗完成发布。"]}
                """);
        String markdown = renderer.render(structured, "agent-workflow");
        assertThat(markdown).doesNotContain("⭐", "❗");
        assertThat(markdown).contains("**分析模式:** 团队模式");
    }

    @Test
    void extractsTopLevelJsonArrayForImportanceModelOutput() throws Exception {
        String value = json.extractJsonValue("```json\n[{\"speaker\":\"张三\",\"content\":\"修复问题\"}]\n```");
        assertThat(json.parse(value).isArray()).isTrue();
        assertThat(json.parse(value)).hasSize(1);
    }
}
