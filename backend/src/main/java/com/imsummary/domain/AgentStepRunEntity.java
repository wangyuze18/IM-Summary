package com.imsummary.domain;

import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

/**
 * 单个 Agent 节点运行状态。
 */
@Data
@Entity
@Table(name = "agent_step_run")
public class AgentStepRunEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String runId;

    /** context_event | state | summary | importance_extractor | factual_auditor | importance_auditor | single_model */
    private String agentKey;

    /** idle | queued | running | success | warning | error | revising */
    private String status;

    private Integer progress;

    @Column(length = 1000)
    private String shortMessage;

    private Instant startedAt;

    private Instant finishedAt;

    private String errorCode;

    private boolean retryable;

    private int stepOrder;
}
