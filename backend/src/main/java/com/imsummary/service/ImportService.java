package com.imsummary.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
    private final MarkdownRenderer markdownRenderer;
    private final ImportantMessageNormalizer importantMessageNormalizer;

    public ImportService(ConversationSessionRepository sessionRepository,
                         GoldenSummaryRepository goldenSummaryRepository,
                         JsonHelper json,
                         MarkdownRenderer markdownRenderer,
                         ImportantMessageNormalizer importantMessageNormalizer) {
        this.sessionRepository = sessionRepository;
        this.goldenSummaryRepository = goldenSummaryRepository;
        this.json = json;
        this.markdownRenderer = markdownRenderer;
        this.importantMessageNormalizer = importantMessageNormalizer;
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
        // 数据集格式探测与归一化（存在 groundTruth 节点即判定为《数据集格式设计规范 V1.0》样本）
        if (root.has("groundTruth")) {
            JsonNode dsMessages = root.path("messages");
            if (dsMessages.isArray()) {
                for (JsonNode m : dsMessages) {
                    if (m.path("senderDisplayName").asText("").isBlank()) {
                        issues.add(issue("ERROR", "数据集消息缺少 senderDisplayName，无法归一化"));
                        break;
                    }
                }
            }
            JsonNode labeledMessages = root.path("groundTruth").path("importantMessages");
            if (root.path("groundTruth").path("goldenSummary").has("importantMessages")) {
                issues.add(issue("ERROR", "importantMessages 必须与 goldenSummary 并列，不能放在 goldenSummary 内部"));
            }
            validateImportantMessages(labeledMessages, dsMessages, issues);
            if (issues.stream().noneMatch(i -> "ERROR".equals(i.get("level")))) {
                root = normalizeDataset(root);
            } else {
                response.put("status", "validation_failed");
                response.put("validation", issues);
                return response;
            }
        }
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
            issues.add(issue("WARNING", "未提供成员信息，群组成员展示将降级"));
        }
        JsonNode relationships = root.path("relationships");
        if (relationships.isMissingNode() || !relationships.isArray() || relationships.isEmpty()) {
            issues.add(issue("INFO", "未提供组织/协作关系，关系维度不参与相关性判断"));
        }
        JsonNode golden = root.path("goldenSummary");
        JsonNode goldenImportant = golden.path("importantMessages");
        validateImportantMessages(goldenImportant, messages, issues);
        if (golden.isObject() && goldenImportant.isArray()) {
            ((ObjectNode) golden).set("importantMessages", importantMessageNormalizer.normalizeArray(goldenImportant));
            goldenImportant = golden.path("importantMessages");
        }
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
        preview.put("importantMessagesProvided", goldenImportant.isArray());
        preview.put("importantMessageCount", goldenImportant.isArray() ? goldenImportant.size() : 0);
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
        session.setGroupInfoJson(json.toJson(withoutPersonalTarget(root.path("group"))));
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
            JsonNode goldenImportant = root.path("goldenSummary").path("importantMessages");
            golden.setImportantMessagesJson(goldenImportant.isArray()
                    ? json.toJson(goldenImportant) : null);
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

    /**
     * 数据集格式 → 标准导入对象归一化（下游 Agent 编排/前端展示/评测零改动）。
     * scenarioPlan / qualityAudit / groundTruth.eventLedger 属元信息，不进入归一化结果（不入模型上下文）。
     */
    private JsonNode normalizeDataset(JsonNode root) {
        ObjectMapper mapper = json.mapper();
        ObjectNode std = mapper.createObjectNode();
        std.put("schemaVersion", "dataset-v1");

        String groupName = root.path("group").path("groupName").asText("");
        String evalSampleId = root.path("scenarioPlan").path("evalSampleId").asText("");
        ObjectNode session = std.putObject("session");
        session.put("title", evalSampleId.isBlank() ? groupName : groupName + "（" + evalSampleId + "）");
        std.set("group", withoutPersonalTarget(root.path("group")));

        ArrayNode messages = std.putArray("messages");
        for (JsonNode m : root.path("messages")) {
            ObjectNode n = m.deepCopy();
            if (!n.hasNonNull("sender")) {
                n.put("sender", m.path("senderDisplayName").asText(""));
            }
            messages.add(n);
        }

        ArrayNode users = std.putArray("users");
        for (JsonNode u : root.path("users")) {
            ObjectNode n = u.deepCopy();
            if (!n.hasNonNull("name")) {
                n.put("name", u.path("displayName").asText(""));
            }
            if (!n.hasNonNull("position")) {
                n.put("position", u.path("positionName").asText(""));
            }
            users.add(n);
        }

        ArrayNode relationships = std.putArray("relationships");
        for (JsonNode r : root.path("relationships")) {
            ObjectNode n = r.deepCopy();
            if (!n.hasNonNull("sourceUserId")) {
                n.put("sourceUserId", r.path("source").asText(""));
            }
            if (!n.hasNonNull("targetUserId")) {
                n.put("targetUserId", r.path("target").asText(""));
            }
            relationships.add(n);
        }

        JsonNode golden = root.path("groundTruth").path("goldenSummary");
        if (!golden.isMissingNode() && !golden.isNull()) {
            // 黄金摘要与黄金重要消息分开保存，防止 llm_score/ROUGE 被重要消息污染。
            ObjectNode normalizedGolden = std.putObject("goldenSummary");
            ObjectNode summaryOnly = golden.isObject() ? ((ObjectNode) golden).deepCopy() : mapper.createObjectNode();
            summaryOnly.remove("importantMessages");
            normalizedGolden.put("content", markdownRenderer.render(summaryOnly, "golden"));
            JsonNode important = root.path("groundTruth").path("importantMessages");
            if (important.isArray()) {
                normalizedGolden.set("importantMessages", importantMessageNormalizer.normalizeArray(important));
            }
        }
        return std;
    }

    /** 黄金重要消息必须可逐条回指原消息；旧字段不再属于导入契约。 */
    private void validateImportantMessages(JsonNode important, JsonNode messages,
                                           List<Map<String, Object>> issues) {
        if (important == null || important.isMissingNode() || important.isNull()) return;
        if (!important.isArray()) {
            issues.add(issue("ERROR", "groundTruth.importantMessages 必须是数组"));
            return;
        }
        Map<String, JsonNode> sourceById = new HashMap<>();
        if (messages != null && messages.isArray()) {
            for (JsonNode message : messages) {
                sourceById.put(message.path("messageId").asText(""), message);
            }
        }
        int index = 0;
        for (JsonNode item : important) {
            String field = "importantMessages[" + index++ + "]";
            if (!item.isObject()) {
                issues.add(issue("ERROR", field + " 必须是对象"));
                continue;
            }
            for (String removed : List.of("type", "priority", "stakeholders")) {
                if (item.has(removed)) {
                    issues.add(issue("ERROR", field + " 不再支持字段 " + removed));
                }
            }
            String messageId = item.path("messageId").asText("").trim();
            String speaker = item.path("speaker").asText("").trim();
            String content = item.path("content").asText("");
            String reason = item.path("reason").asText("").trim();
            if (messageId.isBlank()) issues.add(issue("ERROR", field + ".messageId 不能为空"));
            if (speaker.isBlank()) issues.add(issue("ERROR", field + ".speaker 不能为空"));
            if (speaker.startsWith("@")) issues.add(issue("ERROR", field + ".speaker 应填写人物本名，不加 @"));
            if (content.isBlank()) issues.add(issue("ERROR", field + ".content 不能为空"));
            if (reason.isBlank()) issues.add(issue("ERROR", field + ".reason 不能为空"));
            JsonNode source = sourceById.get(messageId);
            if (!messageId.isBlank() && source == null) {
                issues.add(issue("ERROR", field + ".messageId 在原消息中不存在：" + messageId));
                continue;
            }
            if (source != null) {
                String sourceSpeaker = source.path("senderDisplayName")
                        .asText(source.path("sender").asText(""));
                sourceSpeaker = importantMessageNormalizer.realName(sourceSpeaker);
                if (!speaker.isBlank() && !speaker.equals(sourceSpeaker)) {
                    issues.add(issue("ERROR", field + ".speaker 必须与原消息发送者本名一致"));
                }
                if (!content.isBlank() && !content.equals(source.path("content").asText(""))) {
                    issues.add(issue("ERROR", field + ".content 必须与原消息原文完全一致"));
                }
            }
        }
    }

    /** 群组元信息只描述群本身；数据集中的评测目标用户不进入会话、界面或模型上下文。 */
    private JsonNode withoutPersonalTarget(JsonNode group) {
        if (!group.isObject()) return group;
        ObjectNode sanitized = ((ObjectNode) group).deepCopy();
        sanitized.remove("targetUser");
        return sanitized;
    }

    /** 惰性清理超过保留时长的待确认导入 */
    private void evictExpired() {
        Instant cutoff = Instant.now().minusSeconds(PENDING_TTL_MINUTES * 60);
        pendingImports.values().removeIf(p -> p.uploadedAt().isBefore(cutoff));
    }
}
