package com.imsummary.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;

/**
 * 摘要 JSON → Markdown 渲染，对齐 docs/prompt-strategy/03_Markdown渲染规范.md。
 * 智能摘要与黄金摘要共用同一渲染模式（mode=golden 时标注分析模式为黄金摘要），便于人工对照。
 * 标题不含表情符号；空数组小节整体省略；实体原样保留。
 */
@Component
public class MarkdownRenderer {

    public String render(JsonNode structured, String mode) {
        StringBuilder sb = new StringBuilder();
        sb.append("# 工作群聊分析简报\n");
        sb.append("**群组名称:** ").append(text(structured.path("groupName"), "[未提供]")).append(" \n");
        sb.append("**报告周期:** ").append(text(structured.path("period"), "[未明确]")).append(" \n");
        sb.append("**分析模式:** ").append(modeLabel(mode)).append(" \n\n");
        sb.append("---\n\n");

        JsonNode abstractPoints = structured.path("abstractPoints");
        if (abstractPoints.isArray() && !abstractPoints.isEmpty()) {
            sb.append("### 摘要\n");
            for (JsonNode p : abstractPoints) {
                sb.append("* ").append(p.asText()).append(" \n");
            }
            sb.append("\n---\n\n");
        }

        JsonNode importantMessages = structured.path("importantMessages");
        if (importantMessages.isArray() && !importantMessages.isEmpty()) {
            sb.append("### 重要事项\n");
            java.util.LinkedHashMap<String, java.util.List<JsonNode>> grouped = new java.util.LinkedHashMap<>();
            for (JsonNode message : importantMessages) {
                JsonNode stakeholders = message.path("stakeholders");
                java.util.LinkedHashSet<String> employees = new java.util.LinkedHashSet<>();
                if (stakeholders.isArray() && !stakeholders.isEmpty()) {
                    for (JsonNode stakeholder : stakeholders) {
                        String employee = employeeName(stakeholder.asText(""));
                        if (employee != null) employees.add(employee);
                    }
                } else if (stakeholders.isTextual() && !stakeholders.asText().isBlank()) {
                    String employee = employeeName(stakeholders.asText());
                    if (employee != null) employees.add(employee);
                }
                // 没有明确受影响人时，按说话员工归档，避免再产生角色或“未明确”分组。
                if (employees.isEmpty()) {
                    String speaker = employeeName(message.path("speaker").asText(""));
                    employees.add(speaker == null ? "未明确" : speaker);
                }
                for (String employee : employees) {
                    grouped.computeIfAbsent(employee, k -> new java.util.ArrayList<>()).add(message);
                }
            }
            for (var entry : grouped.entrySet()) {
                sb.append("\n#### ").append(entry.getKey()).append("\n");
                for (JsonNode message : entry.getValue()) {
                    sb.append("* [").append(message.path("type").asText("其他")).append(" / ")
                            .append(message.path("priority").asText("中")).append("] **")
                            .append(message.path("speaker").asText("未明确")).append(":** ")
                            .append(cleanRichText(message.path("content").asText())).append("\n")
                            .append("  * **重要原因:** ").append(message.path("reason").asText("未明确")).append("\n");
                }
            }
            sb.append("\n---\n\n");
        }

        JsonNode decisions = structured.path("decisions");
        if (decisions.isArray() && !decisions.isEmpty()) {
            sb.append("### 决议事项\n");
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
            sb.append("### 待办事项 \n\n");
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
            sb.append("### 主要议题讨论 \n");
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
            sb.append("### 待解决问题与关键信息 \n");
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

        // 输出层统一移除装饰性表情。
        return sb.toString()
                .replaceAll("[\\x{1F000}-\\x{1FAFF}\\x{2600}-\\x{27BF}\\x{2B00}-\\x{2BFF}]", "")
                .replace("\uFE0F", "");
    }

    /** 分析模式标注：智能摘要两种模式 + 黄金摘要（人工参考） */
    private String modeLabel(String mode) {
        if ("agent-workflow".equals(mode)) {
            return "团队模式";
        }
        if ("golden".equals(mode)) {
            return "黄金摘要（人工参考）";
        }
        return "基础模式";
    }

    private String text(JsonNode node, String fallback) {
        String v = node.asText("");
        return v.isBlank() ? fallback : v;
    }

    /** 重要消息保留原文，只去除常见富文本标签并还原 HTML 实体。 */
    private String cleanRichText(String value) {
        String withoutTags = value.replaceAll(
                "(?i)</?(?:p|br|div|span|a|strong|em|blockquote)(?:\\s[^>]*)?>", "");
        return HtmlUtils.htmlUnescape(withoutTags).replace('\u00A0', ' ').trim();
    }

    /** stakeholder 可为“开发-@李四”；Markdown 只使用员工维度分组，不把角色带入标题。 */
    private String employeeName(String value) {
        if (value == null) return null;
        String normalized = value.trim();
        int at = normalized.indexOf('@');
        if (at >= 0) {
            String employee = normalized.substring(at).trim();
            return employee.length() > 1 ? employee : null;
        }
        if (normalized.isBlank() || "未明确".equals(normalized)) return null;
        // speaker 在旧数据中可能没有 @；stakeholder 的角色字符串不做员工推断。
        return normalized.contains("-") || normalized.contains("－") ? null : "@" + normalized;
    }
}
