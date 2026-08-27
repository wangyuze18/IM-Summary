package com.imsummary.api;

import com.imsummary.service.EvaluationService;
import com.imsummary.service.JsonHelper;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * 评测接口：启动评测、历史记录（按模式筛选）、导出（CSV/JSON/Markdown）。
 * 无自动对比能力，对比由人工基于导出数据完成。
 */
@RestController
@RequestMapping("/api/sessions/{sessionId}/evaluations")
public class EvaluationController {

    private final EvaluationService evaluationService;
    private final JsonHelper json;

    public EvaluationController(EvaluationService evaluationService, JsonHelper json) {
        this.evaluationService = evaluationService;
        this.json = json;
    }

    /** 启动评测：无黄金摘要时返回 409 NOT_EVALUABLE */
    @PostMapping
    public Map<String, Object> evaluate(@PathVariable String sessionId,
                                        @RequestBody(required = false) Map<String, String> body) {
        String summaryId = body == null ? null : body.get("summaryId");
        return evaluationService.evaluate(sessionId, summaryId);
    }

    /** 评测历史：?mode=agent-workflow|single-model */
    @GetMapping
    public List<Map<String, Object>> history(@PathVariable String sessionId,
                                             @RequestParam(required = false) String mode) {
        return evaluationService.history(sessionId, mode);
    }

    /** 导出：?format=csv|json|markdown，可选 ?mode= 过滤 */
    @GetMapping("/export")
    public ResponseEntity<byte[]> export(@PathVariable String sessionId,
                                         @RequestParam(defaultValue = "csv") String format,
                                         @RequestParam(required = false) String mode) {
        List<Map<String, Object>> records = evaluationService.history(sessionId, mode);
        String content = switch (format) {
            case "json" -> json.toJson(records);
            case "markdown" -> toMarkdown(sessionId, records);
            default -> toCsv(records);
        };
        String ext = "json".equals(format) ? "json" : ("markdown".equals(format) ? "md" : "csv");
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"evaluations." + ext + "\"")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(content.getBytes(StandardCharsets.UTF_8));
    }

    private String toCsv(List<Map<String, Object>> records) {
        StringBuilder sb = new StringBuilder();
        // BOM 便于 Excel 打开中文
        sb.append('\uFEFF');
        sb.append("evaluationId,sessionId,mode,summaryVersion,goldenVersion,summaryAccuracy,keyInformationOmissionRate,textSimilarity,llmScore,importantMessagePrecision,importantMessageRecall,outdated,evaluatedAt\n");
        for (Map<String, Object> r : records) {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = (Map<String, Object>) r.get("metrics");
            sb.append(r.get("evaluationId")).append(',')
                    .append(r.get("sessionId")).append(',')
                    .append(r.get("mode")).append(',')
                    .append(r.get("summaryVersion")).append(',')
                    .append(r.get("goldenVersion")).append(',')
                    .append(m.get("accuracy")).append(',')
                    .append(m.get("keyInformationOmissionRate")).append(',')
                    .append(m.get("rougeL")).append(',')
                    .append(m.get("llmScore")).append(',')
                    .append(m.get("importantMessagePrecision")).append(',')
                    .append(m.get("importantMessageRecall")).append(',')
                    .append(r.get("outdated")).append(',')
                    .append(r.get("evaluatedAt")).append('\n');
        }
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private String toMarkdown(String sessionId, List<Map<String, Object>> records) {
        StringBuilder sb = new StringBuilder();
        sb.append("# 评测历史报告（会话 ").append(sessionId).append("）\n\n");
        if (records.isEmpty()) {
            sb.append("暂无评测记录。\n");
            return sb.toString();
        }
        sb.append("| 模式 | 摘要版本 | 黄金版本 | 摘要准确率 | 摘要遗漏率 | 文本相似度 | 大模型评分 | 重要消息精确率 | 重要消息召回率 | 过期 | 时间 |\n");
        sb.append("| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n");
        for (Map<String, Object> r : records) {
            Map<String, Object> m = (Map<String, Object>) r.get("metrics");
            sb.append("| ").append(r.get("mode"))
                    .append(" | ").append(r.get("summaryVersion"))
                    .append(" | ").append(r.get("goldenVersion"))
                    .append(" | ").append(m.get("accuracy"))
                    .append(" | ").append(m.get("keyInformationOmissionRate"))
                    .append(" | ").append(m.get("rougeL"))
                    .append(" | ").append(m.get("llmScore"))
                    .append(" | ").append(m.get("importantMessagePrecision"))
                    .append(" | ").append(m.get("importantMessageRecall"))
                    .append(" | ").append(Boolean.TRUE.equals(r.get("outdated")) ? "是" : "否")
                    .append(" | ").append(r.get("evaluatedAt"))
                    .append(" |\n");
        }
        sb.append("\n> 双模式对比请导出 CSV 后人工分析；遗漏率越低越好。\n");
        return sb.toString();
    }
}
