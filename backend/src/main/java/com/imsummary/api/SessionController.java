package com.imsummary.api;

import com.imsummary.service.AnalysisService;
import com.imsummary.service.SessionService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** 会话接口：列表/搜索、详情、组织关系、运行历史、删除 */
@RestController
@RequestMapping("/api/sessions")
public class SessionController {

    private final SessionService sessionService;
    private final AnalysisService analysisService;

    public SessionController(SessionService sessionService, AnalysisService analysisService) {
        this.sessionService = sessionService;
        this.analysisService = analysisService;
    }

    @GetMapping
    public List<Map<String, Object>> list(@RequestParam(required = false) String keyword) {
        return sessionService.listSessions(keyword);
    }

    @GetMapping("/{sessionId}")
    public Map<String, Object> detail(@PathVariable String sessionId) {
        return sessionService.getSessionDetail(sessionId);
    }

    @GetMapping("/{sessionId}/organization")
    public Map<String, Object> organization(@PathVariable String sessionId) {
        return sessionService.getOrganizationGraph(sessionId);
    }

    /** 黄金摘要内容在线查看（V5.4）：仅用于前端对照展示与评测溯源 */
    @GetMapping("/{sessionId}/golden-summary")
    public Map<String, Object> goldenSummary(@PathVariable String sessionId) {
        return sessionService.getGoldenSummary(sessionId);
    }

    @GetMapping("/{sessionId}/runs")
    public List<Map<String, Object>> runs(@PathVariable String sessionId) {
        return analysisService.listRuns(sessionId);
    }

    @DeleteMapping("/{sessionId}")
    public Map<String, Object> delete(@PathVariable String sessionId) {
        sessionService.deleteSession(sessionId);
        return Map.of("deleted", true);
    }
}
