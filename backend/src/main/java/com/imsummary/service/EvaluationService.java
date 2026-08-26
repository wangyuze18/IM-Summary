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
 * 评测服务：黄金摘要存在时计算 Accuracy / Recall / 关键信息遗漏率 / ROUGE-L。
 * ROUGE-L 本地计算；Accuracy/Recall/遗漏率由评测判官模型给出。
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

    public EvaluationService(EvaluationRecordRepository evaluationRepository,
                             SummaryResultRepository summaryRepository,
                             GoldenSummaryRepository goldenSummaryRepository,
                             ModelProfileService profileService,
                             ModelGateway gateway, JsonHelper json) {
        this.evaluationRepository = evaluationRepository;
        this.summaryRepository = summaryRepository;
        this.goldenSummaryRepository = goldenSummaryRepository;
        this.profileService = profileService;
        this.gateway = gateway;
        this.json = json;
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
            summary = summaryRepository.findBySessionIdOrderByVersionDesc(sessionId).stream()
                    .filter(s -> !"not_audited".equals(s.getAuditStatus()) || true)
                    .findFirst()
                    .orElseThrow(() -> new NoSuchElementException("该会话尚无摘要，请先运行分析"));
        }

        String generatedText = summary.getMarkdown() != null ? summary.getMarkdown()
                : summary.getStructuredJson();

        // 1) ROUGE-L：本地计算（summary 对 golden）
        double rougeL = rougeL(generatedText, golden.getContent());

        // 2) 判官模型：accuracy / recall / omission
        double accuracy;
        double recall;
        double omission;
        try {
            Map<String, ModelApiProfileEntity> snapshot =
                    profileService.resolveRunSnapshot(List.of("factual_auditor"));
            ModelApiProfileEntity judgeProfile = snapshot.get("factual_auditor");
            String judgeInput = "生成摘要：\n" + generatedText
                    + "\n\n黄金摘要（人工参考答案）：\n" + golden.getContent();
            GatewayModels.ChatResponse resp = gateway.chat(judgeProfile,
                    new GatewayModels.ChatRequest(PromptTemplates.EVALUATION_JUDGE_SYSTEM,
                            List.of(new GatewayModels.ChatMessage("user", judgeInput)),
                            0.0, false));
            JsonNode metrics = json.parse(json.extractJsonObject(resp.content()));
            accuracy = metrics.path("accuracy").asDouble(0.0);
            recall = metrics.path("recall").asDouble(0.0);
            omission = metrics.path("keyInformationOmissionRate").asDouble(Math.max(0, 1 - recall));
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
        record.setRecall(round(recall));
        record.setKeyInformationOmissionRate(round(omission));
        record.setRougeL(round(rougeL));
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
        metrics.put("recall", r.getRecall());
        metrics.put("keyInformationOmissionRate", r.getKeyInformationOmissionRate());
        metrics.put("rougeL", r.getRougeL());
        view.put("metrics", metrics);
        view.put("outdated", r.isOutdated());
        view.put("evaluatedAt", r.getEvaluatedAt());
        return view;
    }
}
