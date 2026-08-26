package com.imsummary.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.imsummary.domain.ConversationSessionEntity;
import com.imsummary.domain.GoldenSummaryEntity;
import com.imsummary.repository.ConversationSessionRepository;
import com.imsummary.repository.GoldenSummaryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 导入服务：上传预检查（结构校验 + 预览）→ 确认导入（创建会话 + 黄金摘要）。
 * 校验分级：ERROR 阻断 / WARNING 允许 / INFO 提示；导入阶段不做业务推断。
 */
@Service
public class ImportService {

    /** 待确认导入的临时存储（Demo 级；重启丢失，符合"未确认不创建会话"语义） */
    private final Map<String, ParsedImport> pendingImports = new ConcurrentHashMap<>();

    /** 待确认导入的保留时长，超时惰性清理，避免只预检不确认的上传永久驻留内存 */
    private static final long PENDING_TTL_MINUTES = 30;

    private final ConversationSessionRepository sessionRepository;
    private final GoldenSummaryRepository goldenSummaryRepository;
    private final JsonHelper json;

    public ImportService(ConversationSessionRepository sessionRepository,
                         GoldenSummaryRepository goldenSummaryRepository,
                         JsonHelper json) {
        this.sessionRepository = sessionRepository;
        this.goldenSummaryRepository = goldenSummaryRepository;
        this.json = json;
    }

    public record ParsedImport(String fileName, JsonNode root, List<Map<String, Object>> validation,
                               Map<String, Object> preview, Instant uploadedAt) {
    }

    /** 预检查上传：解析 + 校验 + 预览，不创建任何业务数据 */
    public Map<String, Object> validate(String fileName, byte[] content) {
        Map<String, Object> response = new LinkedHashMap<>();
        List<Map<String, Object>> issues = new ArrayList<>();
        JsonNode root;
        try {
            root = json.parse(new String(content, java.nio.charset.StandardCharsets.UTF_8));
        } catch (Exception e) {
            issues.add(issue("ERROR", "文件无法解析为 JSON：" + e.getMessage()));
            response.put("status", "validation_failed");
            response.put("validation", issues);
            return response;
        }

        // 结构校验
        JsonNode group = root.path("group");
        JsonNode messages = root.path("messages");
        if (group.isMissingNode() || group.isNull() || !group.hasNonNull("groupName")) {
            issues.add(issue("ERROR", "缺少必需的 group 信息（至少需要 groupName）"));
        }
        if (messages.isMissingNode() || !messages.isArray() || messages.isEmpty()) {
            issues.add(issue("ERROR", "缺少必需的 messages 消息列表"));
        } else {
            Set<String> ids = new HashSet<>();
            for (JsonNode m : messages) {
                String mid = m.path("messageId").asText(null);
                if (mid == null || mid.isBlank()) {
                    issues.add(issue("ERROR", "存在缺少 messageId 的消息，无法追溯"));
                    break;
                }
                if (!ids.add(mid)) {
                    issues.add(issue("ERROR", "messageId 冲突：" + mid));
                    break;
                }
            }
        }
        JsonNode users = root.path("users");
        if (users.isMissingNode() || !users.isArray() || users.isEmpty()) {
            issues.add(issue("WARNING", "未提供用户画像，个性化能力将降级"));
        }
        JsonNode relationships = root.path("relationships");
        if (relationships.isMissingNode() || !relationships.isArray() || relationships.isEmpty()) {
            issues.add(issue("INFO", "未提供组织/协作关系，关系维度不参与相关性判断"));
        }
        JsonNode golden = root.path("goldenSummary");
        boolean goldenProvided = !golden.isMissingNode() && !golden.isNull()
                && !golden.path("content").asText("").isBlank();
        if (!goldenProvided) {
            issues.add(issue("INFO", "未携带黄金摘要，该会话不可评测"));
        }
        if (!root.hasNonNull("session")) {
            issues.add(issue("INFO", "未提供 session 元信息，将使用群名作为会话标题"));
        }

        boolean blocked = issues.stream().anyMatch(i -> "ERROR".equals(i.get("level")));
        if (blocked) {
            response.put("status", "validation_failed");
            response.put("validation", issues);
            return response;
        }

        // 预览
        Map<String, Object> preview = new LinkedHashMap<>();
        preview.put("groupName", group.path("groupName").asText(""));
        preview.put("messageCount", messages.isArray() ? messages.size() : 0);
        preview.put("memberCount", users.isArray() ? users.size()
                : group.path("members").isArray() ? group.path("members").size() : 0);
        preview.put("relationshipCount", relationships.isArray() ? relationships.size() : 0);
        preview.put("goldenProvided", goldenProvided);
        preview.put("title", root.path("session").path("title").asText(group.path("groupName").asText()));

        String importId = UUID.randomUUID().toString();
        evictExpired();
        pendingImports.put(importId, new ParsedImport(fileName, root, issues, preview, Instant.now()));

        response.put("importId", importId);
        response.put("status", "ready_to_confirm");
        response.put("validation", issues);
        response.put("preview", preview);
        return response;
    }

    /** 确认导入：创建 ConversationSession，黄金摘要一并持久化（事务保证两者一致） */
    @Transactional
    public Map<String, Object> confirm(String importId) {
        ParsedImport parsed = pendingImports.remove(importId);
        if (parsed == null) {
            throw new NoSuchElementException("导入记录不存在或已过期：" + importId);
        }
        JsonNode root = parsed.root();

        ConversationSessionEntity session = new ConversationSessionEntity();
        session.setSessionId(UUID.randomUUID().toString());
        session.setTitle((String) parsed.preview().get("title"));
        session.setTargetUserId(root.path("session").path("targetUserId").asText(null));
        session.setGroupInfoJson(json.toJson(root.path("group")));
        session.setMessagesJson(json.toJson(root.path("messages")));
        session.setUsersJson(root.has("users") ? json.toJson(root.path("users")) : "[]");
        session.setRelationshipsJson(root.has("relationships") ? json.toJson(root.path("relationships")) : "[]");
        session.setMessageCount(root.path("messages").isArray() ? root.path("messages").size() : 0);
        session.setMemberCount((Integer) parsed.preview().get("memberCount"));
        session.setGoldenProvided((Boolean) parsed.preview().get("goldenProvided"));
        session.setImportFileName(parsed.fileName());
        sessionRepository.save(session);

        if (session.isGoldenProvided()) {
            GoldenSummaryEntity golden = new GoldenSummaryEntity();
            golden.setSessionId(session.getSessionId());
            golden.setGoldenVersion(1);
            golden.setContent(root.path("goldenSummary").path("content").asText());
            golden.setSource("import");
            golden.setCreatedAt(Instant.now());
            goldenSummaryRepository.save(golden);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("sessionId", session.getSessionId());
        result.put("title", session.getTitle());
        result.put("messageCount", session.getMessageCount());
        result.put("goldenProvided", session.isGoldenProvided());
        return result;
    }

    private Map<String, Object> issue(String level, String message) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("level", level);
        m.put("message", message);
        return m;
    }

    /** 惰性清理超过保留时长的待确认导入 */
    private void evictExpired() {
        Instant cutoff = Instant.now().minusSeconds(PENDING_TTL_MINUTES * 60);
        pendingImports.values().removeIf(p -> p.uploadedAt().isBefore(cutoff));
    }
}
