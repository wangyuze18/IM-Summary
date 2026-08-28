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

    /** structured JSON：摘要主体字段 + importantMessages（原始重要消息） */
    @Column(columnDefinition = "CLOB")
    private String structuredJson;

    /** 证据引用 JSON（仅 agent-workflow 有值） */
    @Column(columnDefinition = "CLOB")
    private String evidenceLinksJson;

    /** 团队模式共享证据账本；基础模式为 null。 */
    @Column(columnDefinition = "CLOB")
    private String eventLedgerJson;

    /** 团队模式最后一轮摘要审核报告。 */
    @Column(columnDefinition = "CLOB")
    private String summaryAuditJson;

    /** 团队模式最后一轮重要消息审核报告。 */
    @Column(columnDefinition = "CLOB")
    private String importanceAuditJson;

    /** passed | warning | not_audited（single-model 模式不审核） */
    private String auditStatus;

    private Instant generatedAt;
}
