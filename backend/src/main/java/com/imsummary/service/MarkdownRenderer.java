package com.imsummary.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

/**
 * 摘要 JSON → Markdown 渲染，对齐 docs/prompt-strategy/03_Markdown渲染规范.md。
 * 空数组小节整体省略；实体原样保留。
 */
@Component
public class MarkdownRenderer {

    public String render(JsonNode structured, String mode) {
        StringBuilder sb = new StringBuilder();
        sb.append("# 工作群聊分析简报\n");
        sb.append("**群组名称:** ").append(text(structured.path("groupName"), "[未提供]")).append(" \n");
        sb.append("**报告周期:** ").append(text(structured.path("period"), "[未明确]")).append(" \n");
        sb.append("**分析模式:** ").append("agent-workflow".equals(mode) ? "Agent 团队模式" : "单模型基础模式").append(" \n\n");
        sb.append("---\n\n");

        JsonNode abstractPoints = structured.path("abstractPoints");
        if (abstractPoints.isArray() && !abstractPoints.isEmpty()) {
            sb.append("### 摘要\n");
            for (JsonNode p : abstractPoints) {
                sb.append("* ").append(p.asText()).append(" \n");
            }
            sb.append("\n---\n\n");
        }

        JsonNode highlights = structured.path("personalHighlights");
        if (highlights.isArray() && !highlights.isEmpty()) {
            sb.append("### ⭐ 与我相关的重点\n");
            int i = 1;
            for (JsonNode h : highlights) {
                sb.append("* **重点").append(i++).append(":** ").append(h.path("content").asText()).append(" \n");
                sb.append("  * **相关性:** ").append(h.path("reason").asText("未明确")).append(" \n");
                sb.append("  * **优先级:** ").append(h.path("priority").asText("中")).append(" \n");
            }
            sb.append("\n---\n\n");
        }

        JsonNode decisions = structured.path("decisions");
        if (decisions.isArray() && !decisions.isEmpty()) {
            sb.append("### ❗ 决议事项\n");
            int i = 1;
            for (JsonNode d : decisions) {
                sb.append("* **决议").append(i++).append(":** ").append(d.path("title").asText()).append(" \n");
                String context = d.path("context").asText("");
                if (!context.isBlank() && !"未明确".equals(context)) {
                    sb.append("  * **背景/上下文:** ").append(context).append(" \n");
                }
                sb.append("  * **状态:** ").append(d.path("status").asText("已达成")).append(" \n");
            }
            sb.append("\n---\n\n");
        }

        JsonNode todos = structured.path("todos");
        if (todos.isArray() && !todos.isEmpty()) {
            sb.append("### 📋 待办事项 \n\n");
            sb.append("| 优先级 | 任务内容 | 负责人 | 截止日期 | 状态 | \n");
            sb.append("| :--- | :--- | :--- | :--- | :--- | \n");
            for (JsonNode t : todos) {
                sb.append("| ").append(t.path("priority").asText("中"))
                        .append(" | ").append(t.path("task").asText())
                        .append(" | ").append(t.path("owner").asText("未明确"))
                        .append(" | ").append(t.path("dueDate").asText("未明确"))
                        .append(" | ").append(t.path("status").asText("待处理"))
                        .append(" | \n");
            }
            sb.append("\n---\n\n");
        }

        JsonNode topics = structured.path("topics");
        if (topics.isArray() && !topics.isEmpty()) {
            sb.append("### 💬 主要议题讨论 \n");
            int i = 1;
            for (JsonNode t : topics) {
                sb.append("**议题 ").append(i++).append(": ").append(t.path("title").asText()).append("** \n");
                sb.append("* **时间段:** ").append(t.path("timeRange").asText("未明确")).append(" \n");
                sb.append("* **主要参与者:** ").append(t.path("participants").asText("未明确")).append(" \n");
                sb.append("* **过程概述:** ").append(t.path("process").asText()).append(" \n");
                sb.append("* **核心结论:** ").append(t.path("conclusion").asText()).append(" \n\n");
            }
            sb.append("---\n\n");
        }

        JsonNode openIssues = structured.path("openIssues");
        JsonNode keyInfo = structured.path("keyInfo");
        if ((openIssues.isArray() && !openIssues.isEmpty()) || (keyInfo.isArray() && !keyInfo.isEmpty())) {
            sb.append("### ❓ 待解决问题与关键信息 \n");
            if (openIssues.isArray() && !openIssues.isEmpty()) {
                sb.append("* **待解决问题:** \n");
                int i = 1;
                for (JsonNode o : openIssues) {
                    sb.append("  ").append(i++).append(". ").append(o.asText()).append(" \n");
                }
            }
            if (keyInfo.isArray() && !keyInfo.isEmpty()) {
                sb.append("* **关键信息/文件:** \n");
                int i = 1;
                for (JsonNode k : keyInfo) {
                    sb.append("  ").append(i++).append(". ").append(k.asText()).append(" \n");
                }
            }
            sb.append("\n");
        }

        return sb.toString();
    }

    private String text(JsonNode node, String fallback) {
        String v = node.asText("");
        return v.isBlank() ? fallback : v;
    }
}
