package com.imsummary.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.imsummary.domain.AgentRunEntity;
import com.imsummary.domain.ConversationSessionEntity;
import com.imsummary.domain.SummaryResultEntity;
import com.imsummary.repository.AgentRunRepository;
import com.imsummary.repository.AgentStepRunRepository;
import com.imsummary.repository.ConversationSessionRepository;
import com.imsummary.repository.EvaluationRecordRepository;
import com.imsummary.repository.GoldenSummaryRepository;
import com.imsummary.repository.SummaryResultRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * 会话服务：列表/搜索、详情、组织关系图（仅当前群成员，缺失关系不推测）。
 */
@Service
public class SessionService {

    private final ConversationSessionRepository sessionRepository;
    private final SummaryResultRepository summaryResultRepository;
    private final AgentRunRepository agentRunRepository;
    private final AgentStepRunRepository agentStepRunRepository;
    private final EvaluationRecordRepository evaluationRecordRepository;
    private final GoldenSummaryRepository goldenSummaryRepository;
    private final JsonHelper json;
    private final MarkdownRenderer markdownRenderer;

    public SessionService(ConversationSessionRepository sessionRepository,
                          SummaryResultRepository summaryResultRepository,
                          AgentRunRepository agentRunRepository,
                          AgentStepRunRepository agentStepRunRepository,
                          EvaluationRecordRepository evaluationRecordRepository,
                          GoldenSummaryRepository goldenSummaryRepository,
                          JsonHelper json,
                          MarkdownRenderer markdownRenderer) {
        this.sessionRepository = sessionRepository;
        this.summaryResultRepository = summaryResultRepository;
        this.agentRunRepository = agentRunRepository;
        this.agentStepRunRepository = agentStepRunRepository;
        this.evaluationRecordRepository = evaluationRecordRepository;
        this.goldenSummaryRepository = goldenSummaryRepository;
        this.json = json;
        this.markdownRenderer = markdownRenderer;
    }

    public List<Map<String, Object>> listSessions(String keyword) {
        List<ConversationSessionEntity> sessions = (keyword == null || keyword.isBlank())
                ? sessionRepository.findAllByOrderByCreatedAtDesc()
                : sessionRepository.findByTitleContainingIgnoreCaseOrderByCreatedAtDesc(keyword);
        return sessions.stream().map(this::toListItem).toList();
    }

    private Map<String, Object> toListItem(ConversationSessionEntity s) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("sessionId", s.getSessionId());
        item.put("title", s.getTitle());
        item.put("messageCount", s.getMessageCount());
        item.put("memberCount", s.getMemberCount());
        item.put("goldenProvided", s.isGoldenProvided());
        item.put("importedAt", s.getCreatedAt());
        item.put("hasSummary", s.getCurrentSummaryId() != null);
        return item;
    }

    public Map<String, Object> getSessionDetail(String sessionId) {
        ConversationSessionEntity s = requireSession(sessionId);
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("sessionId", s.getSessionId());
        detail.put("title", s.getTitle());
        detail.put("group", parseQuiet(s.getGroupInfoJson()));
        detail.put("messages", parseQuiet(s.getMessagesJson()));
        detail.put("users", parseQuiet(s.getUsersJson()));
        detail.put("relationships", parseQuiet(s.getRelationshipsJson()));
        detail.put("goldenProvided", s.isGoldenProvided());
        detail.put("importFileName", s.getImportFileName());
        detail.put("createdAt", s.getCreatedAt());
        return detail;
    }

    /** 组织关系图：只返回当前群成员节点 + 导入提供的关系边，不推测虚构边 */
    public Map<String, Object> getOrganizationGraph(String sessionId) {
        ConversationSessionEntity s = requireSession(sessionId);
        List<Map<String, Object>> nodes = new ArrayList<>();
        List<Map<String, Object>> edges = new ArrayList<>();

        JsonNode users = parseQuiet(s.getUsersJson());
        if (users != null && users.isArray()) {
            for (JsonNode u : users) {
                Map<String, Object> node = new LinkedHashMap<>();
                node.put("userId", u.path("userId").asText(u.path("name").asText()));
                node.put("displayName", u.path("name").asText(u.path("displayName").asText("")));
                node.put("employeeNo", u.path("employeeNo").asText(null));
                node.put("positionCode", u.path("positionCode").asText(null));
                node.put("positionName", u.path("position").asText(null));
                nodes.add(node);
            }
        }
        JsonNode rels = parseQuiet(s.getRelationshipsJson());
        if (rels != null && rels.isArray()) {
            for (JsonNode r : rels) {
                Map<String, Object> edge = new LinkedHashMap<>();
                // 兼容两种键名：标准导入 sourceUserId/targetUserId、数据集格式 source/target
                edge.put("sourceUserId", r.path("sourceUserId").asText(r.path("source").asText(r.path("from").asText())));
                edge.put("targetUserId", r.path("targetUserId").asText(r.path("target").asText(r.path("to").asText())));
                edge.put("relationType", r.path("relationType").asText(r.path("type").asText("")));
                edge.put("direction", r.path("direction").asText("forward"));
                edge.put("label", r.path("label").asText(r.path("relationType").asText("")));
                edge.put("scope", r.path("scope").asText(""));
                edges.add(edge);
            }
        }
        Map<String, Object> graph = new LinkedHashMap<>();
        graph.put("nodes", nodes);
        graph.put("edges", edges);
        return graph;
    }

    /** 黄金摘要内容在线查看（V5.4）：未携带时 goldenProvided=false、content 为 null */
    public Map<String, Object> getGoldenSummary(String sessionId) {
        ConversationSessionEntity s = requireSession(sessionId);
        Map<String, Object> view = new LinkedHashMap<>();
        var golden = goldenSummaryRepository.findTopBySessionIdOrderByGoldenVersionDesc(sessionId);
        if (s.isGoldenProvided() && golden.isPresent()) {
            view.put("goldenProvided", true);
            view.put("goldenVersion", golden.get().getGoldenVersion());
            view.put("content", goldenDisplayContent(golden.get().getContent(),
                    golden.get().getImportantMessagesJson()));
        } else {
            view.put("goldenProvided", false);
            view.put("goldenVersion", null);
            view.put("content", null);
        }
        return view;
    }

    private String goldenDisplayContent(String summaryContent, String importantMessagesJson) {
        if (importantMessagesJson == null || importantMessagesJson.isBlank()) return summaryContent;
        try {
            String importantSection = markdownRenderer.renderImportantMessages(json.parse(importantMessagesJson)).strip();
            if (importantSection.isBlank()) return summaryContent;
            String summary = summaryContent == null ? "" : summaryContent.stripTrailing();
            if (summary.endsWith("---")) summary = summary.substring(0, summary.length() - 3).stripTrailing();
            return summary + "\n\n---\n\n" + importantSection + "\n";
        } catch (Exception ignored) {
            return summaryContent;
        }
    }

    /** 删除会话：事务内级联清理运行/步骤/摘要/评测/黄金摘要，避免孤儿记录 */
    @Transactional
    public void deleteSession(String sessionId) {
        List<String> runIds = agentRunRepository.findBySessionIdOrderByStartedAtDesc(sessionId).stream()
                .map(AgentRunEntity::getRunId).toList();
        if (!runIds.isEmpty()) {
            agentStepRunRepository.deleteByRunIdIn(runIds);
        }
        agentRunRepository.deleteBySessionId(sessionId);
        summaryResultRepository.deleteBySessionId(sessionId);
        evaluationRecordRepository.deleteBySessionId(sessionId);
        goldenSummaryRepository.deleteBySessionId(sessionId);
        sessionRepository.deleteById(sessionId);
    }

    public ConversationSessionEntity requireSession(String sessionId) {
        return sessionRepository.findById(sessionId)
                .orElseThrow(() -> new NoSuchElementException("会话不存在：" + sessionId));
    }

    public Optional<SummaryResultEntity> latestSummary(String sessionId, String mode) {
        List<SummaryResultEntity> list = mode == null
                ? summaryResultRepository.findBySessionIdOrderByVersionDesc(sessionId)
                : summaryResultRepository.findBySessionIdAndModeOrderByVersionDesc(sessionId, mode);
        return list.stream().findFirst();
    }

    private JsonNode parseQuiet(String jsonText) {
        if (jsonText == null || jsonText.isBlank()) {
            return null;
        }
        try {
            return json.parse(jsonText);
        } catch (Exception e) {
            return null;
        }
    }
}
