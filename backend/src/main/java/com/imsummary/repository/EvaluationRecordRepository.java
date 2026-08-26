package com.imsummary.repository;

import com.imsummary.domain.EvaluationRecordEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface EvaluationRecordRepository extends JpaRepository<EvaluationRecordEntity, String> {

    List<EvaluationRecordEntity> findBySessionIdOrderByEvaluatedAtDesc(String sessionId);

    List<EvaluationRecordEntity> findBySessionIdAndModeOrderByEvaluatedAtDesc(String sessionId, String mode);

    List<EvaluationRecordEntity> findBySummaryId(String summaryId);
}
