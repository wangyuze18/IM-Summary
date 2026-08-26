package com.imsummary.api;

import com.imsummary.service.AnalysisService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** 分析运行接口：启动分析 + 状态查询（WebSocket 的 HTTP 兜底） */
@RestController
public class RunController {

    private final AnalysisService analysisService;

    public RunController(AnalysisService analysisService) {
        this.analysisService = analysisService;
    }

    /** 启动分析：{ "mode": "agent-workflow|single-model", "targetUserId": "可选" } */
    @PostMapping("/api/sessions/{sessionId}/runs")
    public Map<String, Object> startRun(@PathVariable String sessionId,
                                        @RequestBody(required = false) Map<String, String> body) {
        String mode = body == null ? null : body.get("mode");
        String targetUserId = body == null ? null : body.get("targetUserId");
        return analysisService.startRun(sessionId, mode, targetUserId);
    }

    @GetMapping("/api/runs/{runId}")
    public Map<String, Object> runStatus(@PathVariable String runId) {
        return analysisService.getRunStatus(runId);
    }
}
