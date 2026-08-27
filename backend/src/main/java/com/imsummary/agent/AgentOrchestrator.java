package com.imsummary.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.imsummary.domain.*;
import com.imsummary.gateway.GatewayModels;
import com.imsummary.gateway.ModelCallException;
import com.imsummary.gateway.ModelGateway;
import com.imsummary.repository.*;
import com.imsummary.service.EvaluationService;
import com.imsummary.service.JsonHelper;
import com.imsummary.service.MarkdownRenderer;
import com.imsummary.service.ModelProfileService;
import com.imsummary.service.SessionService;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;

/**
 * Agent 编排器：两种模式均产出“智能摘要 + 原始重要消息”两个任务结果。
 *
 * DAG：
 *   Stage 1 Context & Event
 *   Stage 2 State ∥ User Context（并行）
 *   Stage 3 Personalized Relevance
 *   Stage 4 Summary
 *   Stage 5 Factual Auditor ∥ Personalization Auditor（并行）→ pass / 定向修订
 */
@Component
public class AgentOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(AgentOrchestrator.class);

    /** agent-workflow 的 7 个 Agent 键（顺序用于快照解析与进度权重） */
    public static final List<String> WORKFLOW_AGENT_KEYS = List.of(
            "context_event", "state", "user_context", "relevance",
            "summary", "importance_extractor", "factual_auditor", "personalization_auditor");

    private static final List<String> SINGLE_AGENT_KEYS = List.of("single_model", "importance_extractor");

    /** 各阶段进度权重（编排器计算，前端不自行推算） */
    private static final Map<String, Integer> STEP_WEIGHT = Map.of(
            "context_event", 16, "state", 10, "user_context", 10, "relevance", 10,
            "summary", 18, "importance_extractor", 16, "factual_auditor", 10, "personalization_auditor", 10,
            "single_model", 84);

    private final ExecutorService executor = Executors.newFixedThreadPool(2);
    private final ExecutorService parallelGroup = Executors.newFixedThreadPool(4);

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
    private final org.springframework.beans.factory.ObjectProvider<EvaluationService> evaluationServiceProvider;

    @Value("${imsummary.max-revision:2}")
    private int maxRevision;

    public AgentOrchestrator(ModelGateway gateway, ModelProfileService profileService,
                             SessionService sessionService, JsonHelper json,
                             MarkdownRenderer markdownRenderer,
                             AgentRunRepository runRepository, AgentStepRunRepository stepRepository,
                             SummaryResultRepository summaryRepository,
                             ConversationSessionRepository sessionRepository,
                             SimpMessagingTemplate messaging,
                             org.springframework.beans.factory.ObjectProvider<EvaluationService> evaluationServiceProvider) {
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

    /**
     * 启动分析运行：解析模型配置快照、创建 Run/Step 记录，异步执行。
     * 配置无效时抛出异常，Run 不创建。
     */
    public AgentRunEntity startRun(String sessionId, String mode, String targetUserId) {
        ConversationSessionEntity session = sessionService.requireSession(sessionId);
        List<String> agentKeys = "single-model".equals(mode) ? SINGLE_AGENT_KEYS : WORKFLOW_AGENT_KEYS;
        // 启动前解析并校验所有实际使用的 Agent 配置（无效则阻断）
        Map<String, ModelApiProfileEntity> snapshot = profileService.resolveRunSnapshot(agentKeys);

        AgentRunEntity run = new AgentRunEntity();
        run.setRunId(UUID.randomUUID().toString());
        run.setSessionId(sessionId);
        run.setMode(mode);
        run.setStatus("queued");
        run.setOverallProgress(0);
        run.setStartedAt(Instant.now());
        run.setTargetUserId(targetUserId != null && !targetUserId.isBlank()
                ? targetUserId : session.getTargetUserId());
        run.setModelConfigSnapshotJson(json.toJson(buildSnapshotView(snapshot)));
        runRepository.save(run);

        int order = 0;
        for (String key : agentKeys) {
            AgentStepRunEntity step = new AgentStepRunEntity();
            step.setRunId(run.getRunId());
            step.setAgentKey(key);
            step.setStatus("idle");
            step.setStepOrder(order++);
            stepRepository.save(step);
        }

        boolean thinking = profileService.isThinkingEnabled();
        executor.submit(() -> {
            try {
                if ("single-model".equals(mode)) {
                    executeSingleModel(run, session, snapshot, thinking);
                } else {
                    executeWorkflow(run, session, snapshot, thinking);
                }
            } catch (Exception e) {
                failRun(run, "RUN_FAILED", e.getMessage());
            }
        });
        return runRepository.findById(run.getRunId()).orElse(run);
    }

    // ==================== agent-workflow 模式 ====================

    private void executeWorkflow(AgentRunEntity run, ConversationSessionEntity session,
                                 Map<String, ModelApiProfileEntity> snapshot, boolean thinking)
            throws Exception {
        updateRun(run, "running");
        String dialogue = renderDialogue(session.getMessagesJson());
        String groupContext = "群组信息：" + session.getGroupInfoJson();

        // Stage 1：Context & Event
        setStep(run, "context_event", "running", "主题与事件抽取");
        JsonNode contextEvent = callAgentJson(run, snapshot, thinking, "context_event",
                PromptTemplates.CONTEXT_EVENT_SYSTEM,
                groupContext + "\n\n" + PromptTemplates.renderDialogue(dialogue)
                        + "请输出主题与事件的 JSON。");
        finishStep(run, "context_event", "success",
                "抽取 " + contextEvent.path("events").size() + " 个事件");
        notify(run, "agent.completed", "context_event");

        // Stage 2：State ∥ User Context（并行）
        // 子任务只写自己的 step 记录；run 状态/进度变更统一由主编排线程处理，避免跨线程竞态
        setStep(run, "state", "running", "决议/待办/状态判断");
        setStep(run, "user_context", "running", "职位/职责/关系上下文");
        Future<JsonNode> stateFuture = parallelGroup.submit(() -> {
            try {
                return callModel(snapshot, thinking, "state",
                        PromptTemplates.STATE_SYSTEM,
                        "初始事件列表：\n" + json.toJson(contextEvent.path("events"))
                                + "\n\n相关证据消息：\n" + dialogue
                                + "\n请输出状态判断 JSON。");
            } catch (Exception e) {
                markStepError(run.getRunId(), "state", e.getMessage());
                throw e;
            }
        });
        Future<JsonNode> userContextFuture = parallelGroup.submit(() -> {
            try {
                return callModel(snapshot, thinking, "user_context",
                        PromptTemplates.USER_CONTEXT_SYSTEM,
                        buildUserContextInput(session, run.getTargetUserId())
                                + "\n请输出 User Context Card JSON。");
            } catch (Exception e) {
                markStepError(run.getRunId(), "user_context", e.getMessage());
                throw e;
            }
        });
        JsonNode stateResult;
        JsonNode userContextCard;
        try {
            stateResult = stateFuture.get();
            userContextCard = userContextFuture.get();
        } catch (Exception e) {
            stateFuture.cancel(true);
            userContextFuture.cancel(true);
            failSteps(run, List.of("state", "user_context"));
            markGroupFailure(run, e);
            Throwable cause = e instanceof ExecutionException && e.getCause() != null ? e.getCause() : e;
            throw cause instanceof Exception ex ? ex : new RuntimeException(cause);
        }
        finishStep(run, "state", "success", "状态校验完成");
        finishStep(run, "user_context", "success", "用户上下文构造完成");
        notify(run, "agent.completed", "state");
        notify(run, "agent.completed", "user_context");

        // 合并状态到事件
        JsonNode validatedEvents = mergeState(contextEvent.path("events"), stateResult);

        // Stage 3：Personalized Relevance
        setStep(run, "relevance", "running", "用户相关性与重要性");
        JsonNode relevance = callAgentJson(run, snapshot, thinking, "relevance",
                PromptTemplates.RELEVANCE_SYSTEM,
                "已校验事件：\n" + json.toJson(validatedEvents)
                        + "\n\nUser Context Card：\n" + json.toJson(userContextCard)
                        + "\n请输出个性化相关性 JSON。");
        finishStep(run, "relevance", "success", "相关性排序完成");
        notify(run, "agent.completed", "relevance");

        // 独立任务：重要消息必须从原始对话抽取，不能从摘要事件反推。
        setStep(run, "importance_extractor", "running", "按人员抽取原始重要消息");
        JsonNode importance = callAgentJson(run, snapshot, thinking, "importance_extractor",
                PromptTemplates.IMPORTANCE_SYSTEM,
                PromptTemplates.renderDialogue(dialogue)
                        + "\n已校验事件与状态（仅用于消歧和查漏，content 仍须取原文）：\n" + json.toJson(validatedEvents)
                        + "\n角色相关性排序（用于 stakeholders 分组）：\n" + json.toJson(relevance)
                        + "\n用户画像：\n" + session.getUsersJson());
        finishStep(run, "importance_extractor", "success",
                "抽取 " + importance.path("importantMessages").size() + " 条重要消息");
        notify(run, "agent.completed", "importance_extractor");

        // Stage 4 + Stage 5 修订闭环
        int revisionNo = 0;
        String revisionFeedback = null;
        JsonNode summaryStructured;
        boolean auditPassed = false;
        boolean onlyWarnings = false;
        while (true) {
            // Stage 4：Summary
            setStep(run, "summary", revisionNo > 0 ? "revising" : "running",
                    revisionNo > 0 ? "按审核意见定向修订（第 " + revisionNo + " 次）" : "结构化摘要生成");
            if (revisionNo > 0) {
                run.setRevisionNo(revisionNo);
                run.setStatus("revising");
                runRepository.save(run);
                notify(run, "summary.revising", "summary");
            }
            String summaryInput = "当前有效事件（含状态）：\n" + json.toJson(validatedEvents)
                    + "\n\n个性化排序：\n" + json.toJson(relevance)
                    + "\n\n群组信息：" + session.getGroupInfoJson();
            if (revisionFeedback != null) {
                summaryInput += "\n\n上一轮审核发现的问题，请定向修订：\n" + revisionFeedback;
            }
            summaryStructured = callAgentJson(run, snapshot, thinking, "summary",
                    PromptTemplates.SUMMARY_SYSTEM,
                    summaryInput + "\n请输出结构化摘要 JSON。");
            summaryStructured = mergeImportantMessages(summaryStructured, importance);
            finishStep(run, "summary", "success", "摘要生成完成");
            notify(run, "agent.completed", "summary");

            // Stage 5：Factual ∥ Personalization Auditor（并行）
            setStep(run, "factual_auditor", "running", "事实/遗漏/状态审核");
            setStep(run, "personalization_auditor", "running", "个性化合理性审核");
            final JsonNode finalSummary = summaryStructured;
            Future<JsonNode> factualFuture = parallelGroup.submit(() -> {
                try {
                    return callModel(snapshot, thinking, "factual_auditor",
                            PromptTemplates.FACTUAL_AUDITOR_SYSTEM,
                            "原始消息：\n" + dialogue
                                    + "\n\n事件（含状态）：\n" + json.toJson(validatedEvents)
                                    + "\n\n摘要：\n" + json.toJson(finalSummary)
                                    + "\n请输出事实审核报告 JSON。");
                } catch (Exception e) {
                    markStepError(run.getRunId(), "factual_auditor", e.getMessage());
                    throw e;
                }
            });
            Future<JsonNode> personalFuture = parallelGroup.submit(() -> {
                try {
                    return callModel(snapshot, thinking, "personalization_auditor",
                            PromptTemplates.PERSONALIZATION_AUDITOR_SYSTEM,
                            "User Context Card：\n" + json.toJson(userContextCard)
                                    + "\n\n个性化事件：\n" + json.toJson(relevance)
                                    + "\n\n摘要：\n" + json.toJson(finalSummary)
                                    + "\n请输出个性化审核报告 JSON。");
                } catch (Exception e) {
                    markStepError(run.getRunId(), "personalization_auditor", e.getMessage());
                    throw e;
                }
            });
            JsonNode factualReport;
            JsonNode personalReport;
            try {
                factualReport = factualFuture.get();
                personalReport = personalFuture.get();
            } catch (Exception e) {
                factualFuture.cancel(true);
                personalFuture.cancel(true);
                failSteps(run, List.of("factual_auditor", "personalization_auditor"));
                markGroupFailure(run, e);
                Throwable cause = e instanceof ExecutionException && e.getCause() != null ? e.getCause() : e;
                throw cause instanceof Exception ex ? ex : new RuntimeException(cause);
            }
            notify(run, "agent.completed", "factual_auditor");
            notify(run, "agent.completed", "personalization_auditor");

            boolean factualPassed = factualReport.path("passed").asBoolean(false);
            boolean personalPassed = personalReport.path("passed").asBoolean(false);
            boolean hasError = hasSeverity(factualReport, "error") || hasSeverity(personalReport, "error");
            boolean hasWarning = hasSeverity(factualReport, "warning") || hasSeverity(personalReport, "warning");
            auditPassed = factualPassed && personalPassed;

            if (auditPassed || !hasError) {
                finishStep(run, "factual_auditor", hasWarning && !factualPassed ? "warning" : "success",
                        factualPassed ? "事实审核通过" : "事实审核有警告项");
                finishStep(run, "personalization_auditor", hasWarning && !personalPassed ? "warning" : "success",
                        personalPassed ? "个性化审核通过" : "个性化审核有警告项");
                onlyWarnings = hasWarning;
                break;
            }

            // 审核不通过：定向修订
            finishStep(run, "factual_auditor", "warning", "发现 " + factualReport.path("issues").size() + " 个问题");
            finishStep(run, "personalization_auditor", "warning", "发现 " + personalReport.path("issues").size() + " 个问题");
            revisionNo++;
            if (revisionNo > maxRevision) {
                // 超过最大修订次数：以 warning 固化，避免无限循环
                onlyWarnings = true;
                auditPassed = false;
                break;
            }
            revisionFeedback = "事实审核问题：\n" + json.toJson(factualReport.path("issues"))
                    + "\n个性化审核问题：\n" + json.toJson(personalReport.path("issues"));
        }

        persistSummary(run, session, summaryStructured,
                auditPassed ? (onlyWarnings ? "warning" : "passed") : "warning",
                extractEvidence(validatedEvents));
        updateRun(run, onlyWarnings && !auditPassed ? "completed_with_warning" : "completed");
        notify(run, "run.completed", null);
    }

    // ==================== single-model 模式 ====================

    private void executeSingleModel(AgentRunEntity run, ConversationSessionEntity session,
                                    Map<String, ModelApiProfileEntity> snapshot, boolean thinking)
            throws Exception {
        updateRun(run, "running");
        setStep(run, "single_model", "running", "单模型直接生成摘要");
        String dialogue = renderDialogue(session.getMessagesJson());
        String userPrompt = PromptTemplates.renderDialogue(dialogue);
        if (run.getTargetUserId() != null) {
            userPrompt += "\n目标用户：" + run.getTargetUserId()
                    + "\n用户画像：" + session.getUsersJson();
        }
        JsonNode structured = callAgentJson(run, snapshot, thinking, "single_model",
                PromptTemplates.SINGLE_MODEL_SYSTEM, userPrompt + "\n请输出 JSON。");
        finishStep(run, "single_model", "success", "摘要生成完成");
        setStep(run, "importance_extractor", "running", "按人员抽取原始重要消息");
        JsonNode importance = callAgentJson(run, snapshot, thinking, "importance_extractor",
                PromptTemplates.IMPORTANCE_SYSTEM,
                PromptTemplates.renderDialogue(dialogue) + "\n用户画像：\n" + session.getUsersJson());
        finishStep(run, "importance_extractor", "success",
                "抽取 " + importance.path("importantMessages").size() + " 条重要消息");
        structured = mergeImportantMessages(structured, importance);
        persistSummary(run, session, structured, "not_audited", null);
        updateRun(run, "completed");
        notify(run, "run.completed", null);
    }

    // ==================== 模型调用 ====================

    /** 仅执行模型调用与 JSON 解析，不触碰任何 run/step 状态（并行子任务安全） */
    private JsonNode callModel(Map<String, ModelApiProfileEntity> snapshot, boolean thinking,
                               String agentKey, String system, String userPrompt) throws Exception {
        ModelApiProfileEntity profile = snapshot.get(agentKey);
        GatewayModels.ChatResponse response = gateway.chat(profile,
                new GatewayModels.ChatRequest(system,
                        List.of(new GatewayModels.ChatMessage("user", userPrompt)),
                        0.2, thinking));
        return json.parse(json.extractJsonObject(response.content()));
    }

    /** 串行阶段调用：失败时由主线程同步更新 run/step 状态 */
    private JsonNode callAgentJson(AgentRunEntity run, Map<String, ModelApiProfileEntity> snapshot,
                                   boolean thinking, String agentKey, String system, String userPrompt)
            throws Exception {
        try {
            return callModel(snapshot, thinking, agentKey, system, userPrompt);
        } catch (ModelCallException e) {
            setStep(run, agentKey, "error", e.getMessage());
            updateRun(run, "failed");
            run.setErrorCode("MODEL_CALL_FAILED");
            run.setErrorMessage(truncate(e.getMessage(), 2000));
            runRepository.save(run);
            notify(run, "agent.failed", agentKey);
            throw e;
        }
    }

    /** 只写 step 记录，不触碰共享 run 实体（供并行子任务失败时安全标记） */
    private void markStepError(String runId, String agentKey, String message) {
        stepRepository.findByRunIdAndAgentKey(runId, agentKey).ifPresent(step -> {
            step.setStatus("error");
            step.setFinishedAt(Instant.now());
            step.setShortMessage(truncate(message, 1000));
            stepRepository.save(step);
        });
    }

    /** 并行组失败后由主编排线程统一写 run 失败状态（避免跨线程写共享实体） */
    private void markGroupFailure(AgentRunEntity run, Exception e) {
        Throwable cause = e instanceof ExecutionException && e.getCause() != null ? e.getCause() : e;
        run.setStatus("failed");
        if (cause instanceof ModelCallException) {
            run.setErrorCode("MODEL_CALL_FAILED");
        }
        run.setErrorMessage(truncate(cause.getMessage(), 2000));
        run.setFinishedAt(Instant.now());
        runRepository.save(run);
        notify(run, "run.failed", null);
    }

    // ==================== 持久化与状态工具 ====================

    private void persistSummary(AgentRunEntity run, ConversationSessionEntity session,
                                JsonNode structured, String auditStatus, JsonNode evidence) {
        SummaryResultEntity summary = new SummaryResultEntity();
        summary.setSummaryId(UUID.randomUUID().toString());
        summary.setSessionId(session.getSessionId());
        summary.setRunId(run.getRunId());
        summary.setMode(run.getMode());
        summary.setVersion(nextSummaryVersion(session.getSessionId()));
        summary.setStructuredJson(json.toJson(structured));
        summary.setMarkdown(markdownRenderer.render(structured, run.getMode()));
        summary.setEvidenceLinksJson(evidence == null ? null : json.toJson(evidence));
        summary.setAuditStatus(auditStatus);
        summary.setGeneratedAt(Instant.now());
        summaryRepository.save(summary);

        session.setCurrentSummaryId(summary.getSummaryId());
        sessionRepository.save(session);

        // 新摘要产生后，旧评测记录标记过期（版本已变化）
        evaluationServiceProvider.ifAvailable(evaluation -> {
            try {
                evaluation.markOutdatedForSession(session.getSessionId(), summary.getSummaryId());
            } catch (Exception e) {
                log.warn("标记旧评测过期失败（不影响摘要可用性）: {}", e.getMessage());
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
        com.fasterxml.jackson.databind.node.ObjectNode merged = summary != null && summary.isObject()
                ? ((com.fasterxml.jackson.databind.node.ObjectNode) summary).deepCopy()
                : json.mapper().createObjectNode();
        JsonNode messages = importance == null ? null : importance.path("importantMessages");
        merged.set("importantMessages", messages != null && messages.isArray()
                ? messages.deepCopy() : json.mapper().createArrayNode());
        return merged;
    }

    private JsonNode mergeState(JsonNode events, JsonNode stateResult) {
        Map<String, JsonNode> stateById = new HashMap<>();
        for (JsonNode s : stateResult.path("events")) {
            stateById.put(s.path("eventId").asText(), s);
        }
        var merged = json.mapper().createArrayNode();
        for (JsonNode e : events) {
            var copy = e.deepCopy();
            JsonNode s = stateById.get(e.path("eventId").asText());
            if (s != null) {
                var obj = (com.fasterxml.jackson.databind.node.ObjectNode) copy;
                if (s.hasNonNull("state")) obj.put("state", s.get("state").asText());
                if (s.hasNonNull("owner")) obj.put("owner", s.get("owner").asText());
                if (s.hasNonNull("dueDate")) obj.put("dueDate", s.get("dueDate").asText());
                if (s.hasNonNull("supersedes")) obj.put("supersedes", s.get("supersedes").asText());
            }
            merged.add(copy);
        }
        return merged;
    }

    private JsonNode extractEvidence(JsonNode events) {
        var arr = json.mapper().createArrayNode();
        for (JsonNode e : events) {
            if (e.path("evidenceMessageIds").isArray() && !e.path("evidenceMessageIds").isEmpty()) {
                var link = json.mapper().createObjectNode();
                link.put("eventId", e.path("eventId").asText());
                link.put("content", e.path("content").asText());
                link.set("messageIds", e.path("evidenceMessageIds"));
                arr.add(link);
            }
        }
        return arr;
    }

    private boolean hasSeverity(JsonNode report, String severity) {
        for (JsonNode issue : report.path("issues")) {
            if (severity.equals(issue.path("severity").asText())) {
                return true;
            }
        }
        return false;
    }

    private String buildUserContextInput(ConversationSessionEntity session, String targetUserId) {
        return "目标用户：" + (targetUserId == null ? "（未指定，输出空上下文）" : targetUserId)
                + "\n用户画像：\n" + session.getUsersJson()
                + "\n组织/协作关系：\n" + session.getRelationshipsJson()
                + "\n群成员：" + session.getGroupInfoJson();
    }

    private String renderDialogue(String messagesJson) {
        try {
            JsonNode messages = json.parse(messagesJson);
            StringBuilder sb = new StringBuilder();
            for (JsonNode m : messages) {
                sb.append(m.path("messageId").asText("?"))
                        .append(" | ").append(m.path("timestamp").asText(""))
                        .append(" | ").append(m.path("sender").asText("未知"))
                        .append(": ").append(m.path("content").asText(""))
                        .append('\n');
            }
            return sb.toString();
        } catch (Exception e) {
            return messagesJson == null ? "" : messagesJson;
        }
    }

    private List<Map<String, Object>> buildSnapshotView(Map<String, ModelApiProfileEntity> snapshot) {
        List<Map<String, Object>> view = new ArrayList<>();
        snapshot.forEach((agent, p) -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("agentKey", agent);
            m.put("profileId", p.getProfileId());
            m.put("providerType", p.getProviderType());
            m.put("modelName", p.getModelName());
            m.put("credentialRef", "present"); // 不复制明文密钥
            view.add(m);
        });
        return view;
    }

    private void updateRun(AgentRunEntity run, String status) {
        run.setStatus(status);
        if ("completed".equals(status) || "completed_with_warning".equals(status) || "failed".equals(status)) {
            run.setFinishedAt(Instant.now());
            if ("completed".equals(status)) {
                run.setOverallProgress(100);
            }
        }
        recalcProgress(run);
        runRepository.save(run);
        notify(run, "run.progress", null);
    }

    private void failRun(AgentRunEntity run, String errorCode, String message) {
        run.setStatus("failed");
        if (run.getErrorCode() == null) {
            run.setErrorCode(errorCode);
        }
        if (run.getErrorMessage() == null) {
            run.setErrorMessage(truncate(message, 2000));
        }
        run.setFinishedAt(Instant.now());
        runRepository.save(run);
        notify(run, "run.failed", null);
    }

    private void setStep(AgentRunEntity run, String agentKey, String status, String shortMessage) {
        stepRepository.findByRunIdAndAgentKey(run.getRunId(), agentKey).ifPresent(step -> {
            step.setStatus(status);
            if ("running".equals(status)) {
                step.setStartedAt(Instant.now());
            }
            if (shortMessage != null) {
                step.setShortMessage(truncate(shortMessage, 1000));
            }
            stepRepository.save(step);
        });
        recalcProgress(run);
        notify(run, "agent." + status, agentKey);
    }

    private void finishStep(AgentRunEntity run, String agentKey, String status, String shortMessage) {
        stepRepository.findByRunIdAndAgentKey(run.getRunId(), agentKey).ifPresent(step -> {
            step.setStatus(status);
            step.setFinishedAt(Instant.now());
            step.setShortMessage(truncate(shortMessage, 1000));
            stepRepository.save(step);
        });
        recalcProgress(run);
    }

    private void failSteps(AgentRunEntity run, List<String> agentKeys) {
        for (String key : agentKeys) {
            stepRepository.findByRunIdAndAgentKey(run.getRunId(), key).ifPresent(step -> {
                if (!"success".equals(step.getStatus())) {
                    step.setStatus("error");
                    step.setFinishedAt(Instant.now());
                    stepRepository.save(step);
                }
            });
        }
    }

    private void recalcProgress(AgentRunEntity run) {
        List<AgentStepRunEntity> steps = stepRepository.findByRunIdOrderByStepOrderAsc(run.getRunId());
        int total = steps.stream().mapToInt(s -> STEP_WEIGHT.getOrDefault(s.getAgentKey(), 10)).sum();
        int done = 0;
        for (AgentStepRunEntity s : steps) {
            int w = STEP_WEIGHT.getOrDefault(s.getAgentKey(), 10);
            if ("success".equals(s.getStatus()) || "warning".equals(s.getStatus())) {
                done += w;
            } else if ("running".equals(s.getStatus()) || "revising".equals(s.getStatus())) {
                done += w / 2;
            }
        }
        run.setOverallProgress(total == 0 ? 0 : Math.min(99, done * 100 / total));
        runRepository.save(run);
    }

    private void notify(AgentRunEntity run, String event, String agentKey) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("event", event);
            payload.put("runId", run.getRunId());
            payload.put("agentKey", agentKey);
            payload.put("status", run.getStatus());
            payload.put("overallProgress", run.getOverallProgress());
            payload.put("elapsedMs", run.getStartedAt() == null ? 0
                    : Instant.now().toEpochMilli() - run.getStartedAt().toEpochMilli());
            messaging.convertAndSend("/topic/runs/" + run.getRunId(), payload);
        } catch (Exception e) {
            log.debug("进度推送失败（不影响主流程）: {}", e.getMessage());
        }
    }

    private String truncate(String s, int max) {
        if (s == null) {
            return null;
        }
        return s.length() <= max ? s : s.substring(0, max);
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdownNow();
        parallelGroup.shutdownNow();
    }
}
