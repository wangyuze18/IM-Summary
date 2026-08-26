package com.imsummary.domain;

import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

/**
 * 最终摘要版本。绑定 runId，重新分析产生新 version，旧结果保留。
 */
@Data
@Entity
@Table(name = "summary_result")
public class SummaryResultEntity {

    @Id
    private String summaryId;

    private String sessionId;

    private String runId;

    private int version;

    /** agent-workflow | single-model */
    private String mode;

    @Column(columnDefinition = "CLOB")
    private String markdown;

    /** structured JSON：abstractPoints/decisions/todos/topics/openIssues/keyInfo/personalHighlights */
    @Column(columnDefinition = "CLOB")
    private String structuredJson;

    /** 证据引用 JSON（仅 agent-workflow 有值） */
    @Column(columnDefinition = "CLOB")
    private String evidenceLinksJson;

    /** passed | warning | not_audited（single-model 模式不审核） */
    private String auditStatus;

    private Instant generatedAt;
}
