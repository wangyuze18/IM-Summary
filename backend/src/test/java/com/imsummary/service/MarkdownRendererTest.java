package com.imsummary.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MarkdownRendererTest {

    private final JsonHelper json = new JsonHelper();
    private final MarkdownRenderer renderer = new MarkdownRenderer();

    @Test
    void rendersImportantMessagesGroupedByEveryStakeholder() throws Exception {
        JsonNode structured = json.parse("""
                {"groupName":"研发群","period":"2026-08-27","abstractPoints":["完成版本评审。"],
                 "importantMessages":[{"speaker":"@张三","content":"请@李四今天修复登录问题","type":"待办","priority":"高",
                 "stakeholders":["开发-@李四","管理-@王五"],"reason":"阻塞发版"}]}
                """);

        String markdown = renderer.render(structured, "agent-workflow");

        assertThat(markdown).contains("### 工作简报", "#### 重要消息（按相关人员划分）");
        assertThat(markdown).contains("**开发-@李四**", "**管理-@王五**");
        assertThat(markdown).contains("[待办 / 高] **@张三:** 请@李四今天修复登录问题");
    }

    @Test
    void omitsBriefingWhenNoImportantMessagesExist() throws Exception {
        JsonNode structured = json.parse("{\"groupName\":\"研发群\",\"importantMessages\":[]}");
        assertThat(renderer.render(structured, "single-model")).doesNotContain("### 工作简报");
    }

    @Test
    void stripsDecorativeEmojiAndIgnoresLegacyPersonalHighlights() throws Exception {
        JsonNode structured = json.parse("""
                {"groupName":"⭐研发群","abstractPoints":["❗完成发布。"],
                 "personalHighlights":[{"content":"不应显示"}]}
                """);
        String markdown = renderer.render(structured, "agent-workflow");
        assertThat(markdown).doesNotContain("⭐", "❗", "个人", "不应显示");
        assertThat(markdown).contains("**分析模式:** 团队模式");
    }

    @Test
    void extractsTopLevelJsonArrayForImportanceCompatibility() throws Exception {
        String value = json.extractJsonValue("```json\n[{\"speaker\":\"@张三\",\"content\":\"修复问题\"}]\n```");
        assertThat(json.parse(value).isArray()).isTrue();
        assertThat(json.parse(value)).hasSize(1);
    }
}
