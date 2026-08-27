package com.imsummary.domain;

import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

/**
 * 评测历史记录：双版本绑定（summaryVersion + goldenVersion），
 * 含模式标识；摘要/黄金摘要更新后旧记录标记过期。不提供自动对比。
 */
@Data
@Entity
@Table(name = "evaluation_record")
public class EvaluationRecordEntity {

    @Id
    private String evaluationId;

    private String sessionId;

    private String summaryId;

    private int summaryVersion;

    private int goldenVersion;

    /** agent-workflow | single-model */
    private String mode;

    /** 评测时使用的模型配置快照（模型名、思考模式开关） */
    @Column(length = 1000)
    private String modelInfo;

    private Double accuracy;

    private Double keyInformationOmissionRate;

    private Double rougeL;

    /** 判官模型综合质量评分（0-100，越高越好）；旧记录可能为 null */
    private Double llmScore;

    private Double importantMessagePrecision;

    private Double importantMessageRecall;

    private boolean outdated;

    private Instant evaluatedAt;
}
