package com.imsummary.domain;

import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

/**
 * 一次离线群聊分析会话。
 * 消息/用户/关系以 JSON 存储（导入后只读，Demo 级简化）。
 */
@Data
@Entity
@Table(name = "conversation_session")
public class ConversationSessionEntity {

    @Id
    private String sessionId;

    private String title;

    /** 群信息（群名、成员、时间范围等） */
    @Column(columnDefinition = "CLOB")
    private String groupInfoJson;

    /** ChatMessage[] 原文，导入后只读 */
    @Column(columnDefinition = "CLOB")
    private String messagesJson;

    /** UserProfile[] */
    @Column(columnDefinition = "CLOB")
    private String usersJson;

    /** RelationshipEdge[] */
    @Column(columnDefinition = "CLOB")
    private String relationshipsJson;

    private Integer messageCount;

    private Integer memberCount;

    private boolean goldenProvided;

    private String currentSummaryId;

    private String importFileName;

    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
