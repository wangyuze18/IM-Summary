package com.imsummary.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.imsummary.domain.*;
import com.imsummary.gateway.GatewayModels;
import com.imsummary.gateway.ModelGateway;
import com.imsummary.agent.PromptTemplates;
import com.imsummary.repository.*;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;

/**
 * 评测服务：摘要四项与重要消息两项严格分开评测；llmScore 只评价摘要主体。
 * 不含自动对比能力；历史记录支持按模式筛选与导出。
 */
@Service
public class EvaluationService {

    private final EvaluationRecordRepository evaluationRepository;
    private final SummaryResultRepository summaryRepository;
    private final GoldenSummaryRepository goldenSummaryRepository;
    private final ModelProfileService profileService;
    private final ModelGateway gateway;
    private final JsonHelper json;
    private final MarkdownRenderer markdownRenderer;

    public EvaluationService(EvaluationRecordRepository evaluationRepository,
                             SummaryResultRepository summaryRepository,
                             GoldenSummaryRepository goldenSummaryRepository,
                             ModelProfileService profileService,
                             ModelGateway gateway, JsonHelper json,
                             MarkdownRenderer markdownRenderer) {
        this.evaluationRepository = evaluationRepository;
        this.summaryRepository = summaryRepository;
        this.goldenSummaryRepository = goldenSummaryRepository;
        this.profileService = profileService;
        this.gateway = gateway;
        this.json = json;
        this.markdownRenderer = markdownRenderer;
    }

    /**
     * 启动评测。无黄金摘要时抛 NOT_EVALUABLE 语义异常。
     */
    public Map<String, Object> evaluate(String sessionId, String summaryId) {
        GoldenSummaryEntity golden = goldenSummaryRepository
                .findTopBySessionIdOrderByGoldenVersionDesc(sessionId)
                .orElseThrow(() -> new IllegalStateException("NOT_EVALUABLE：该会话未携带黄金摘要"));

        SummaryResultEntity summary;
        if (summaryId != null && !summaryId.isBlank()) {
            summary = summaryRepository.findById(summaryId)
                    .orElseThrow(() -> new NoSuchElementException("摘要不存在：" + summaryId));
        } else {
            // 未指定时默认评测最新版本摘要（两种模式的产出均可评测）
            summary = summaryRepository.findBySessionIdOrderByVersionDesc(sessionId).stream()
                    .findFirst()
                    .orElseThrow(() -> new NoSuchElementException("该会话尚无摘要，请先运行分析"));
        }

        // 同一摘要与同一黄金版本只评一次，刷新页面或重复触发时直接复用历史结果。
        Optional<EvaluationRecordEntity> cached = evaluationRepository.findBySummaryId(summary.getSummaryId()).stream()
                .filter(record -> record.getGoldenVersion() == golden.getGoldenVersion() && !record.isOutdated())
                .max(Comparator.comparing(record -> Optional.ofNullable(record.getEvaluatedAt()).orElse(Instant.EPOCH)));
        if (cached.isPresent()) {
            return toView(cached.get());
        }

        JsonNode generatedStructured;
        try {
            generatedStructured = json.parse(summary.getStructuredJson());
        } catch (Exception e) {
            throw new IllegalStateException("摘要结构化数据损坏，无法评测");
        }
        String generatedText = summaryOnlyText(generatedStructured, summary.getMode());

        // 1) ROUGE-L：本地计算（summary 对 golden）
        double rougeL = rougeL(normalizeMarkdownForSimilarity(generatedText),
                normalizeMarkdownForSimilarity(golden.getContent()));

        // 2) 摘要判分：输入中明确移除 importantMessages，llm_score 只评价摘要。
        double accuracy;
        double omission;
        double llmScore;
        Double importantPrecision = null;
        Double importantRecall = null;
        try {
            Map<String, ModelApiProfileEntity> snapshot =
                    profileService.resolveRunSnapshot(List.of("evaluation_judge"));
            ModelApiProfileEntity judgeProfile = snapshot.get("evaluation_judge");
            String judgeInput = "生成摘要主体：\n" + generatedText
                    + "\n\n黄金摘要（人工参考答案）：\n" + golden.getContent();
            GatewayModels.ChatResponse resp = gateway.chat(judgeProfile,
                    new GatewayModels.ChatRequest(PromptTemplates.EVALUATION_JUDGE_SYSTEM,
                            List.of(new GatewayModels.ChatMessage("user", judgeInput)),
                            0.0, false, 128));
            JsonNode metrics = json.parse(json.extractJsonObject(resp.content()));
            accuracy = metrics.path("accuracy").asDouble(0.0);
            omission = metrics.path("keyInformationOmissionRate").asDouble(0.0);
            llmScore = Math.max(0, Math.min(100, metrics.path("llm_score").asDouble(0.0)));

            // 3) 重要消息有稳定 messageId 契约，直接做集合匹配，无需第二次 LLM 调用。
            if (golden.getImportantMessagesJson() != null) {
                JsonNode goldenImportant = json.parse(golden.getImportantMessagesJson());
                double[] importanceScores = importantMessageMetrics(generatedStructured.path("importantMessages"), goldenImportant);
                importantPrecision = round(importanceScores[0]);
                importantRecall = round(importanceScores[1]);
            }
        } catch (IllegalStateException configError) {
            throw configError;
        } catch (Exception e) {
            throw new IllegalStateException("评测失败（不影响摘要可用性）：" + e.getMessage());
        }

        EvaluationRecordEntity record = new EvaluationRecordEntity();
        record.setEvaluationId(UUID.randomUUID().toString());
        record.setSessionId(sessionId);
        record.setSummaryId(summary.getSummaryId());
        record.setSummaryVersion(summary.getVersion());
        record.setGoldenVersion(golden.getGoldenVersion());
        record.setMode(summary.getMode());
        record.setAccuracy(round(accuracy));
        record.setKeyInformationOmissionRate(round(omission));
        record.setRougeL(round(rougeL));
        record.setLlmScore(Math.round(llmScore * 10) / 10.0);
        record.setImportantMessagePrecision(importantPrecision);
        record.setImportantMessageRecall(importantRecall);
        record.setOutdated(false);
        record.setEvaluatedAt(Instant.now());
        evaluationRepository.save(record);

        return toView(record);
    }

    public List<Map<String, Object>> history(String sessionId, String mode) {
        List<EvaluationRecordEntity> records = (mode == null || mode.isBlank())
                ? evaluationRepository.findBySessionIdOrderByEvaluatedAtDesc(sessionId)
                : evaluationRepository.findBySessionIdAndModeOrderByEvaluatedAtDesc(sessionId, mode);
        return records.stream().map(this::toView).toList();
    }

    /** 新摘要产生后：该会话的历史评测记录标记过期（新摘要自身的记录除外） */
    public void markOutdatedForSession(String sessionId, String currentSummaryId) {
        evaluationRepository.findBySessionIdOrderByEvaluatedAtDesc(sessionId).forEach(r -> {
            if (!r.isOutdated() && !r.getSummaryId().equals(currentSummaryId)) {
                r.setOutdated(true);
                evaluationRepository.save(r);
            }
        });
    }

    /** 按摘要标记过期 */
    public void markOutdatedBySummary(String summaryId) {
        evaluationRepository.findBySummaryId(summaryId).forEach(r -> {
            r.setOutdated(true);
            evaluationRepository.save(r);
        });
    }

    // ---------- ROUGE-L（LCS） ----------

    double rougeL(String candidate, String reference) {
        List<String> c = tokenize(candidate);
        List<String> r = tokenize(reference);
        if (c.isEmpty() || r.isEmpty()) {
            return 0.0;
        }
        int lcs = lcsLength(c, r);
        if (lcs == 0) {
            return 0.0;
        }
        double precision = (double) lcs / c.size();
        double recall = (double) lcs / r.size();
        return 2 * precision * recall / (precision + recall);
    }

    /** 中文按字符、英文/数字按词切分 */
    private List<String> tokenize(String text) {
        List<String> tokens = new ArrayList<>();
        StringBuilder word = new StringBuilder();
        for (char ch : text.toLowerCase().toCharArray()) {
            if (Character.isLetterOrDigit(ch) && ch < 128) {
                word.append(ch);
            } else {
                if (word.length() > 0) {
                    tokens.add(word.toString());
                    word.setLength(0);
                }
                if (ch > 128 && !Character.isWhitespace(ch) && !Character.isISOControl(ch)) {
                    tokens.add(String.valueOf(ch));
                }
            }
        }
        if (word.length() > 0) {
            tokens.add(word.toString());
        }
        return tokens;
    }

    private int lcsLength(List<String> a, List<String> b) {
        int[] prev = new int[b.size() + 1];
        int[] curr = new int[b.size() + 1];
        for (int i = 1; i <= a.size(); i++) {
            for (int j = 1; j <= b.size(); j++) {
                curr[j] = a.get(i - 1).equals(b.get(j - 1))
                        ? prev[j - 1] + 1
                        : Math.max(prev[j], curr[j - 1]);
            }
            int[] tmp = prev;
            prev = curr;
            curr = tmp;
        }
        return prev[b.size()];
    }

    private double round(double v) {
        return Math.round(v * 10000) / 10000.0;
    }

    /** 精确率/召回率按 messageId 主键计算；空集合遵循常用集合评测约定。 */
    double[] importantMessageMetrics(JsonNode generated, JsonNode golden) {
        Set<String> generatedIds = messageIds(generated);
        Set<String> goldenIds = messageIds(golden);
        Set<String> matched = new HashSet<>(generatedIds);
        matched.retainAll(goldenIds);
        double precision = generatedIds.isEmpty() ? (goldenIds.isEmpty() ? 1.0 : 0.0)
                : (double) matched.size() / generatedIds.size();
        double recall = goldenIds.isEmpty() ? 1.0 : (double) matched.size() / goldenIds.size();
        return new double[]{precision, recall};
    }

    private Set<String> messageIds(JsonNode messages) {
        Set<String> ids = new HashSet<>();
        if (messages != null && messages.isArray()) {
            for (JsonNode message : messages) {
                String id = message.path("messageId").asText("").trim();
                if (!id.isBlank()) ids.add(id);
            }
        }
        return ids;
    }

    private String summaryOnlyText(JsonNode structured, String mode) {
        if (!structured.isObject()) return json.toJson(structured);
        com.fasterxml.jackson.databind.node.ObjectNode copy =
                ((com.fasterxml.jackson.databind.node.ObjectNode) structured).deepCopy();
        copy.remove("importantMessages");
        return markdownRenderer.render(copy, mode);
    }

    /** 文本相似度只比较可读内容，排除 Markdown 标记和生成模式标签。 */
    private String normalizeMarkdownForSimilarity(String markdown) {
        if (markdown == null) return "";
        return markdown
                .replaceAll("(?m)^\\*\\*分析模式:.*$", "")
                .replaceAll("(?m)^#{1,6}\\s*", "")
                .replaceAll("[*_`>|:-]", " ")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private Map<String, Object> toView(EvaluationRecordEntity r) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("evaluationId", r.getEvaluationId());
        view.put("sessionId", r.getSessionId());
        view.put("summaryId", r.getSummaryId());
        view.put("summaryVersion", r.getSummaryVersion());
        view.put("goldenVersion", r.getGoldenVersion());
        view.put("mode", r.getMode());
        Map<String, Object> metrics = new LinkedHashMap<>();
        metrics.put("accuracy", r.getAccuracy());
        metrics.put("keyInformationOmissionRate", r.getKeyInformationOmissionRate());
        metrics.put("rougeL", r.getRougeL());
        metrics.put("llmScore", r.getLlmScore());
        metrics.put("importantMessagePrecision", r.getImportantMessagePrecision());
        metrics.put("importantMessageRecall", r.getImportantMessageRecall());
        metrics.put("importantMessagesEvaluable", r.getImportantMessagePrecision() != null);
        view.put("metrics", metrics);
        view.put("outdated", r.isOutdated());
        view.put("evaluatedAt", r.getEvaluatedAt());
        return view;
    }
}
