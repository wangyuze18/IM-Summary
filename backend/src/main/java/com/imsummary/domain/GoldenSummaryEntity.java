package com.imsummary.domain;

import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

/**
 * 黄金摘要：唯一来源为导入文件携带，不参与生成，只用于评测。
 */
@Data
@Entity
@Table(name = "golden_summary")
public class GoldenSummaryEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String sessionId;

    private int goldenVersion;

    @Column(columnDefinition = "CLOB")
    private String content;

    /** import（当前唯一合法来源） */
    private String source;

    private Instant createdAt;
}
