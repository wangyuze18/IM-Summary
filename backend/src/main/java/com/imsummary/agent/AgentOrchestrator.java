package com.imsummary.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.imsummary.domain.*;
import com.imsummary.gateway.GatewayModels;
import com.imsummary.gateway.ModelCallException;
import com.imsummary.gateway.ModelGateway;
import com.imsummary.repository.*;
import com.imsummary.service.*;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;

/**
 * 双模式编排器。
 * 基础模式：摘要与重要消息两个模型直接并行，是公平 baseline。
 * 团队模式：事件账本 → 状态解析 → 双生成器并行 → 双审核器并行 → 单侧定向修订。
 */
@Component
public class AgentOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(AgentOrchestrator.class);

    public static final List<String> TEAM_AGENT_KEYS = List.of(
            "context_event", "state", "summary", "importance_extractor",
            "factual_auditor", "importance_auditor");
    public static final List<String> BASELINE_AGENT_KEYS = List.of("single_model", "importance_extractor");

    private static final Map<String, Integer> STEP_WEIGHT = Map.of(
            "context_event", 18, "state", 14, "summary", 22, "importance_extractor", 18,
            "factual_auditor", 14, "importance_auditor", 14, "single_model", 50);

    private final ExecutorService runExecutor = Executors.newFixedThreadPool(2);
    private final ExecutorService parallelExecutor = Executors.newFixedThreadPool(4);
    private final ModelGateway gateway;
    private final ModelProfileService profileService;
    private final SessionService sessionService;
    private final JsonHelper json;
    private final MarkdownRenderer markdownRenderer;
    private final AgentRunRepository runRepository;
    private final AgentStepRunRepository stepRepository;
    private final SummaryResultRepository summaryRepository;
    private final ConversationSessionRepository sessionRepository;
    private final SimpMessagingTemplate messaging;
    private final ObjectProvider<EvaluationService> evaluationServiceProvider;

    @Value("${imsummary.max-revision:2}")
    private int maxRevision;

    public AgentOrchestrator(ModelGateway gateway, ModelProfileService profileService,
                             SessionService sessionService, JsonHelper json,
                             MarkdownRenderer markdownRenderer,
                             AgentRunRepository runRepository, AgentStepRunRepository stepRepository,
                             SummaryResultRepository summaryRepository,
                             ConversationSessionRepository sessionRepository,
                             SimpMessagingTemplate messaging,
                             ObjectProvider<EvaluationService> evaluationServiceProvider) {
        this.gateway = gateway;
        this.profileService = profileService;
        this.sessionService = sessionService;
        this.json = json;
        this.markdownRenderer = markdownRenderer;
        this.runRepository = runRepository;
        this.stepRepository = stepRepository;
        this.summaryRepository = summaryRepository;
        this.sessionRepository = sessionRepository;
        this.messaging = messaging;
        this.evaluationServiceProvider = evaluationServiceProvider;
    }

    public AgentRunEntity startRun(String sessionId, String mode) {
        ConversationSessionEntity session = sessionService.requireSession(sessionId);
        boolean baseline = "single-model".equals(mode);
        List<String> keys = baseline ? BASELINE_AGENT_KEYS : TEAM_AGENT_KEYS;
        Map<String, ModelApiProfileEntity> snapshot = profileService.resolveRunSnapshot(keys);

        AgentRunEntity run = new AgentRunEntity();
        run.setRunId(UUID.randomUUID().toString());
        run.setSessionId(sessionId);
        run.setMode(baseline ? "single-model" : "agent-workflow");
        run.setStatus("queued");
        run.setOverallProgress(0);
        run.setStartedAt(Instant.now());
        run.setModelConfigSnapshotJson(json.toJson(buildSnapshotView(snapshot)));
        runRepository.save(run);

        int order = 0;
        for (String key : keys) {
            AgentStepRunEntity step = new AgentStepRunEntity();
            step.setRunId(run.getRunId());
            step.setAgentKey(key);
            step.setStatus("idle");
            step.setProgress(0);
            step.setStepOrder(order++);
            stepRepository.save(step);
        }

        boolean thinking = profileService.isThinkingEnabled();
        runExecutor.submit(() -> {
            try {
                if (baseline) executeBaseline(run, session, snapshot, thinking);
                else executeTeam(run, session, snapshot, thinking);
            } catch (Exception e) {
                failRun(run, e instanceof ModelCallException ? "MODEL_CALL_FAILED" : "RUN_FAILED", e.getMessage());
            }
        });
        return runRepository.findById(run.getRunId()).orElse(run);
    }

    /** 两个基础模型只共享原始输入，不共享推理结果或审核反馈。 */
    private void executeBaseline(AgentRunEntity run, ConversationSessionEntity session,
                                 Map<String, ModelApiProfileEntity> snapshot, boolean thinking) throws Exception {
        updateRun(run, "running");
        String dialogue = renderDialogue(session.getMessagesJson());
        String input = "群组信息：" + session.getGroupInfoJson() + "\n" + PromptTemplates.renderDialogue(dialogue);
        setStep(run, "single_model", "running", "摘要生成中");
        setStep(run, "importance_extractor", "running", "重要消息抽取中");

        Future<JsonNode> summaryFuture = parallelExecutor.submit(() -> callModel(snapshot, thinking,
                "single_model", PromptTemplates.SINGLE_MODEL_SYSTEM, input));
        Future<JsonNode> importanceFuture = parallelExecutor.submit(() -> normalizeImportantOutput(callModel(snapshot, thinking,
                "importance_extractor", PromptTemplates.IMPORTANCE_SYSTEM, input)));
        JsonNode summary;
        JsonNode importance;
        try {
            summary = summaryFuture.get();
            importance = importanceFuture.get();
        } catch (Exception e) {
            summaryFuture.cancel(true);
            importanceFuture.cancel(true);
            failActiveSteps(run, List.of("single_model", "importance_extractor"), rootMessage(e));
            throw unwrap(e);
        }
        finishStep(run, "single_model", "success", "摘要生成完成");
        finishStep(run, "importance_extractor", "success",
                "抽取 " + importance.path("importantMessages").size() + " 条重要消息");
        persistResult(run, session, mergeImportantMessages(summary, importance), "not_audited",
                null, null, null, null);
        updateRun(run, "completed");
        notifyRun(run, "run.completed", null);
    }

    private void executeTeam(AgentRunEntity run, ConversationSessionEntity session,
                             Map<String, ModelApiProfileEntity> snapshot, boolean thinking) throws Exception {
        updateRun(run, "running");
        String dialogue = renderDialogue(session.getMessagesJson());
        String groupContext = "群组信息：" + session.getGroupInfoJson();

        setStep(run, "context_event", "running", "重建话题、原子事件与证据");
        JsonNode context = callSerial(run, snapshot, thinking, "context_event",
                PromptTemplates.CONTEXT_EVENT_SYSTEM, groupContext + "\n" + PromptTemplates.renderDialogue(dialogue));
        finishStep(run, "context_event", "success", "识别 " + context.path("events").size() + " 个原子事件");

        setStep(run, "state", "running", "解析最终状态与覆盖关系");
        JsonNode state = callSerial(run, snapshot, thinking, "state", PromptTemplates.STATE_SYSTEM,
                "候选事件：\n" + json.toJson(context.path("events")) + "\n原始消息：\n" + dialogue);
        JsonNode ledger = mergeState(context.path("events"), state);
        finishStep(run, "state", "success", "共享证据账本已建立");

        String sharedFacts = groupContext + "\n共享证据账本（不得替代原文）：\n" + json.toJson(ledger)
                + "\n原始消息：\n" + dialogue;
        JsonNode summary = null;
        JsonNode importance = null;
        JsonNode summaryAudit = emptyAudit();
        JsonNode importanceAudit = emptyAudit();
        String summaryFeedback = "";
        String importanceFeedback = "";
        boolean reviseSummary = true;
        boolean reviseImportance = true;
        boolean warnings = false;

        for (int revision = 0; revision <= maxRevision; revision++) {
            if (revision > 0) {
                run.setRevisionNo(revision);
                run.setStatus("revising");
                runRepository.save(run);
                notifyRun(run, "run.revising", null);
            }

            Future<JsonNode> summaryFuture = null;
            Future<JsonNode> importanceFuture = null;
            if (reviseSummary) {
                setStep(run, "summary", revision == 0 ? "running" : "revising",
                        revision == 0 ? "并行生成摘要" : "只修订摘要问题");
                final String feedback = summaryFeedback;
                summaryFuture = parallelExecutor.submit(() -> callModel(snapshot, thinking, "summary",
                        PromptTemplates.SUMMARY_SYSTEM, sharedFacts + feedback));
            }
            if (reviseImportance) {
                setStep(run, "importance_extractor", revision == 0 ? "running" : "revising",
                        revision == 0 ? "并行抽取重要消息" : "只修订重要消息问题");
                final String feedback = importanceFeedback;
                importanceFuture = parallelExecutor.submit(() -> normalizeImportantOutput(callModel(snapshot, thinking,
                        "importance_extractor", PromptTemplates.IMPORTANCE_SYSTEM, sharedFacts + feedback)));
            }
            try {
                if (summaryFuture != null) summary = summaryFuture.get();
                if (importanceFuture != null) importance = importanceFuture.get();
            } catch (Exception e) {
                if (summaryFuture != null) summaryFuture.cancel(true);
                if (importanceFuture != null) importanceFuture.cancel(true);
                List<String> active = new ArrayList<>();
                if (reviseSummary) active.add("summary");
                if (reviseImportance) active.add("importance_extractor");
                failActiveSteps(run, active, rootMessage(e));
                throw unwrap(e);
            }
            if (reviseSummary) finishStep(run, "summary", "success", "摘要候选已生成");
            if (reviseImportance) finishStep(run, "importance_extractor", "success",
                    "重要消息候选 " + importance.path("importantMessages").size() + " 条");

            Future<JsonNode> summaryAuditFuture = null;
            Future<JsonNode> importanceAuditFuture = null;
            if (reviseSummary) {
                setStep(run, "factual_auditor", "running", "审核摘要事实、状态与遗漏");
                final JsonNode candidate = summary;
                summaryAuditFuture = parallelExecutor.submit(() -> callModel(snapshot, thinking, "factual_auditor",
                        PromptTemplates.FACTUAL_AUDITOR_SYSTEM, sharedFacts + "\n候选摘要：\n" + json.toJson(candidate)));
            }
            if (reviseImportance) {
                setStep(run, "importance_auditor", "running", "审核消息精确率、覆盖与原文保真");
                final JsonNode candidate = importance;
                importanceAuditFuture = parallelExecutor.submit(() -> callModel(snapshot, thinking, "importance_auditor",
                        PromptTemplates.IMPORTANCE_AUDITOR_SYSTEM,
                        sharedFacts + "\n候选重要消息：\n" + json.toJson(candidate.path("importantMessages"))));
            }
            try {
                if (summaryAuditFuture != null) summaryAudit = summaryAuditFuture.get();
                if (importanceAuditFuture != null) importanceAudit = importanceAuditFuture.get();
            } catch (Exception e) {
                if (summaryAuditFuture != null) summaryAuditFuture.cancel(true);
                if (importanceAuditFuture != null) importanceAuditFuture.cancel(true);
                List<String> active = new ArrayList<>();
                if (reviseSummary) active.add("factual_auditor");
                if (reviseImportance) active.add("importance_auditor");
                failActiveSteps(run, active, rootMessage(e));
                throw unwrap(e);
            }

            boolean summaryError = !summaryAudit.path("passed").asBoolean(false)
                    || hasSeverity(summaryAudit, "error");
            boolean importanceError = !importanceAudit.path("passed").asBoolean(false)
                    || hasSeverity(importanceAudit, "error");
            boolean summaryWarning = hasSeverity(summaryAudit, "warning");
            boolean importanceWarning = hasSeverity(importanceAudit, "warning");
            warnings = warnings || summaryWarning || importanceWarning;
            if (reviseSummary) finishStep(run, "factual_auditor", summaryError || summaryWarning ? "warning" : "success",
                    summaryError ? "摘要未通过，等待定向修订" : summaryWarning ? "摘要通过，存在警告" : "摘要审核通过");
            if (reviseImportance) finishStep(run, "importance_auditor", importanceError || importanceWarning ? "warning" : "success",
                    importanceError ? "重要消息未通过，等待定向修订" : importanceWarning ? "重要消息通过，存在警告" : "重要消息审核通过");

            reviseSummary = summaryError;
            reviseImportance = importanceError;
            if (!reviseSummary && !reviseImportance) break;
            if (revision == maxRevision) break;
            if (reviseSummary) {
                summaryFeedback = "\n只修订以下摘要审核问题，其他正确字段保持不变：\n"
                        + json.toJson(summaryAudit.path("issues")) + "\n上一版摘要：\n" + json.toJson(summary);
            }
            if (reviseImportance) {
                importanceFeedback = "\n只修订以下重要消息审核问题；content 必须重新核对原文：\n"
                        + json.toJson(importanceAudit.path("issues")) + "\n上一版重要消息：\n" + json.toJson(importance);
            }
        }

        boolean unresolved = reviseSummary || reviseImportance;
        JsonNode combined = mergeImportantMessages(summary, importance);
        persistResult(run, session, combined, unresolved || warnings ? "warning" : "passed",
                extractEvidence(ledger), ledger, summaryAudit, importanceAudit);
        updateRun(run, unresolved || warnings ? "completed_with_warning" : "completed");
        notifyRun(run, "run.completed", null);
    }

    private JsonNode callSerial(AgentRunEntity run, Map<String, ModelApiProfileEntity> snapshot,
                                boolean thinking, String key, String system, String input) throws Exception {
        try {
            return callModel(snapshot, thinking, key, system, input);
        } catch (Exception e) {
            finishStep(run, key, "error", rootMessage(e));
            throw e;
        }
    }

    private JsonNode callModel(Map<String, ModelApiProfileEntity> snapshot, boolean thinking,
                               String key, String system, String input) throws Exception {
        ModelApiProfileEntity profile = snapshot.get(key);
        if (profile == null) throw new IllegalStateException("缺少模型绑定：" + key);
        GatewayModels.ChatResponse response = gateway.chat(profile,
                new GatewayModels.ChatRequest(system,
                        List.of(new GatewayModels.ChatMessage("user", input)), 0.2, thinking));
        String value = "importance_extractor".equals(key)
                ? json.extractJsonValue(response.content()) : json.extractJsonObject(response.content());
        return json.parse(value);
    }

    private void persistResult(AgentRunEntity run, ConversationSessionEntity session,
                               JsonNode structured, String auditStatus, JsonNode evidence,
                               JsonNode ledger, JsonNode summaryAudit, JsonNode importanceAudit) {
        SummaryResultEntity result = new SummaryResultEntity();
        result.setSummaryId(UUID.randomUUID().toString());
        result.setSessionId(session.getSessionId());
        result.setRunId(run.getRunId());
        result.setMode(run.getMode());
        result.setVersion(nextSummaryVersion(session.getSessionId()));
        result.setStructuredJson(json.toJson(structured));
        result.setMarkdown(markdownRenderer.render(structured, run.getMode()));
        result.setEvidenceLinksJson(evidence == null ? null : json.toJson(evidence));
        result.setEventLedgerJson(ledger == null ? null : json.toJson(ledger));
        result.setSummaryAuditJson(summaryAudit == null ? null : json.toJson(summaryAudit));
        result.setImportanceAuditJson(importanceAudit == null ? null : json.toJson(importanceAudit));
        result.setAuditStatus(auditStatus);
        result.setGeneratedAt(Instant.now());
        summaryRepository.save(result);

        session.setCurrentSummaryId(result.getSummaryId());
        sessionRepository.save(session);
        evaluationServiceProvider.ifAvailable(service -> {
            try {
                service.markOutdatedForSession(session.getSessionId(), result.getSummaryId());
            } catch (Exception e) {
                log.warn("标记旧评测过期失败：{}", e.getMessage());
            }
        });
        run.setOverallProgress(100);
        runRepository.save(run);
    }

    private int nextSummaryVersion(String sessionId) {
        return summaryRepository.findBySessionIdOrderByVersionDesc(sessionId).stream()
                .mapToInt(SummaryResultEntity::getVersion).max().orElse(0) + 1;
    }

    private JsonNode mergeImportantMessages(JsonNode summary, JsonNode importance) {
        ObjectNode merged = summary != null && summary.isObject()
                ? ((ObjectNode) summary).deepCopy() : json.mapper().createObjectNode();
        merged.set("importantMessages", normalizeImportantOutput(importance).path("importantMessages").deepCopy());
        return merged;
    }

    private JsonNode normalizeImportantOutput(JsonNode raw) {
        ObjectNode normalized = json.mapper().createObjectNode();
        JsonNode messages = null;
        if (raw != null && raw.isArray()) messages = raw;
        if (raw != null && raw.isObject()) {
            for (String key : List.of("importantMessages", "important_messages", "messages", "items")) {
                if (raw.path(key).isArray()) {
                    messages = raw.path(key);
                    break;
                }
            }
            if (messages == null && (raw.hasNonNull("content") || raw.hasNonNull("speaker"))) {
                ArrayNode singleton = json.mapper().createArrayNode();
                singleton.add(raw.deepCopy());
                messages = singleton;
            }
        }
        normalized.set("importantMessages", messages == null ? json.mapper().createArrayNode() : messages.deepCopy());
        return normalized;
    }

    private JsonNode mergeState(JsonNode events, JsonNode stateResult) {
        Map<String, JsonNode> byId = new HashMap<>();
        for (JsonNode state : stateResult.path("events")) byId.put(state.path("eventId").asText(), state);
        ArrayNode merged = json.mapper().createArrayNode();
        for (JsonNode event : events) {
            ObjectNode copy = event.deepCopy();
            JsonNode state = byId.get(event.path("eventId").asText());
            if (state != null) {
                for (String field : List.of("state", "owner", "dueDate", "supersedes", "supersededBy", "statusReason")) {
                    if (state.has(field) && !state.get(field).isNull()) copy.set(field, state.get(field).deepCopy());
                }
            }
            merged.add(copy);
        }
        return merged;
    }

    private JsonNode extractEvidence(JsonNode ledger) {
        ArrayNode links = json.mapper().createArrayNode();
        for (JsonNode event : ledger) {
            if (event.path("evidenceMessageIds").isArray() && !event.path("evidenceMessageIds").isEmpty()) {
                ObjectNode link = json.mapper().createObjectNode();
                link.put("summaryPoint", event.path("content").asText());
                link.set("messageIds", event.path("evidenceMessageIds").deepCopy());
                links.add(link);
            }
        }
        return links;
    }

    private JsonNode emptyAudit() {
        ObjectNode report = json.mapper().createObjectNode();
        report.put("passed", true);
        report.set("issues", json.mapper().createArrayNode());
        return report;
    }

    private boolean hasSeverity(JsonNode report, String severity) {
        for (JsonNode issue : report.path("issues")) {
            if (severity.equals(issue.path("severity").asText())) return true;
        }
        return false;
    }

    private String renderDialogue(String messagesJson) {
        try {
            StringBuilder text = new StringBuilder();
            for (JsonNode message : json.parse(messagesJson)) {
                text.append(message.path("messageId").asText("?"))
                        .append(" | ").append(message.path("timestamp").asText(message.path("sentAt").asText("")))
                        .append(" | ").append(message.path("sender").asText(message.path("senderDisplayName").asText("未知")))
                        .append(": ").append(message.path("content").asText(""))
                        .append('\n');
            }
            return text.toString();
        } catch (Exception e) {
            return messagesJson == null ? "" : messagesJson;
        }
    }

    private List<Map<String, Object>> buildSnapshotView(Map<String, ModelApiProfileEntity> snapshot) {
        List<Map<String, Object>> view = new ArrayList<>();
        snapshot.forEach((key, profile) -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("agentKey", key);
            item.put("profileId", profile.getProfileId());
            item.put("providerType", profile.getProviderType());
            item.put("modelName", profile.getModelName());
            view.add(item);
        });
        return view;
    }

    private void updateRun(AgentRunEntity run, String status) {
        run.setStatus(status);
        if (Set.of("completed", "completed_with_warning", "failed").contains(status)) {
            run.setFinishedAt(Instant.now());
            if (!"failed".equals(status)) run.setOverallProgress(100);
        } else {
            recalcProgress(run);
        }
        runRepository.save(run);
        notifyRun(run, "run.progress", null);
    }

    private void failRun(AgentRunEntity run, String code, String message) {
        run.setStatus("failed");
        run.setErrorCode(code);
        run.setErrorMessage(truncate(message, 2000));
        run.setFinishedAt(Instant.now());
        runRepository.save(run);
        notifyRun(run, "run.failed", null);
    }

    private void setStep(AgentRunEntity run, String key, String status, String message) {
        stepRepository.findByRunIdAndAgentKey(run.getRunId(), key).ifPresent(step -> {
            step.setStatus(status);
            if ("running".equals(status) && step.getStartedAt() == null) step.setStartedAt(Instant.now());
            step.setShortMessage(truncate(message, 1000));
            stepRepository.save(step);
        });
        recalcProgress(run);
        notifyRun(run, "agent." + status, key);
    }

    private void finishStep(AgentRunEntity run, String key, String status, String message) {
        stepRepository.findByRunIdAndAgentKey(run.getRunId(), key).ifPresent(step -> {
            step.setStatus(status);
            step.setProgress(100);
            step.setFinishedAt(Instant.now());
            step.setShortMessage(truncate(message, 1000));
            stepRepository.save(step);
        });
        recalcProgress(run);
        notifyRun(run, "agent.completed", key);
    }

    private void failActiveSteps(AgentRunEntity run, List<String> keys, String message) {
        for (String key : keys) finishStep(run, key, "error", message);
    }

    private void recalcProgress(AgentRunEntity run) {
        List<AgentStepRunEntity> steps = stepRepository.findByRunIdOrderByStepOrderAsc(run.getRunId());
        int total = steps.stream().mapToInt(s -> STEP_WEIGHT.getOrDefault(s.getAgentKey(), 10)).sum();
        int done = 0;
        for (AgentStepRunEntity step : steps) {
            int weight = STEP_WEIGHT.getOrDefault(step.getAgentKey(), 10);
            if (Set.of("success", "warning").contains(step.getStatus())) done += weight;
            else if (Set.of("running", "revising").contains(step.getStatus())) done += weight / 2;
        }
        run.setOverallProgress(total == 0 ? 0 : Math.min(99, done * 100 / total));
        runRepository.save(run);
    }

    private void notifyRun(AgentRunEntity run, String event, String key) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("event", event);
            payload.put("runId", run.getRunId());
            payload.put("agentKey", key);
            payload.put("status", run.getStatus());
            payload.put("overallProgress", run.getOverallProgress());
            payload.put("revisionNo", run.getRevisionNo());
            messaging.convertAndSend("/topic/runs/" + run.getRunId(), payload);
        } catch (Exception e) {
            log.debug("进度推送失败：{}", e.getMessage());
        }
    }

    private Exception unwrap(Exception e) {
        Throwable cause = e instanceof ExecutionException && e.getCause() != null ? e.getCause() : e;
        return cause instanceof Exception ex ? ex : new RuntimeException(cause);
    }

    private String rootMessage(Exception e) {
        Throwable cause = e instanceof ExecutionException && e.getCause() != null ? e.getCause() : e;
        return cause.getMessage() == null ? cause.getClass().getSimpleName() : cause.getMessage();
    }

    private String truncate(String value, int max) {
        if (value == null) return null;
        return value.length() <= max ? value : value.substring(0, max);
    }

    @PreDestroy
    public void shutdown() {
        runExecutor.shutdownNow();
        parallelExecutor.shutdownNow();
    }
}
