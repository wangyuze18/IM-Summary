package com.imsummary.domain;

import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

/**
 * 一次完整分析运行（agent-workflow 或 single-model）。
 * 状态持久化，桌面端断线后可恢复。
 */
@Data
@Entity
@Table(name = "agent_run")
public class AgentRunEntity {

    @Id
    private String runId;

    private String sessionId;

    /** agent-workflow | single-model */
    private String mode;

    /** queued | running | revising | completed | completed_with_warning | failed | cancelled */
    private String status;

    private Integer overallProgress;

    private Instant startedAt;

    private Instant finishedAt;

    private int revisionNo;

    /** RunModelConfigSnapshot JSON（profileId/modelName/协议/凭据引用，不含明文密钥） */
    @Column(columnDefinition = "CLOB")
    private String modelConfigSnapshotJson;

    private String errorCode;

    @Column(length = 2000)
    private String errorMessage;
}
