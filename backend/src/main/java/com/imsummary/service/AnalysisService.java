package com.imsummary.service;

import com.imsummary.agent.AgentOrchestrator;
import com.imsummary.domain.AgentRunEntity;
import com.imsummary.repository.AgentRunRepository;
import com.imsummary.repository.AgentStepRunRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;

/**
 * 运行状态服务：启动分析、查询进度（HTTP 兜底，断线重连可恢复）。
 */
@Service
public class AnalysisService {

    private final AgentOrchestrator orchestrator;
    private final AgentRunRepository runRepository;
    private final AgentStepRunRepository stepRepository;

    public AnalysisService(AgentOrchestrator orchestrator,
                           AgentRunRepository runRepository,
                           AgentStepRunRepository stepRepository) {
        this.orchestrator = orchestrator;
        this.runRepository = runRepository;
        this.stepRepository = stepRepository;
    }

    public Map<String, Object> startRun(String sessionId, String mode) {
        String normalizedMode = "single-model".equals(mode) ? "single-model" : "agent-workflow";
        AgentRunEntity run = orchestrator.startRun(sessionId, normalizedMode);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("runId", run.getRunId());
        result.put("status", run.getStatus());
        result.put("mode", run.getMode());
        return result;
    }

    /** 运行状态（含 overallProgress、elapsedMs、各 Agent 状态）；前端只展示不自行推算 */
    public Map<String, Object> getRunStatus(String runId) {
        AgentRunEntity run = runRepository.findById(runId)
                .orElseThrow(() -> new NoSuchElementException("运行不存在：" + runId));
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("runId", run.getRunId());
        view.put("sessionId", run.getSessionId());
        view.put("mode", run.getMode());
        view.put("status", run.getStatus());
        view.put("overallProgress", run.getOverallProgress());
        long elapsed = run.getStartedAt() == null ? 0
                : (run.getFinishedAt() != null ? run.getFinishedAt() : Instant.now()).toEpochMilli()
                        - run.getStartedAt().toEpochMilli();
        view.put("elapsedMs", elapsed);
        view.put("revisionNo", run.getRevisionNo());
        view.put("errorCode", run.getErrorCode());
        view.put("errorMessage", run.getErrorMessage());
        view.put("modelConfigSnapshot", parseSnapshot(run.getModelConfigSnapshotJson()));
        view.put("agentSteps", stepRepository.findByRunIdOrderByStepOrderAsc(run.getRunId()).stream()
                .map(s -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("agentKey", s.getAgentKey());
                    m.put("status", s.getStatus());
                    m.put("shortMessage", s.getShortMessage());
                    m.put("startedAt", s.getStartedAt());
                    m.put("finishedAt", s.getFinishedAt());
                    m.put("retryable", s.isRetryable());
                    return m;
                }).toList());
        return view;
    }

    public List<Map<String, Object>> listRuns(String sessionId) {
        return runRepository.findBySessionIdOrderByStartedAtDesc(sessionId).stream()
                .map(r -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("runId", r.getRunId());
                    m.put("mode", r.getMode());
                    m.put("status", r.getStatus());
                    m.put("startedAt", r.getStartedAt());
                    m.put("finishedAt", r.getFinishedAt());
                    return m;
                }).toList();
    }

    private Object parseSnapshot(String jsonText) {
        if (jsonText == null || jsonText.isBlank()) {
            return List.of();
        }
        try {
            return new JsonHelper().parse(jsonText);
        } catch (Exception e) {
            return List.of();
        }
    }
}
